import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import {
	addApprovedClient,
	bindStateToSession,
	createOAuthState,
	generateCSRFProtection,
	isClientApproved,
	OAuthError,
	renderApprovalDialog,
	sanitizeText,
	validateCSRFToken,
	validateOAuthState,
} from "./workers-oauth-utils";
import type { Props } from "./utils";

// Identity + delegated Graph access. Outlook tools call Graph as whichever user is
// signed in (via their own access/refresh token), not via a fixed-mailbox app-only
// credential — Mail.Send/Mail.ReadWrite/Calendars.ReadWrite grant that. BossHub,
// Verkada, and Nexudus use their own separate API credentials, unaffected by this.
//
// Security note: we use the tenant-specific endpoint (not /common/) so that only
// accounts from our Azure tenant can authenticate. This prevents nOAuth spoofing,
// where an attacker in another tenant creates an account whose `mail` field matches
// a whitelisted email address. The MS_TENANT_ID env var controls which tenant is
// trusted; identity is read from the signed ID token, not from the /me endpoint.
const MS_SCOPES = "offline_access openid profile email Mail.Send Mail.ReadWrite Calendars.ReadWrite";

function msAuthUrl(tenantId: string) {
	return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`;
}
function msTokenUrl(tenantId: string) {
	return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
}

// Parse JWT payload without signature verification. Safe here because the token
// was received directly from Microsoft's token endpoint using our client_secret
// over HTTPS — it was never handed to us by a third party.
function parseJwtPayload(token: string): Record<string, unknown> {
	try {
		const parts = token.split(".");
		if (parts.length < 2) return {};
		const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
		return JSON.parse(atob(payload));
	} catch {
		return {};
	}
}

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

function buildMicrosoftAuthUrl(request: Request, stateToken: string, clientId: string, tenantId: string): string {
	const url = new URL(msAuthUrl(tenantId));
	url.searchParams.set("client_id", clientId);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("redirect_uri", new URL("/callback", request.url).href);
	url.searchParams.set("scope", MS_SCOPES);
	url.searchParams.set("state", stateToken);
	url.searchParams.set("response_mode", "query");
	url.searchParams.set("prompt", "select_account");
	return url.href;
}

function redirectToMicrosoft(request: Request, stateToken: string, clientId: string, tenantId: string, cookies: string[]) {
	const response = new Response(null, {
		headers: { location: buildMicrosoftAuthUrl(request, stateToken, clientId, tenantId) },
		status: 302,
	});
	for (const cookie of cookies) {
		response.headers.append("Set-Cookie", cookie);
	}
	return response;
}

app.get("/authorize", async (c) => {
	const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
	const { clientId } = oauthReqInfo;
	if (!clientId) return c.text("Invalid request", 400);

	if (await isClientApproved(c.req.raw, clientId, c.env.COOKIE_ENCRYPTION_KEY)) {
		const { stateToken } = await createOAuthState(oauthReqInfo, c.env.OAUTH_KV);
		const { setCookie } = await bindStateToSession(stateToken);
		return redirectToMicrosoft(c.req.raw, stateToken, c.env.MS_CLIENT_ID, c.env.MS_TENANT_ID, [setCookie]);
	}

	const { token: csrfToken, setCookie } = generateCSRFProtection();
	return renderApprovalDialog(c.req.raw, {
		client: await c.env.OAUTH_PROVIDER.lookupClient(clientId),
		csrfToken,
		server: {
			description:
				"sp-ARK Labs Operations MCP server. Sign in with your Microsoft account to access member onboarding tools.",
			logo: "https://avatars.githubusercontent.com/u/314135?s=200&v=4",
			name: "sp-ARK Operations",
		},
		setCookie,
		state: { oauthReqInfo },
	});
});

app.post("/authorize", async (c) => {
	try {
		const formData = await c.req.raw.formData();
		validateCSRFToken(formData, c.req.raw);

		const encodedState = formData.get("state");
		if (!encodedState || typeof encodedState !== "string") return c.text("Missing state", 400);

		let state: { oauthReqInfo?: AuthRequest };
		try {
			state = JSON.parse(atob(encodedState));
		} catch {
			return c.text("Invalid state data", 400);
		}

		if (!state.oauthReqInfo?.clientId) return c.text("Invalid request", 400);

		const approvedCookie = await addApprovedClient(
			c.req.raw,
			state.oauthReqInfo.clientId,
			c.env.COOKIE_ENCRYPTION_KEY,
		);
		const { stateToken } = await createOAuthState(state.oauthReqInfo, c.env.OAUTH_KV);
		const { setCookie: sessionCookie } = await bindStateToSession(stateToken);

		return redirectToMicrosoft(c.req.raw, stateToken, c.env.MS_CLIENT_ID, c.env.MS_TENANT_ID, [approvedCookie, sessionCookie]);
	} catch (error: any) {
		if (error instanceof OAuthError) return error.toResponse();
		return c.text(`Internal server error: ${error.message}`, 500);
	}
});

app.get("/callback", async (c) => {
	let oauthReqInfo: AuthRequest;
	let clearSessionCookie: string;

	try {
		const result = await validateOAuthState(c.req.raw, c.env.OAUTH_KV);
		oauthReqInfo = result.oauthReqInfo;
		clearSessionCookie = result.clearCookie;
	} catch (error: any) {
		if (error instanceof OAuthError) return error.toResponse();
		return c.text("Internal server error", 500);
	}

	if (!oauthReqInfo.clientId) return c.text("Invalid OAuth request data", 400);

	const code = c.req.query("code");
	if (!code) return c.text("Missing authorization code", 400);

	const tokenParams = new URLSearchParams({
		grant_type: "authorization_code",
		client_id: c.env.MS_CLIENT_ID,
		client_secret: c.env.MS_CLIENT_SECRET,
		code,
		redirect_uri: new URL("/callback", c.req.url).href,
		scope: MS_SCOPES,
	});

	const tokenResponse = await fetch(msTokenUrl(c.env.MS_TENANT_ID), {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: tokenParams.toString(),
	});
	const tokenBody: any = await tokenResponse.json().catch(() => ({}));
	if (!tokenResponse.ok || !tokenBody.access_token) {
		return c.text(`Microsoft token exchange failed: ${JSON.stringify(tokenBody)}`, 500);
	}

	const { access_token, refresh_token, expires_in, id_token } = tokenBody;
	const tokenExpiresAt = Date.now() + ((expires_in ?? 3600) - 60) * 1000;

	// Read identity from the ID token, not from /me. The token was received directly
	// from our tenant-specific endpoint using our client_secret, so the claims are
	// authoritative. Using /me with /common/ is the nOAuth attack vector.
	const idClaims = parseJwtPayload(id_token || "");
	const tid = idClaims.tid as string | undefined;

	// Belt-and-suspenders: confirm the token's tenant matches the one we redirected to.
	if (!tid || tid !== c.env.MS_TENANT_ID) {
		return c.text("Access denied: Microsoft account is not from the authorized tenant.", 403);
	}

	const email = ((idClaims.preferred_username || idClaims.email || "") as string).toLowerCase();
	const name = (idClaims.name || email) as string;

	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		metadata: { label: name },
		props: {
			accessToken: access_token,
			refreshToken: refresh_token || "",
			tokenExpiresAt,
			email,
			name,
		} as Props,
		request: oauthReqInfo,
		scope: oauthReqInfo.scope,
		userId: email,
	});

	const headers = new Headers({ Location: redirectTo });
	if (clearSessionCookie) headers.set("Set-Cookie", clearSessionCookie);
	return new Response(null, { status: 302, headers });
});

// ─── Vault-credential minting (no local script needed) ───────────────────────
// Runs the exact same /authorize -> Microsoft -> /callback flow the real MCP
// connector uses above, but with the "MCP client" role played by these routes
// instead of an external app — so the final redirect lands back on this same
// origin instead of a localhost listener a script has to run. Lets anyone
// (Becca included) mint a Managed Agents vault credential from just a
// browser — no Node, no git, no local script. Replaces the old
// ceo-tools/inbox-agent/mint-vault-credential.mjs approach, which only worked
// because the script and the signing-in browser had to be the same machine.
//
// Security note: reachable by anyone who can complete Microsoft sign-in in
// the sp-ARK tenant — identical exposure to the /authorize connector flow
// above, since ALLOWED_EMAILS is enforced later inside OperationsMCP.init(),
// not at the OAuth layer. A non-allowlisted tenant member can mint a
// valid-looking credential that yields zero tools when actually used.

function base64UrlEncode(bytes: Uint8Array): string {
	let str = "";
	for (const b of bytes) str += String.fromCharCode(b);
	return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generatePkceVerifier(): string {
	return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

async function pkceChallengeFromVerifier(verifier: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
	return base64UrlEncode(new Uint8Array(digest));
}

app.get("/mint-credential", (c) => {
	const host = sanitizeText(new URL(c.req.url).host);
	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Get an MCP vault credential</title>
<style>
	body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; max-width: 480px; margin: 64px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.5; }
	h1 { font-size: 20px; }
	p { color: #444; }
	a.btn { display: inline-block; margin-top: 16px; padding: 12px 20px; border-radius: 8px; background: #0078d4; color: #fff; text-decoration: none; font-weight: 600; }
</style>
</head>
<body>
	<h1>Get an MCP vault credential</h1>
	<p>This signs you in with your Microsoft account and gives you a credential that lets a scheduled Claude agent act on your behalf against this server (${host}). You'll get a block of values to paste into the agent's vault setup — copy them and close the tab afterward.</p>
	<a class="btn" href="/mint-credential/start">Sign in with Microsoft</a>
</body>
</html>`;
	return c.html(html);
});

app.get("/mint-credential/start", async (c) => {
	const origin = new URL(c.req.url).origin;
	const redirectUri = `${origin}/mint-credential/callback`;

	const regRes = await c.env.SELF.fetch(`${origin}/register`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			redirect_uris: [redirectUri],
			client_name: "Vault Credential Minter",
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			token_endpoint_auth_method: "none",
		}),
	});
	const regText = await regRes.text();
	let regBody: any = {};
	try {
		regBody = JSON.parse(regText);
	} catch {}
	if (!regRes.ok || !regBody.client_id) {
		return c.text(`Registration failed: status=${regRes.status} body=${regText}`, 500);
	}
	const clientId = regBody.client_id as string;

	const verifier = generatePkceVerifier();
	const challenge = await pkceChallengeFromVerifier(verifier);
	const state = crypto.randomUUID();

	await c.env.OAUTH_KV.put(
		`mint:state:${state}`,
		JSON.stringify({ client_id: clientId, verifier }),
		{ expirationTtl: 600 },
	);

	const authUrl = new URL(`${origin}/authorize`);
	authUrl.searchParams.set("response_type", "code");
	authUrl.searchParams.set("client_id", clientId);
	authUrl.searchParams.set("redirect_uri", redirectUri);
	authUrl.searchParams.set("state", state);
	authUrl.searchParams.set("code_challenge", challenge);
	authUrl.searchParams.set("code_challenge_method", "S256");

	return c.redirect(authUrl.toString(), 302);
});

app.get("/mint-credential/callback", async (c) => {
	const origin = new URL(c.req.url).origin;
	const code = c.req.query("code");
	const state = c.req.query("state");
	if (!code || !state) return c.text("Missing code or state.", 400);

	const storedJson = await c.env.OAUTH_KV.get(`mint:state:${state}`);
	if (!storedJson) {
		return c.text("This link expired or was already used — start over at /mint-credential.", 400);
	}
	await c.env.OAUTH_KV.delete(`mint:state:${state}`);
	const { client_id: clientId, verifier } = JSON.parse(storedJson) as {
		client_id: string;
		verifier: string;
	};

	const redirectUri = `${origin}/mint-credential/callback`;
	const tokenRes = await c.env.SELF.fetch(`${origin}/token`, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			code,
			redirect_uri: redirectUri,
			client_id: clientId,
			code_verifier: verifier,
		}),
	});
	const tok: any = await tokenRes.json().catch(() => ({}));
	if (!tokenRes.ok || !tok.access_token) {
		return c.text(`Token exchange failed: ${JSON.stringify(tok)}`, 500);
	}

	const expiresAt = new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString();
	const credentialBlock = `mcp_server_url: ${origin}/mcp
access_token: "${tok.access_token}"
expires_at: "${expiresAt}"
refresh_token: "${tok.refresh_token || ""}"
client_id: "${clientId}"
token_endpoint: ${origin}/token`;

	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Your MCP vault credential</title>
<style>
	body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; max-width: 560px; margin: 48px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.5; }
	h1 { font-size: 20px; }
	.warn { background: #fff4e5; border: 1px solid #f5c26b; border-radius: 8px; padding: 12px 16px; margin: 16px 0; font-size: 14px; }
	pre { background: #1e1e1e; color: #e6e6e6; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 13px; white-space: pre-wrap; word-break: break-all; }
	button { margin-top: 12px; padding: 10px 18px; border-radius: 8px; border: none; background: #0078d4; color: #fff; font-weight: 600; cursor: pointer; }
</style>
</head>
<body>
	<h1>Your MCP vault credential</h1>
	<div class="warn">These values are sensitive — anyone with them can act as you against this server. Copy them into the vault credential setup now, then close this tab.</div>
	<pre id="cred">${sanitizeText(credentialBlock)}</pre>
	<button onclick="navigator.clipboard.writeText(document.getElementById('cred').textContent)">Copy to clipboard</button>
</body>
</html>`;

	return c.html(html, 200, { "Cache-Control": "no-store" });
});

// Public, unauthenticated calendar-link routes. Microsoft Graph has no endpoint
// that exports a single event as iCalendar, so outlook_create_event/search_events/
// update_event (see index.ts's buildAddToCalendarUrl/normalizeEvent) build a link
// here from fields they already have. No Graph call happens on either route below —
// they just render whatever the query string says, which is why start/end are
// validated strictly (they're interpolated into the .ics body unescaped) before use.
const ICS_TIMESTAMP_RE = /^\d{8}T\d{6}Z$/;

function icsEscapeText(value: string): string {
	return value
		.replace(/\r\n|\r|\n/g, "\\n")
		.replace(/\\/g, "\\\\")
		.replace(/;/g, "\\;")
		.replace(/,/g, "\\,");
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

// "20260716T193000Z" -> "2026-07-16T19:30:00Z" (Outlook's web deep link wants dashes/colons).
function icsStampToIso(stamp: string): string {
	const m = stamp.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
	if (!m) return stamp;
	const [, y, mo, d, h, mi, s] = m;
	return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
}

app.get("/ics", (c) => {
	const subject = c.req.query("subject") || "Event";
	const start = c.req.query("start") || "";
	const end = c.req.query("end") || "";
	const location = c.req.query("location");
	const uid = c.req.query("uid") || crypto.randomUUID();

	if (!ICS_TIMESTAMP_RE.test(start) || !ICS_TIMESTAMP_RE.test(end)) {
		return c.text("start and end must be UTC timestamps like 20260720T140000Z", 400);
	}

	const dtstamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
	const lines = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//sp-ARK Labs//Operations MCP//EN",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		"BEGIN:VEVENT",
		`UID:${icsEscapeText(uid)}@sp-ark-labs.com`,
		`DTSTAMP:${dtstamp}`,
		`DTSTART:${start}`,
		`DTEND:${end}`,
		`SUMMARY:${icsEscapeText(subject)}`,
		...(location ? [`LOCATION:${icsEscapeText(location)}`] : []),
		"END:VEVENT",
		"END:VCALENDAR",
	];

	return c.body(lines.join("\r\n"), 200, {
		"content-type": "text/calendar; charset=utf-8",
		"content-disposition": 'attachment; filename="event.ics"',
	});
});

// Landing page version of /ics: a normal webpage (not a file download) with
// Google Calendar / Outlook / .ics buttons, so a link dropped into Slack lets
// each recipient pick their own calendar app instead of silently downloading a file.
app.get("/add-to-calendar", (c) => {
	const subject = c.req.query("subject") || "Event";
	const start = c.req.query("start") || "";
	const end = c.req.query("end") || "";
	const location = c.req.query("location") || "";
	const uid = c.req.query("uid") || "";

	if (!ICS_TIMESTAMP_RE.test(start) || !ICS_TIMESTAMP_RE.test(end)) {
		return c.text("start and end must be UTC timestamps like 20260720T140000Z", 400);
	}

	const icsParams = new URLSearchParams({ subject, start, end });
	if (location) icsParams.set("location", location);
	if (uid) icsParams.set("uid", uid);
	const icsDownloadUrl = `/ics?${icsParams.toString()}`;

	const googleParams = new URLSearchParams({ action: "TEMPLATE", text: subject, dates: `${start}/${end}` });
	if (location) googleParams.set("location", location);
	const googleUrl = `https://calendar.google.com/calendar/render?${googleParams.toString()}`;

	const outlookParams = new URLSearchParams({
		path: "/calendar/action/compose",
		rru: "addevent",
		subject,
		startdt: icsStampToIso(start),
		enddt: icsStampToIso(end),
		allday: "false",
	});
	if (location) outlookParams.set("location", location);
	const outlookUrl = `https://outlook.office.com/calendar/0/deeplink/compose?${outlookParams.toString()}`;

	const safeSubject = escapeHtml(subject);
	const safeLocation = escapeHtml(location);

	const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeSubject}</title>
<style>
	body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; max-width: 420px; margin: 48px auto; padding: 0 20px; color: #1a1a1a; }
	h1 { font-size: 20px; margin-bottom: 4px; }
	p.meta { color: #555; margin-top: 0; }
	a.btn { display: block; text-align: center; padding: 12px; margin: 10px 0; border-radius: 8px; text-decoration: none; font-weight: 600; }
	a.google { background: #4285f4; color: #fff; }
	a.outlook { background: #0078d4; color: #fff; }
	a.ics { background: #eee; color: #1a1a1a; border: 1px solid #ccc; }
</style>
</head>
<body>
	<h1>${safeSubject}</h1>
	${safeLocation ? `<p class="meta">${safeLocation}</p>` : ""}
	<p>Add this event to your calendar:</p>
	<a class="btn google" href="${googleUrl}" target="_blank" rel="noopener">Google Calendar</a>
	<a class="btn outlook" href="${outlookUrl}" target="_blank" rel="noopener">Outlook</a>
	<a class="btn ics" href="${icsDownloadUrl}">Apple Calendar / Download .ics</a>
</body>
</html>`;

	return c.html(html);
});

export { app as MicrosoftHandler };
