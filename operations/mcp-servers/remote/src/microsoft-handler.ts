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
