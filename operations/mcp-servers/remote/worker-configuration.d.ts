// Global Env type shared by index.ts and github-handler.ts.
// Bindings + vars come from wrangler.jsonc; secrets are set with `wrangler secret put`.
declare namespace Cloudflare {
	interface Env {
		// Bindings
		MCP_OBJECT: DurableObjectNamespace;
		OAUTH_KV: KVNamespace;
		// OAuth secrets
		GITHUB_CLIENT_ID: string;
		GITHUB_CLIENT_SECRET: string;
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
	}
}

interface Env extends Cloudflare.Env {}
