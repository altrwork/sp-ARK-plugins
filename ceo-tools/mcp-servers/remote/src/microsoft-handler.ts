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

const MS_SCOPES =
	"offline_access openid profile Files.ReadWrite Sites.Read.All Mail.ReadWrite Mail.Send";
const MS_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

function redirectToMicrosoft(
	request: Request,
	stateToken: string,
	clientId: string,
	extraHeaders: Record<string, string> = {},
) {
	const url = new URL(MS_AUTH_URL);
	url.searchParams.set("client_id", clientId);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("redirect_uri", new URL("/callback", request.url).href);
	url.searchParams.set("scope", MS_SCOPES);
	url.searchParams.set("state", stateToken);
	url.searchParams.set("response_mode", "query");
	return new Response(null, {
		headers: { ...extraHeaders, location: url.href },
		status: 302,
	});
}

app.get("/authorize", async (c) => {
	const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
	const { clientId } = oauthReqInfo;
	if (!clientId) return c.text("Invalid request", 400);

	if (await isClientApproved(c.req.raw, clientId, c.env.COOKIE_ENCRYPTION_KEY)) {
		const { stateToken } = await createOAuthState(oauthReqInfo, c.env.OAUTH_KV);
		const { setCookie } = await bindStateToSession(stateToken);
		return redirectToMicrosoft(c.req.raw, stateToken, c.env.MS_CLIENT_ID, { "Set-Cookie": setCookie });
	}

	const { token: csrfToken, setCookie } = generateCSRFProtection();
	return renderApprovalDialog(c.req.raw, {
		client: await c.env.OAUTH_PROVIDER.lookupClient(clientId),
		csrfToken,
		server: {
			description:
				"sp-ARK Labs CEO Tools MCP server. Sign in with your Microsoft account to access Excel and Outlook.",
			logo: "https://avatars.githubusercontent.com/u/314135?s=200&v=4",
			name: "sp-ARK CEO Tools",
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

		const headers = new Headers();
		headers.append("Set-Cookie", approvedCookie);
		headers.append("Set-Cookie", sessionCookie);

		return redirectToMicrosoft(
			c.req.raw,
			stateToken,
			c.env.MS_CLIENT_ID,
			Object.fromEntries(headers),
		);
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

	// Exchange code for tokens. Microsoft returns JSON, not form-encoded.
	const tokenParams = new URLSearchParams({
		grant_type: "authorization_code",
		client_id: c.env.MS_CLIENT_ID,
		client_secret: c.env.MS_CLIENT_SECRET,
		code,
		redirect_uri: new URL("/callback", c.req.url).href,
		scope: MS_SCOPES,
	});

	const tokenResponse = await fetch(MS_TOKEN_URL, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: tokenParams.toString(),
	});
	const tokenBody: any = await tokenResponse.json().catch(() => ({}));
	if (!tokenResponse.ok || !tokenBody.access_token) {
		return c.text(`Microsoft token exchange failed: ${JSON.stringify(tokenBody)}`, 500);
	}

	const { access_token, refresh_token, expires_in } = tokenBody;
	const tokenExpiresAt = Date.now() + ((expires_in ?? 3600) - 60) * 1000;

	// Fetch user profile from Graph
	const meResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
		headers: { authorization: `Bearer ${access_token}`, accept: "application/json" },
	});
	const me: any = await meResponse.json().catch(() => ({}));
	const email = me.mail || me.userPrincipalName || "";
	const name = me.displayName || email;

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
