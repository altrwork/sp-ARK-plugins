import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import { GitHubHandler } from "./github-handler";
import type { Props } from "./utils";

// ─── Access control ──────────────────────────────────────────────────────────────
// Only these GitHub usernames can use the onboarding tools. Anyone else can log in
// but will see no tools. These write to building access + member systems, so keep
// this list tight. Edit and redeploy to add/remove people.
const ALLOWED_USERNAMES = new Set<string>([
	"JarredR092699",
	"edwin727",
]);

// ─── Shared helpers ─────────────────────────────────────────────────────────────

function blocked(reason: string, details: Record<string, unknown> = {}) {
	return { status: "blocked", reason, ...details };
}

function ok(data: Record<string, unknown>) {
	return { status: "ok", ...data };
}

function jsonResponse(payload: unknown) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
	};
}

// ─── BossHub field mapping ───────────────────────────────────────────────────────

const fieldMap: Record<string, string> = {
	first_name: "first_name",
	last_name: "last_name",
	title_role: "s0JIvAXj17YVoH2YBhu4",
	email: "email",
	phone: "phone",
	company_name: "SveMFZmkJfqyiqQIuAKL",
	website_social: "4VSRVlLjJvw7QgE3rqMf",
	category: "6P4EuLNRzjcwKiWSMkjq",
	company_overview: "eYDFtLOlNYZ5fsVuBT9B",
	company_stage: "EDPm7rHgeLahGflz85CL",
	customers: "P7cqCF9XwFSOl7toHITp",
	capital_raised: "lppKMNd3RbRjqnGD5sq9",
	notable_investors: "RVE6Mkvx52yidicLQZXF",
	team_size: "jXa8AJG6up3Hr1GGHSJA",
	additional_workspace_users: "VoU7n2eR9xgqgY0rvh9l",
	interested_membership_option: "FqzY7u4YKgq6XkkwwRIY",
	desired_start_date: "oCeokCCqhwv8w34IG8wj",
	workspace_requirements: "JVbMOKVFRF0VplBp23ep",
	mail_services: "c6u6qpONYFqxXXWkWsuI",
	communication_preference: "v9JpZpQWsvialNwB4H9s",
	other_needs_notes: "K8WryShuVikObpNmq7Pv",
	referral_source: "WIFqOYy3YY0fOGImtcaa",
};

function readField(submission: any, key: string): unknown {
	const rawKey = fieldMap[key] || key;
	if (submission[rawKey] !== undefined) return submission[rawKey];
	if (submission.others && submission.others[rawKey] !== undefined) return submission.others[rawKey];
	if (submission.others && submission.others[key] !== undefined) return submission.others[key];
	return "";
}

function normalizeSubmission(submission: any) {
	return {
		id: submission.id,
		contact_id: submission.contactId,
		created_at: submission.createdAt,
		form_id: submission.formId,
		first_name: readField(submission, "first_name"),
		last_name: readField(submission, "last_name"),
		full_name:
			submission.name ||
			[readField(submission, "first_name"), readField(submission, "last_name")].filter(Boolean).join(" "),
		title_role: readField(submission, "title_role"),
		email: submission.email || readField(submission, "email"),
		phone: submission.phone || readField(submission, "phone"),
		company_name: readField(submission, "company_name"),
		website_social: readField(submission, "website_social"),
		category: readField(submission, "category"),
		company_overview: readField(submission, "company_overview"),
		company_stage: readField(submission, "company_stage"),
		customers: readField(submission, "customers"),
		capital_raised: readField(submission, "capital_raised"),
		notable_investors: readField(submission, "notable_investors"),
		team_size: readField(submission, "team_size"),
		additional_workspace_users: readField(submission, "additional_workspace_users"),
		interested_membership_option: readField(submission, "interested_membership_option"),
		desired_start_date: readField(submission, "desired_start_date"),
		workspace_requirements: readField(submission, "workspace_requirements"),
		mail_services: readField(submission, "mail_services"),
		communication_preference: readField(submission, "communication_preference"),
		other_needs_notes: readField(submission, "other_needs_notes"),
		referral_source: readField(submission, "referral_source"),
		raw: submission,
	};
}

// ─── MCP Agent ───────────────────────────────────────────────────────────────────

export class OperationsMCP extends McpAgent<Env, Record<string, never>, Props> {
	server = new McpServer({ name: "sp-ark-operations", version: "0.1.0" });

	// Verkada session token cache (persists for the lifetime of this Durable Object instance)
	private vkSessionToken: string | null = null;
	private vkTokenExpiresAt = 0;
	// Nexudus token cache
	private nxCachedToken = "";

	async init() {
		// Gate every tool behind the allowlist. Non-allowed users authenticate but get
		// no tools, so they cannot reach building access / member provisioning.
		if (!ALLOWED_USERNAMES.has(this.props!.login)) {
			return;
		}

		const env = this.env;

		// ── BossHub ──────────────────────────────────────────────────────────────

		const bosshubRequest = async (path: string, query: Record<string, unknown> = {}) => {
			if (!env.BOSSHUB_ACCESS_TOKEN) throw new Error("BOSSHUB_ACCESS_TOKEN is not configured.");
			const url = new URL(`${env.BOSSHUB_API_BASE_URL}${path}`);
			for (const [key, value] of Object.entries(query)) {
				if (value !== undefined && value !== null && value !== "") {
					url.searchParams.set(key, String(value));
				}
			}
			const response = await fetch(url, {
				headers: {
					accept: "application/json",
					authorization: `Bearer ${env.BOSSHUB_ACCESS_TOKEN}`,
					version: env.BOSSHUB_API_VERSION,
				},
			});
			const text = await response.text();
			let body: any = {};
			if (text) {
				try { body = JSON.parse(text); } catch { body = { raw: text }; }
			}
			if (!response.ok) {
				throw new Error(JSON.stringify({ status: response.status, statusText: response.statusText, body }));
			}
			return body;
		};

		this.server.tool(
			"bosshub_list_member_inquiries",
			"List new member inquiry form submissions from the BossHub/LeadConnector form.",
			{
				page: z.number().int().positive().default(1),
				limit: z.number().int().positive().max(100).default(20),
				q: z.string().optional(),
				startAt: z.string().optional(),
				endAt: z.string().optional(),
			},
			async ({ page, limit, q, startAt, endAt }) => {
				if (!env.BOSSHUB_ACCESS_TOKEN) {
					return jsonResponse(blocked("BOSSHUB_ACCESS_TOKEN is not configured.", {
						required_scope: "forms.readonly",
						location_id: env.BOSSHUB_LOCATION_ID,
						form_id: env.BOSSHUB_FORM_ID,
					}));
				}
				const result = await bosshubRequest("/forms/submissions", {
					locationId: env.BOSSHUB_LOCATION_ID,
					formId: env.BOSSHUB_FORM_ID,
					page, limit, q, startAt, endAt,
				});
				return jsonResponse(ok({
					submissions: (result.submissions || []).map(normalizeSubmission),
					meta: result.meta || {},
				}));
			}
		);

		this.server.tool(
			"bosshub_get_member_inquiry",
			"Find one member inquiry submission by submission ID, email, or name.",
			{ query: z.string().min(1) },
			async ({ query }) => {
				if (!env.BOSSHUB_ACCESS_TOKEN) {
					return jsonResponse(blocked("BOSSHUB_ACCESS_TOKEN is not configured.", { query, required_scope: "forms.readonly" }));
				}
				const result = await bosshubRequest("/forms/submissions", {
					locationId: env.BOSSHUB_LOCATION_ID,
					formId: env.BOSSHUB_FORM_ID,
					q: query, page: 1, limit: 20,
				});
				const submissions = (result.submissions || []).map(normalizeSubmission);
				const exact = submissions.find(
					(s: any) =>
						s.id === query ||
						s.email?.toLowerCase?.() === query.toLowerCase() ||
						s.full_name?.toLowerCase?.() === query.toLowerCase()
				);
				return jsonResponse(ok({ match: exact || null, candidates: exact ? [] : submissions, meta: result.meta || {} }));
			}
		);

		// ── Verkada ──────────────────────────────────────────────────────────────

		const vkBaseUrl = () => `https://${env.VERKADA_REGION}.verkada.com`;
		const vkDryRun = env.VERKADA_DRY_RUN !== "false";

		const getVerkadaToken = async (): Promise<string> => {
			if (this.vkSessionToken && Date.now() < this.vkTokenExpiresAt) return this.vkSessionToken;
			const response = await fetch(`${vkBaseUrl()}/token`, {
				method: "POST",
				headers: { accept: "application/json", "x-api-key": env.VERKADA_API_KEY },
			});
			const body: any = await response.json().catch(() => ({}));
			if (!response.ok || !body.token) {
				throw new Error(JSON.stringify({ status: response.status, body, message: "Failed to obtain Verkada session token" }));
			}
			this.vkSessionToken = body.token;
			this.vkTokenExpiresAt = Date.now() + 25 * 60 * 1000;
			return this.vkSessionToken as string;
		};

		const verkadaRequest = async (path: string, options: RequestInit = {}) => {
			if (!env.VERKADA_API_KEY) throw new Error("VERKADA_API_KEY is not configured.");
			const token = await getVerkadaToken();
			const response = await fetch(`${vkBaseUrl()}${path}`, {
				...options,
				headers: {
					accept: "application/json",
					"content-type": "application/json",
					"x-verkada-auth": token,
					...(options.headers || {}),
				},
			});
			const text = await response.text();
			let body: any = {};
			if (text) {
				try { body = JSON.parse(text); } catch { body = { raw: text }; }
			}
			if (!response.ok) {
				throw new Error(JSON.stringify({ status: response.status, statusText: response.statusText, body }));
			}
			return body;
		};

		this.server.tool(
			"verkada_find_access_user",
			"Find a Verkada access user by email address.",
			{ email: z.string().email() },
			async ({ email }) => {
				if (!env.VERKADA_API_KEY) return jsonResponse(blocked("VERKADA_API_KEY is not configured.", { email }));
				const result = await verkadaRequest(`/access/v1/access_users/user?email=${encodeURIComponent(email)}`);
				return jsonResponse(ok({ user: result }));
			}
		);

		this.server.tool(
			"verkada_create_access_user",
			"Create a Verkada user. Uses email as external_id unless external_id is provided.",
			{
				first_name: z.string().min(1),
				last_name: z.string().min(1),
				email: z.string().email(),
				external_id: z.string().optional(),
			},
			async ({ first_name, last_name, email, external_id }) => {
				const payload = { first_name, last_name, email, external_id: external_id || email };
				if (!env.VERKADA_API_KEY) return jsonResponse(blocked("VERKADA_API_KEY is not configured.", { payload }));
				if (vkDryRun) return jsonResponse(blocked("VERKADA_DRY_RUN is enabled. Set VERKADA_DRY_RUN=false to create users.", { payload }));
				const result = await verkadaRequest("/core/v1/user", { method: "POST", body: JSON.stringify(payload) });
				return jsonResponse(ok({ user: result }));
			}
		);

		this.server.tool(
			"verkada_list_access_groups",
			"List Verkada access groups so the correct group ID can be configured.",
			{},
			async () => {
				if (!env.VERKADA_API_KEY) return jsonResponse(blocked("VERKADA_API_KEY is not configured."));
				const result = await verkadaRequest("/access/v1/access_groups");
				return jsonResponse(ok({ access_groups: result }));
			}
		);

		this.server.tool(
			"verkada_add_user_to_access_group",
			"Add a Verkada access user to an access group.",
			{
				user_id: z.string().optional(),
				external_id: z.string().optional(),
				group_id: z.string().optional(),
			},
			async ({ user_id, external_id, group_id }) => {
				const resolvedGroupId = group_id || env.VERKADA_DEFAULT_ACCESS_GROUP_ID;
				if (!user_id && !external_id) return jsonResponse(blocked("Either user_id or external_id is required."));
				if (!resolvedGroupId) return jsonResponse(blocked("No Verkada access group is configured.", { required_env: "VERKADA_DEFAULT_ACCESS_GROUP_ID" }));
				const payload = user_id ? { user_id } : { external_id };
				if (!env.VERKADA_API_KEY) return jsonResponse(blocked("VERKADA_API_KEY is not configured.", { payload }));
				if (vkDryRun) return jsonResponse(blocked("VERKADA_DRY_RUN is enabled. Set VERKADA_DRY_RUN=false to assign access.", { group_id: resolvedGroupId, payload }));
				const result = await verkadaRequest(
					`/access/v1/access_groups/group/user?group_id=${encodeURIComponent(resolvedGroupId)}`,
					{ method: "PUT", body: JSON.stringify(payload) }
				);
				return jsonResponse(ok({ access_assignment: result }));
			}
		);

		// ── Nexudus ──────────────────────────────────────────────────────────────

		const nxDryRun = env.NEXUDUS_DRY_RUN !== "false";
		if (!this.nxCachedToken) this.nxCachedToken = env.NEXUDUS_ACCESS_TOKEN || "";

		const nxMissingConfig = (): string[] => {
			const missing: string[] = [];
			if (!env.NEXUDUS_ACCESS_TOKEN && (!env.NEXUDUS_USERNAME || !env.NEXUDUS_PASSWORD)) {
				missing.push("NEXUDUS_USERNAME + NEXUDUS_PASSWORD (or NEXUDUS_ACCESS_TOKEN)");
			}
			if (!env.NEXUDUS_BUSINESS_ID) missing.push("NEXUDUS_BUSINESS_ID");
			return missing;
		};

		const getNexudusToken = async (): Promise<string> => {
			if (this.nxCachedToken) return this.nxCachedToken;
			if (!env.NEXUDUS_USERNAME || !env.NEXUDUS_PASSWORD) throw new Error("Nexudus credentials are not configured.");
			const params = new URLSearchParams({ grant_type: "password", username: env.NEXUDUS_USERNAME, password: env.NEXUDUS_PASSWORD });
			if (env.NEXUDUS_TOTP) params.set("totp", env.NEXUDUS_TOTP);
			const response = await fetch(`${env.NEXUDUS_API_BASE_URL}/api/token`, {
				method: "POST",
				headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
				body: params.toString(),
			});
			const body: any = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(JSON.stringify({ status: response.status, body }));
			this.nxCachedToken = body.access_token || "";
			if (!this.nxCachedToken) throw new Error("Nexudus token response did not include access_token.");
			return this.nxCachedToken;
		};

		const nxDoFetch = async (path: string, token: string, options: RequestInit = {}) => {
			const response = await fetch(`${env.NEXUDUS_API_BASE_URL}${path}`, {
				...options,
				headers: {
					accept: "application/json",
					"content-type": "application/json",
					authorization: `Bearer ${token}`,
					...(options.headers || {}),
				},
			});
			const text = await response.text();
			let body: any = {};
			if (text) {
				try { body = JSON.parse(text); } catch { body = { raw: text }; }
			}
			return { status: response.status, ok: response.ok, body };
		};

		const nexudusRequest = async (path: string, options: RequestInit = {}) => {
			const missing = nxMissingConfig();
			if (missing.length) throw new Error(`Missing Nexudus configuration: ${missing.join(", ")}`);
			let token = await getNexudusToken();
			let { status, ok: isOk, body } = await nxDoFetch(path, token, options);
			if (status === 401) {
				this.nxCachedToken = "";
				token = await getNexudusToken();
				({ ok: isOk, body } = await nxDoFetch(path, token, options));
			}
			if (!isOk) throw new Error(JSON.stringify({ status, body }));
			return body;
		};

		this.server.tool(
			"nexudus_find_person",
			"Find a Nexudus coworker/member by email address.",
			{ email: z.string().email() },
			async ({ email }) => {
				const missing = nxMissingConfig();
				if (missing.length) return jsonResponse(blocked("Nexudus API configuration is incomplete.", { missing, email }));
				const result = await nexudusRequest(`/api/spaces/coworkers?Coworker_Email=${encodeURIComponent(email)}&size=5`);
				const records = result.Records || [];
				if (records.length === 0) return jsonResponse(ok({ found: false, email, coworker: null }));
				return jsonResponse(ok({ found: true, coworker: records[0] }));
			}
		);

		this.server.tool(
			"nexudus_create_person",
			"Create a Nexudus coworker (member) with a plan assigned. tariff_id must be provided — look up the correct ID from the plan mapping table in SKILL.md.",
			{
				first_name: z.string().min(1),
				last_name: z.string().min(1),
				email: z.string().email(),
				company_name: z.string().optional(),
				tariff_id: z.number().int().positive(),
			},
			async ({ first_name, last_name, email, company_name, tariff_id }) => {
				const payload = {
					FullName: `${first_name} ${last_name}`,
					Email: email,
					CompanyName: company_name || "",
					BusinessId: parseInt(env.NEXUDUS_BUSINESS_ID, 10),
					TariffId: tariff_id,
					CountryId: 1221,
					SimpleTimeZoneId: 2013,
				};
				const missing = nxMissingConfig();
				if (missing.length) return jsonResponse(blocked("Nexudus API configuration is incomplete.", { missing, payload }));
				if (nxDryRun) return jsonResponse(blocked("NEXUDUS_DRY_RUN is enabled. Set NEXUDUS_DRY_RUN=false to create coworkers.", { payload }));
				const result = await nexudusRequest("/api/spaces/coworkers", { method: "POST", body: JSON.stringify(payload) });
				return jsonResponse(ok({ coworker: result }));
			}
		);

		this.server.tool(
			"nexudus_assign_booking_access",
			"Assign a different plan to an existing Nexudus coworker. Use nexudus_create_person with tariff_id instead when creating new coworkers.",
			{
				coworker_id: z.number().int().positive(),
				tariff_id: z.number().int().positive(),
			},
			async ({ coworker_id, tariff_id }) => {
				const missing = nxMissingConfig();
				if (missing.length) return jsonResponse(blocked("Nexudus API configuration is incomplete.", { missing }));
				if (nxDryRun) return jsonResponse(blocked("NEXUDUS_DRY_RUN is enabled. Set NEXUDUS_DRY_RUN=false to assign plans.", { coworker_id, tariff_id }));
				const result = await nexudusRequest(`/api/spaces/coworkers/${coworker_id}`, {
					method: "PUT",
					body: JSON.stringify({ Id: coworker_id, TariffId: tariff_id }),
				});
				return jsonResponse(ok({ coworker: result }));
			}
		);
	}
}

// ─── OAuth-wrapped Worker entry ──────────────────────────────────────────────────
// GitHub OAuth gates the /mcp endpoint. The authenticated user's GitHub profile is
// passed to OperationsMCP as this.props; ALLOWED_USERNAMES decides who gets tools.

export default new OAuthProvider({
	apiHandler: OperationsMCP.serve("/mcp") as any,
	apiRoute: "/mcp",
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: GitHubHandler as any,
	tokenEndpoint: "/token",
});
