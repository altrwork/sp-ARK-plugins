#!/usr/bin/env node
// One-time helper: completes the sp-ark-operations-mcp worker's OWN OAuth flow
// (as an MCP client would) to mint an access_token + refresh_token pair for the
// Managed Agents vault. This is separate from — and not satisfied by — connecting
// the worker as a custom connector in claude.ai, which holds its own tokens
// internally that we can't read out.
//
// Run: node mint-vault-credential.mjs
// Then open the printed URL and sign in as brownr@sp-ark-labs.com (Becca) — she
// must already be in ALLOWED_EMAILS on the operations worker (she is).

import crypto from "node:crypto";
import http from "node:http";

const WORKER_URL = "https://sp-ark-operations-mcp.jarred-823.workers.dev";
const REDIRECT_URI = "http://localhost:8976/callback";

function b64url(buf) {
	return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function main() {
	// 1. Dynamic client registration (RFC 7591 — public client, PKCE)
	const regRes = await fetch(`${WORKER_URL}/register`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			redirect_uris: [REDIRECT_URI],
			client_name: "inbox-agent-test-vault-setup",
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			token_endpoint_auth_method: "none",
		}),
	});
	if (!regRes.ok) {
		console.error("Registration failed:", regRes.status, await regRes.text());
		process.exit(1);
	}
	const reg = await regRes.json();
	console.log("Registered client:", reg.client_id);

	// 2. PKCE
	const verifier = b64url(crypto.randomBytes(32));
	const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
	const state = b64url(crypto.randomBytes(16));

	const authUrl = new URL(`${WORKER_URL}/authorize`);
	authUrl.searchParams.set("response_type", "code");
	authUrl.searchParams.set("client_id", reg.client_id);
	authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
	authUrl.searchParams.set("state", state);
	authUrl.searchParams.set("code_challenge", challenge);
	authUrl.searchParams.set("code_challenge_method", "S256");

	console.log("\nOpen this URL and sign in as schroffr@sp-ark-labs.com:\n");
	console.log(authUrl.toString());
	console.log("\nWaiting for the callback on http://localhost:8976/callback ...");

	// 3. Local listener to catch the redirect
	const code = await new Promise((resolve, reject) => {
		const server = http.createServer((req, res) => {
			const url = new URL(req.url, REDIRECT_URI);
			if (url.pathname !== "/callback") {
				res.writeHead(404).end();
				return;
			}
			const returnedState = url.searchParams.get("state");
			const authCode = url.searchParams.get("code");
			const error = url.searchParams.get("error");
			res.writeHead(200, { "content-type": "text/html" });
			res.end(error ? `<h1>Error: ${error}</h1>` : "<h1>Done — you can close this tab.</h1>");
			server.close();
			if (error) return reject(new Error(error));
			if (returnedState !== state) return reject(new Error("state mismatch"));
			resolve(authCode);
		});
		server.listen(8976);
	});

	console.log("Got authorization code, exchanging for tokens...");

	// 4. Token exchange
	const tokRes = await fetch(`${WORKER_URL}/token`, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			code,
			redirect_uri: REDIRECT_URI,
			client_id: reg.client_id,
			code_verifier: verifier,
		}),
	});
	if (!tokRes.ok) {
		console.error("Token exchange failed:", tokRes.status, await tokRes.text());
		process.exit(1);
	}
	const tok = await tokRes.json();

	console.log("\n=== Vault credential values ===");
	console.log("mcp_server_url:", `${WORKER_URL}/mcp`);
	console.log("access_token:", tok.access_token);
	console.log("refresh_token:", tok.refresh_token);
	console.log(
		"expires_at:",
		new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
	);
	console.log("client_id:", reg.client_id);
	console.log("token_endpoint:", `${WORKER_URL}/token`);
	console.log("token_endpoint_auth: { type: none }");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
