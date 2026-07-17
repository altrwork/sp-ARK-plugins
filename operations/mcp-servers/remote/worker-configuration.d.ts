// Global Env type shared by index.ts and microsoft-handler.ts.
// Bindings + vars come from wrangler.jsonc; secrets are set with `wrangler secret put`.
declare namespace Cloudflare {
	interface Env {
		// Bindings
		MCP_OBJECT: DurableObjectNamespace;
		OAUTH_KV: KVNamespace;
		// Self-referencing service binding — see wrangler.jsonc comment. Used by
		// /mint-credential to call this same worker's /register and /token routes
		// internally (a plain fetch() to the worker's own public URL is blocked by
		// Cloudflare error 1042).
		SELF: Fetcher;
		// OAuth + encryption secrets
		COOKIE_ENCRYPTION_KEY: string;
		// Upstream API secrets
		BOSSHUB_ACCESS_TOKEN: string;
		VERKADA_API_KEY: string;
		NEXUDUS_ACCESS_TOKEN: string;
		// Non-secret vars
		BOSSHUB_API_BASE_URL: string;
		BOSSHUB_LOCATION_ID: string;
		BOSSHUB_FORM_ID: string;
		BOSSHUB_API_VERSION: string;
		VERKADA_REGION: string;
		VERKADA_DEFAULT_ACCESS_GROUP_ID: string;
		VERKADA_DRY_RUN: string;
		NEXUDUS_API_BASE_URL: string;
		NEXUDUS_BUSINESS_ID: string;
		NEXUDUS_DRY_RUN: string;
		// Optional Nexudus credential alternatives
		NEXUDUS_USERNAME?: string;
		NEXUDUS_PASSWORD?: string;
		NEXUDUS_TOTP?: string;
		// Microsoft Graph (Outlook drafts) — secret: MS_CLIENT_SECRET, vars: the rest
		MS_TENANT_ID: string;
		MS_CLIENT_ID: string;
		MS_CLIENT_SECRET: string;
		MS_SENDER_EMAIL: string;
	}
}

interface Env extends Cloudflare.Env {}
