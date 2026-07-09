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

export { app as MicrosoftHandler };
