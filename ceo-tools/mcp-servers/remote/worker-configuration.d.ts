// Global Env type shared by index.ts and microsoft-handler.ts.
// Bindings + vars come from wrangler.jsonc; secrets are set with `wrangler secret put`.
declare namespace Cloudflare {
	interface Env {
		// Bindings
		MCP_OBJECT: DurableObjectNamespace;
		OAUTH_KV: KVNamespace;
		// OAuth secrets (wrangler secret put)
		MS_CLIENT_SECRET: string;
		COOKIE_ENCRYPTION_KEY: string;
		// Non-secret vars (wrangler.jsonc vars)
		MS_CLIENT_ID: string;
		MS_TENANT_ID: string;
		MS_SENDER_EMAIL: string;
	}
}

interface Env extends Cloudflare.Env {}
