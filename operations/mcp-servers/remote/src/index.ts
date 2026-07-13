import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import { MicrosoftHandler } from "./microsoft-handler";
import type { Props } from "./utils";

// ─── Access control ──────────────────────────────────────────────────────────────
// Only these Microsoft account emails can use the tools. Anyone else can sign in
// but will see no tools. These write to building access + member systems, so keep
// this list tight. Edit and redeploy to add/remove people.
const ALLOWED_EMAILS = new Set<string>([
	"jarred@altrwork.com",
	"robidouxj@sp-ark-labs.com",
	"deeke@tbinnovates.com",
	"bernardc@sp-ark-labs.com",
	"ryanc@sp-ark-labs.com",
	"brownr@sp-ark-labs.com", 
	"kange@sp-ark-labs.com",
	"twilson@tbinnovates.com"
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

// ─── Microsoft Graph calendar helpers ────────────────────────────────────────────

// Graph wants { dateTime, timeZone } with no offset on dateTime when timeZone is
// explicit. We always operate in UTC, so strip a trailing "Z" if present.
function toGraphDateTime(iso: string): { dateTime: string; timeZone: string } {
	return { dateTime: iso.replace(/Z$/, ""), timeZone: "UTC" };
}

// Public *.workers.dev origin for this worker (see root CLAUDE.md). Used to build
// shareable calendar links — /add-to-calendar and /ics are served by
// microsoft-handler.ts and need no auth since they only echo back event fields the
// caller already supplied.
const WORKER_ORIGIN = "https://sp-ark-operations-mcp.jarred-823.workers.dev";

// Graph's calendar responses give dateTime + an IANA/Windows timeZone name. We send
// `Prefer: outlook.timezone="UTC"` on every Graph call (see graphRequest), so in
// practice timeZone is always "UTC" here — this just guards the edge case.
function toIcsUtcStamp(dateTime: string, timeZone: string | undefined): string | null {
	if (!dateTime) return null;
	const iso = /Z$/.test(dateTime) || (timeZone || "").toUpperCase() === "UTC" ? `${dateTime.replace(/Z$/, "")}Z` : dateTime;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return null;
	return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

// Builds a link to this worker's /add-to-calendar landing page — a normal webpage
// with Google Calendar / Outlook / .ics buttons, so someone clicking it in Slack
// picks their own calendar app instead of a file silently downloading. Graph has no
// native per-event .ics export, so we generate everything from fields we already have.
function buildAddToCalendarUrl(e: { id: string; subject: string; start: any; end: any; location: string | null }): string | null {
	const start = toIcsUtcStamp(e.start?.dateTime, e.start?.timeZone);
	const end = toIcsUtcStamp(e.end?.dateTime, e.end?.timeZone);
	if (!start || !end) return null;
	const params = new URLSearchParams({ uid: e.id, subject: e.subject || "Event", start, end });
	if (e.location) params.set("location", e.location);
	return `${WORKER_ORIGIN}/add-to-calendar?${params.toString()}`;
}

function normalizeEvent(e: any) {
	const location = e.location?.displayName || null;
	const event = {
		id: e.id,
		subject: e.subject,
		start: e.start,
		end: e.end,
		location,
		organizer: e.organizer?.emailAddress?.address || null,
		attendees: (e.attendees || []).map((a: any) => ({
			email: a.emailAddress?.address,
			name: a.emailAddress?.name,
			type: a.type,
			response: a.status?.response,
		})),
		is_cancelled: e.isCancelled ?? false,
		web_link: e.webLink || null,
		add_to_calendar_url: null as string | null,
	};
	event.add_to_calendar_url = buildAddToCalendarUrl({ id: event.id, subject: event.subject, start: event.start, end: event.end, location });
	return event;
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
	// Microsoft Graph token cache — seeded from this.props (the signed-in user's own
	// delegated token) on first use, refreshed in place as it expires.
	private msAccessToken: string | null = null;
	private msRefreshToken: string | null = null;
	private msTokenExpiresAt = 0;

	async init() {
		// Gate every tool behind the allowlist. Non-allowed users authenticate but get
		// no tools, so they cannot reach building access / member provisioning.
		console.log(`[auth] email from token: "${this.props!.email}"`);
		if (!ALLOWED_EMAILS.has(this.props!.email)) {
			console.log(`[auth] blocked: not in allowlist`);
			return;
		}
		console.log(`[auth] allowed`);

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
			"bosshub_list_forms",
			"List all BossHub forms for this location. Call this first when you don't know which form_id to use for bosshub_list_submissions or bosshub_get_submission.",
			{},
			async () => {
				if (!env.BOSSHUB_ACCESS_TOKEN) {
					return jsonResponse(blocked("BOSSHUB_ACCESS_TOKEN is not configured.", { required_scope: "forms.readonly" }));
				}
				const result = await bosshubRequest("/forms/", { locationId: env.BOSSHUB_LOCATION_ID });
				return jsonResponse(ok({ forms: result.forms || [], total: result.total || 0 }));
			}
		);

		this.server.tool(
			"bosshub_list_submissions",
			"List submissions from a BossHub form. If you don't know the form_id, call bosshub_list_forms first to find it by name. Omit form_id to default to the member inquiry form.",
			{
				form_id: z.string().optional().describe("Form ID from bosshub_list_forms. Defaults to the member inquiry form."),
				page: z.number().int().positive().default(1),
				limit: z.number().int().positive().max(100).default(20),
				q: z.string().optional(),
				startAt: z.string().optional(),
				endAt: z.string().optional(),
			},
			async ({ form_id, page, limit, q, startAt, endAt }) => {
				if (!env.BOSSHUB_ACCESS_TOKEN) {
					return jsonResponse(blocked("BOSSHUB_ACCESS_TOKEN is not configured.", { required_scope: "forms.readonly" }));
				}
				const result = await bosshubRequest("/forms/submissions", {
					locationId: env.BOSSHUB_LOCATION_ID,
					formId: form_id || env.BOSSHUB_FORM_ID,
					page, limit, q, startAt, endAt,
				});
				return jsonResponse(ok({
					submissions: (result.submissions || []).map(normalizeSubmission),
					meta: result.meta || {},
				}));
			}
		);

		this.server.tool(
			"bosshub_get_submission",
			"Find one submission from a BossHub form by submission ID, email, or name. If you don't know the form_id, call bosshub_list_forms first. Omit form_id to default to the member inquiry form.",
			{
				query: z.string().min(1).describe("Submission ID, email address, or name to search for."),
				form_id: z.string().optional().describe("Form ID from bosshub_list_forms. Defaults to the member inquiry form."),
			},
			async ({ query, form_id }) => {
				if (!env.BOSSHUB_ACCESS_TOKEN) {
					return jsonResponse(blocked("BOSSHUB_ACCESS_TOKEN is not configured.", { query, required_scope: "forms.readonly" }));
				}
				const result = await bosshubRequest("/forms/submissions", {
					locationId: env.BOSSHUB_LOCATION_ID,
					formId: form_id || env.BOSSHUB_FORM_ID,
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

		const vkDoFetch = async (path: string, token: string, options: RequestInit = {}) => {
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
			return { status: response.status, ok: response.ok, statusText: response.statusText, body };
		};

		const verkadaRequest = async (path: string, options: RequestInit = {}) => {
			if (!env.VERKADA_API_KEY) throw new Error("VERKADA_API_KEY is not configured.");
			let token = await getVerkadaToken();
			let { status, ok: isOk, statusText, body } = await vkDoFetch(path, token, options);
			if (status === 401) {
				this.vkSessionToken = null;
				this.vkTokenExpiresAt = 0;
				token = await getVerkadaToken();
				({ status, ok: isOk, statusText, body } = await vkDoFetch(path, token, options));
			}
			if (!isOk) {
				throw new Error(JSON.stringify({ status, statusText, body }));
			}
			return body;
		};

		this.server.tool(
			"verkada_find_access_user",
			"Find a Verkada access user by email address.",
			{ email: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Must be a valid email address") },
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
				email: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Must be a valid email address"),
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

		this.server.tool(
			"verkada_send_pass_invite",
			"Email a user an invite to download the Verkada Pass app and set up their mobile credential. Call after verkada_create_access_user and verkada_add_user_to_access_group. Requires exactly one of user_id, email, external_id, or employee_id — if more than one is provided, only user_id (then external_id, then email, then employee_id) is sent, since Verkada rejects requests with more than one identifier.",
			{
				user_id: z.string().optional().describe("Verkada user_id from verkada_create_access_user or verkada_find_access_user."),
				email: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Must be a valid email address").optional().describe("User's email address."),
				external_id: z.string().optional().describe("Customer-managed unique identifier."),
				employee_id: z.string().optional().describe("Organization-defined employee ID."),
			},
			async ({ user_id, email, external_id, employee_id }) => {
				const identifier: Record<string, string> = user_id
					? { user_id }
					: external_id
					? { external_id }
					: email
					? { email }
					: employee_id
					? { employee_id }
					: {};
				if (Object.keys(identifier).length === 0) {
					return jsonResponse(blocked("Exactly one of user_id, email, external_id, or employee_id is required."));
				}
				if (!env.VERKADA_API_KEY) return jsonResponse(blocked("VERKADA_API_KEY is not configured."));
				if (vkDryRun) return jsonResponse(blocked("VERKADA_DRY_RUN is enabled. Set VERKADA_DRY_RUN=false to send Pass invites.", identifier));
				const params = new URLSearchParams(identifier);
				const result = await verkadaRequest(`/access/v1/access_users/user/pass/invite?${params.toString()}`, { method: "POST" });
				return jsonResponse(ok({ invite_sent: true, ...identifier, result }));
			}
		);

		this.server.tool(
			"verkada_activate_remote_unlock",
			"Enable remote unlock (via the Pass app) for a Verkada access user, so they can unlock doors from their phone instead of only badging in. Call after verkada_add_user_to_access_group. Requires exactly one of user_id, email, external_id, or employee_id — if more than one is provided, only user_id (then external_id, then email, then employee_id) is sent, since Verkada rejects requests with more than one identifier.",
			{
				user_id: z.string().optional().describe("Verkada user_id from verkada_create_access_user or verkada_find_access_user."),
				email: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Must be a valid email address").optional().describe("User's email address."),
				external_id: z.string().optional().describe("Customer-managed unique identifier."),
				employee_id: z.string().optional().describe("Organization-defined employee ID."),
			},
			async ({ user_id, email, external_id, employee_id }) => {
				const identifier: Record<string, string> = user_id
					? { user_id }
					: external_id
					? { external_id }
					: email
					? { email }
					: employee_id
					? { employee_id }
					: {};
				if (Object.keys(identifier).length === 0) {
					return jsonResponse(blocked("Exactly one of user_id, email, external_id, or employee_id is required."));
				}
				if (!env.VERKADA_API_KEY) return jsonResponse(blocked("VERKADA_API_KEY is not configured."));
				if (vkDryRun) return jsonResponse(blocked("VERKADA_DRY_RUN is enabled. Set VERKADA_DRY_RUN=false to activate remote unlock.", identifier));
				const params = new URLSearchParams(identifier);
				const result = await verkadaRequest(`/access/v1/access_users/user/remote_unlock/activate?${params.toString()}`, { method: "PUT" });
				return jsonResponse(ok({ remote_unlock_activated: true, ...identifier, result }));
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
			{ email: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Must be a valid email address") },
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
				email: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Must be a valid email address"),
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

		this.server.tool(
				"nexudus_list_resources",
				"List available meeting rooms and resources in Nexudus. Call this to get resource IDs before creating a booking.",
				{
					page: z.number().int().positive().default(1),
					size: z.number().int().positive().max(100).default(25),
					name: z.string().optional().describe("Filter by resource name (partial match)"),
				},
				async ({ page, size, name }) => {
					const missing = nxMissingConfig();
					if (missing.length) return jsonResponse(blocked("Nexudus API configuration is incomplete.", { missing }));
					const params = new URLSearchParams({ page: String(page), size: String(size) });
					if (name) params.set("Name", name);
					const result = await nexudusRequest(`/api/spaces/resources?${params}`);
					const records = (result.Records || []).map((r: any) => ({
						id: r.Id,
						name: r.Name,
						description: r.Description,
						capacity: r.Capacity,
						min_booking_length_mins: r.MinBookingLength,
						max_booking_length_mins: r.MaxBookingLength,
						requires_confirmation: r.RequiresConfirmation,
						visible: r.Visible,
					}));
					return jsonResponse(ok({ resources: records, total: result.TotalItems, page: result.CurrentPage, total_pages: result.TotalPages }));
				}
			);

			this.server.tool(
				"nexudus_list_bookings",
				"List room bookings in Nexudus. Filter by date range, resource, or coworker.",
				{
					from_date: z.string().optional().describe("Start of date range, ISO 8601 UTC (e.g. 2024-06-25T00:00:00Z)"),
					to_date: z.string().optional().describe("End of date range, ISO 8601 UTC"),
					resource_id: z.number().int().optional().describe("Filter by resource/room ID"),
					coworker_id: z.number().int().optional().describe("Filter by coworker/member ID"),
					page: z.number().int().positive().default(1),
					size: z.number().int().positive().max(100).default(25),
				},
				async ({ from_date, to_date, resource_id, coworker_id, page, size }) => {
					const missing = nxMissingConfig();
					if (missing.length) return jsonResponse(blocked("Nexudus API configuration is incomplete.", { missing }));
					const params = new URLSearchParams({ page: String(page), size: String(size) });
					if (from_date) params.set("from_FromTime", from_date);
					if (to_date) params.set("to_ToTime", to_date);
					if (resource_id) params.set("ResourceId", String(resource_id));
					if (coworker_id) params.set("CoworkerId", String(coworker_id));
					const result = await nexudusRequest(`/api/spaces/bookings?${params}`);
					const records = (result.Records || []).map((b: any) => ({
						id: b.Id,
						booking_number: b.BookingNumber,
						resource_id: b.ResourceId,
						resource_name: b.ResourceName,
						coworker_id: b.CoworkerId,
						coworker_name: b.CoworkerName,
						from_time: b.FromTime,
						to_time: b.ToTime,
						from_time_local: b.FromTimeLocal,
						to_time_local: b.ToTimeLocal,
						tentative: b.Tentative,
					}));
					return jsonResponse(ok({ bookings: records, total: result.TotalItems, page: result.CurrentPage, total_pages: result.TotalPages }));
				}
			);

			this.server.tool(
				"nexudus_create_booking",
				"Create a meeting room booking in Nexudus. Call nexudus_list_resources first to get the resource_id. Times must be ISO 8601 UTC.",
				{
					resource_id: z.number().int().positive().describe("Room/resource ID from nexudus_list_resources"),
					from_time: z.string().describe("Start time, ISO 8601 UTC (e.g. 2024-06-25T14:00:00Z)"),
					to_time: z.string().describe("End time, ISO 8601 UTC (e.g. 2024-06-25T15:00:00Z)"),
					coworker_id: z.number().int().optional().describe("Member ID from nexudus_find_person. Omit to book without a member."),
					internal_notes: z.string().optional().describe("Internal notes visible only to admins, not to the member"),
					tentative: z.boolean().optional().describe("If true, booking requires admin approval before confirming (default false)"),
					override_price: z.number().optional().describe("Override the default price for this booking (admin-set fixed price)"),
				},
				async ({ resource_id, from_time, to_time, coworker_id, internal_notes, tentative, override_price }) => {
					const missing = nxMissingConfig();
					if (missing.length) return jsonResponse(blocked("Nexudus API configuration is incomplete.", { missing }));
					if (nxDryRun) return jsonResponse(blocked("NEXUDUS_DRY_RUN is enabled. Set NEXUDUS_DRY_RUN=false to create bookings.", { resource_id, from_time, to_time }));
					const payload: Record<string, unknown> = {
						ResourceId: resource_id,
						FromTime: from_time,
						ToTime: to_time,
						Repeats: 0,
						WhichBookingsToUpdate: 0,
						Online: true,
					};
					if (coworker_id !== undefined) payload.CoworkerId = coworker_id;
					if (internal_notes) payload.InternalNotes = internal_notes;
					if (tentative !== undefined) payload.Tentative = tentative;
					if (override_price !== undefined) payload.OverridePrice = override_price;
					const result = await nexudusRequest("/api/spaces/bookings", { method: "POST", body: JSON.stringify(payload) });
					return jsonResponse(ok({
						booking_created: result.WasSuccessful ?? true,
						booking_id: result.Id || result.Value,
						message: result.Message || null,
					}));
				}
			);

			this.server.tool(
				"nexudus_cancel_booking",
				"Cancel (permanently delete) a Nexudus booking by ID. Use nexudus_list_bookings to find the booking ID first.",
				{
					booking_id: z.number().int().positive().describe("Booking ID to cancel"),
				},
				async ({ booking_id }) => {
					const missing = nxMissingConfig();
					if (missing.length) return jsonResponse(blocked("Nexudus API configuration is incomplete.", { missing }));
					if (nxDryRun) return jsonResponse(blocked("NEXUDUS_DRY_RUN is enabled. Set NEXUDUS_DRY_RUN=false to cancel bookings.", { booking_id }));
					const result = await nexudusRequest(`/api/spaces/bookings/${booking_id}`, { method: "DELETE" });
					return jsonResponse(ok({
						booking_cancelled: result.WasSuccessful ?? true,
						booking_id,
						message: result.Message || null,
					}));
				}
			);

			// ── Microsoft Outlook (Graph API) ─────────────────────────────────────────

		const msMissingConfig = (): string[] => {
			const missing: string[] = [];
			if (!env.MS_TENANT_ID) missing.push("MS_TENANT_ID");
			if (!env.MS_CLIENT_ID) missing.push("MS_CLIENT_ID");
			if (!env.MS_CLIENT_SECRET) missing.push("MS_CLIENT_SECRET");
			return missing;
		};

		// Delegated token for the signed-in user. Seeded from this.props (set at
		// /callback login time) and refreshed in place as it expires. Refreshed tokens
		// live only in this Durable Object's memory — workers-oauth-provider has no API
		// to write them back into the persisted OAuth grant. If the DO is evicted and
		// restarts, init() re-seeds from the original login-time refresh token, which
		// Azure AD's rotation grace window will generally still honor.
		const getUserMsToken = async (): Promise<string> => {
			if (!this.msAccessToken) {
				this.msAccessToken = this.props!.accessToken;
				this.msRefreshToken = this.props!.refreshToken;
				this.msTokenExpiresAt = this.props!.tokenExpiresAt;
			}
			if (this.msAccessToken && Date.now() < this.msTokenExpiresAt) return this.msAccessToken;
			if (!this.msRefreshToken) throw new Error("No Microsoft refresh token available — reconnect the connector.");

			const params = new URLSearchParams({
				grant_type: "refresh_token",
				client_id: env.MS_CLIENT_ID,
				client_secret: env.MS_CLIENT_SECRET,
				refresh_token: this.msRefreshToken,
				scope: "offline_access openid profile email Mail.Send Mail.ReadWrite Calendars.ReadWrite",
			});
			const response = await fetch(
				`https://login.microsoftonline.com/${env.MS_TENANT_ID}/oauth2/v2.0/token`,
				{ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: params.toString() }
			);
			const body: any = await response.json().catch(() => ({}));
			if (!response.ok || !body.access_token) {
				throw new Error(JSON.stringify({ status: response.status, body, message: "Failed to refresh Microsoft Graph token" }));
			}
			this.msAccessToken = body.access_token;
			if (body.refresh_token) this.msRefreshToken = body.refresh_token;
			// expires_in is in seconds; refresh 60s early
			this.msTokenExpiresAt = Date.now() + (body.expires_in - 60) * 1000;
			return this.msAccessToken as string;
		};

		const graphRequest = async (path: string, options: RequestInit = {}) => {
			const token = await getUserMsToken();
			const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
				...options,
				headers: {
					accept: "application/json",
					"content-type": "application/json",
					authorization: `Bearer ${token}`,
					// Ensures event start/end dateTimes come back in UTC regardless of the
					// mailbox's configured timezone — buildIcsUrl() relies on this.
					prefer: 'outlook.timezone="UTC"',
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

		const attendeeInput = z.object({
			email: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Must be a valid email address"),
			name: z.string().optional(),
			type: z.enum(["required", "optional"]).default("required"),
		});

		this.server.tool(
			"outlook_create_draft",
			"Create a draft email in Outlook as the signed-in user. Does not send — the user reviews and sends manually.",
			{
				to: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Must be a valid email address").describe("Recipient email address"),
				to_name: z.string().optional().describe("Recipient display name"),
				subject: z.string().min(1),
				body_html: z.string().min(1).describe("Email body as HTML"),
				cc: z.array(z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Must be a valid email address")).optional().describe("CC recipients"),
			},
			async ({ to, to_name, subject, body_html, cc }) => {
				const missing = msMissingConfig();
				if (missing.length) return jsonResponse(blocked("Microsoft Graph configuration is incomplete.", { missing }));
				const message: Record<string, unknown> = {
					subject,
					body: { contentType: "HTML", content: body_html },
					toRecipients: [{ emailAddress: { address: to, ...(to_name ? { name: to_name } : {}) } }],
				};
				if (cc && cc.length > 0) {
					message.ccRecipients = cc.map((addr) => ({ emailAddress: { address: addr } }));
				}
				const body = await graphRequest(`/me/messages`, { method: "POST", body: JSON.stringify(message) });
				return jsonResponse(ok({
					draft_created: true,
					message_id: body.id,
					subject: body.subject,
					web_link: body.webLink || null,
					from: this.props!.email,
					to,
				}));
			}
		);

		this.server.tool(
			"outlook_send_mail",
			"Compose and immediately send an email as the signed-in user. Unlike outlook_create_draft, this sends right away with no review step — use outlook_create_draft instead when the user should review before sending.",
			{
				to: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Must be a valid email address").describe("Recipient email address"),
				to_name: z.string().optional().describe("Recipient display name"),
				subject: z.string().min(1),
				body_html: z.string().min(1).describe("Email body as HTML"),
				cc: z.array(z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Must be a valid email address")).optional().describe("CC recipients"),
			},
			async ({ to, to_name, subject, body_html, cc }) => {
				const missing = msMissingConfig();
				if (missing.length) return jsonResponse(blocked("Microsoft Graph configuration is incomplete.", { missing }));
				const message: Record<string, unknown> = {
					subject,
					body: { contentType: "HTML", content: body_html },
					toRecipients: [{ emailAddress: { address: to, ...(to_name ? { name: to_name } : {}) } }],
				};
				if (cc && cc.length > 0) {
					message.ccRecipients = cc.map((addr) => ({ emailAddress: { address: addr } }));
				}
				await graphRequest(`/me/sendMail`, { method: "POST", body: JSON.stringify({ message, saveToSentItems: true }) });
				return jsonResponse(ok({ mail_sent: true, from: this.props!.email, to, subject }));
			}
		);

		this.server.tool(
			"outlook_send_draft",
			"Send an existing Outlook draft as the signed-in user. Use outlook_create_draft or outlook_search_events first to get the message_id, then call this once the draft has been reviewed.",
			{
				message_id: z.string().min(1).describe("Draft message ID from outlook_create_draft"),
			},
			async ({ message_id }) => {
				const missing = msMissingConfig();
				if (missing.length) return jsonResponse(blocked("Microsoft Graph configuration is incomplete.", { missing }));
				await graphRequest(`/me/messages/${encodeURIComponent(message_id)}/send`, { method: "POST" });
				return jsonResponse(ok({ draft_sent: true, message_id, from: this.props!.email }));
			}
		);

		this.server.tool(
			"outlook_list_calendars",
			"List calendars available in the signed-in user's Outlook mailbox. Use to find a calendar_id for outlook_search_events, outlook_create_event, or outlook_update_event when targeting a non-default calendar.",
			{},
			async () => {
				const missing = msMissingConfig();
				if (missing.length) return jsonResponse(blocked("Microsoft Graph configuration is incomplete.", { missing }));
				const result = await graphRequest(`/me/calendars`);
				const calendars = (result.value || []).map((c: any) => ({
					id: c.id,
					name: c.name,
					owner: c.owner?.address || null,
					can_edit: c.canEdit ?? null,
					is_default: c.name === "Calendar",
				}));
				return jsonResponse(ok({ calendars }));
			}
		);

		this.server.tool(
			"outlook_search_events",
			"Search or list events on the signed-in user's Outlook mailbox. Provide start_date/end_date to list a date range, a text query to search subject/body, or both. Returns event IDs needed for outlook_update_event.",
			{
				query: z.string().optional().describe("Free-text search across subject and body"),
				start_date: z.string().optional().describe("Range start, ISO 8601 UTC (e.g. 2024-06-25T00:00:00Z). Defaults to now."),
				end_date: z.string().optional().describe("Range end, ISO 8601 UTC. Defaults to 7 days after start_date."),
				calendar_id: z.string().optional().describe("Calendar ID from outlook_list_calendars. Omit to use the default calendar."),
				limit: z.number().int().positive().max(50).default(25),
			},
			async ({ query, start_date, end_date, calendar_id, limit }) => {
				const missing = msMissingConfig();
				if (missing.length) return jsonResponse(blocked("Microsoft Graph configuration is incomplete.", { missing }));
				const base = calendar_id
					? `/me/calendars/${encodeURIComponent(calendar_id)}`
					: `/me`;

				let result: any;
				if (query) {
					const params = new URLSearchParams({ $search: `"${query}"`, $top: String(limit) });
					if (start_date) {
						let filter = `start/dateTime ge '${start_date.replace(/Z$/, "")}'`;
						if (end_date) filter += ` and end/dateTime le '${end_date.replace(/Z$/, "")}'`;
						params.set("$filter", filter);
					}
					// $search requires ConsistencyLevel: eventual and is incompatible with $orderby.
					result = await graphRequest(`${base}/events?${params.toString()}`, {
						headers: { ConsistencyLevel: "eventual" },
					});
				} else {
					const startDateTime = start_date || new Date().toISOString();
					const endDateTime = end_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
					const params = new URLSearchParams({
						startDateTime: startDateTime.replace(/Z$/, ""),
						endDateTime: endDateTime.replace(/Z$/, ""),
						$top: String(limit),
						$orderby: "start/dateTime",
					});
					result = await graphRequest(`${base}/calendarView?${params.toString()}`);
				}
				const events = (result.value || []).map(normalizeEvent);
				return jsonResponse(ok({ events, count: events.length }));
			}
		);

		this.server.tool(
			"outlook_create_event",
			"Create a calendar event/meeting on the signed-in user's Outlook mailbox. If attendees are provided, Microsoft Graph automatically emails them a meeting invitation. Use ISO 8601 UTC for start_time/end_time (e.g. 2024-06-25T14:00:00Z).",
			{
				subject: z.string().min(1),
				start_time: z.string().describe("Start time, ISO 8601 UTC"),
				end_time: z.string().describe("End time, ISO 8601 UTC"),
				location: z.string().optional(),
				body_html: z.string().optional().describe("Event description/body as HTML"),
				attendees: z.array(attendeeInput).optional().describe("Invitees. Omit to create a personal (non-meeting) event."),
				calendar_id: z.string().optional().describe("Target calendar ID from outlook_list_calendars. Omit to use the default calendar."),
				is_online_meeting: z.boolean().optional().describe("If true, adds a Microsoft Teams link to the invite"),
			},
			async ({ subject, start_time, end_time, location, body_html, attendees, calendar_id, is_online_meeting }) => {
				const missing = msMissingConfig();
				if (missing.length) return jsonResponse(blocked("Microsoft Graph configuration is incomplete.", { missing }));
				const base = calendar_id
					? `/me/calendars/${encodeURIComponent(calendar_id)}`
					: `/me`;

				const payload: Record<string, unknown> = {
					subject,
					start: toGraphDateTime(start_time),
					end: toGraphDateTime(end_time),
				};
				if (location) payload.location = { displayName: location };
				if (body_html) payload.body = { contentType: "HTML", content: body_html };
				if (attendees && attendees.length > 0) {
					payload.attendees = attendees.map((a) => ({
						emailAddress: { address: a.email, ...(a.name ? { name: a.name } : {}) },
						type: a.type,
					}));
				}
				if (is_online_meeting) {
					payload.isOnlineMeeting = true;
					payload.onlineMeetingProvider = "teamsForBusiness";
				}
				const result = await graphRequest(`${base}/events`, { method: "POST", body: JSON.stringify(payload) });
				return jsonResponse(ok({
					event_created: true,
					event: normalizeEvent(result),
					invites_sent_to: (attendees || []).map((a) => a.email),
				}));
			}
		);

		this.server.tool(
			"outlook_update_event",
			"Update an existing Outlook calendar event. Microsoft Graph automatically emails attendees an update notification when the organizer changes a meeting. Use outlook_search_events first to find the event_id. The attendees list, if provided, fully replaces the existing list.",
			{
				event_id: z.string().min(1).describe("Event ID from outlook_search_events or outlook_create_event"),
				calendar_id: z.string().optional().describe("Calendar the event lives in. Omit to use the default calendar."),
				subject: z.string().optional(),
				start_time: z.string().optional().describe("New start time, ISO 8601 UTC"),
				end_time: z.string().optional().describe("New end time, ISO 8601 UTC"),
				location: z.string().optional(),
				body_html: z.string().optional(),
				attendees: z.array(attendeeInput).optional().describe("Replaces the full attendee list. Omit to leave attendees unchanged."),
			},
			async ({ event_id, calendar_id, subject, start_time, end_time, location, body_html, attendees }) => {
				const missing = msMissingConfig();
				if (missing.length) return jsonResponse(blocked("Microsoft Graph configuration is incomplete.", { missing }));
				const base = calendar_id
					? `/me/calendars/${encodeURIComponent(calendar_id)}`
					: `/me`;

				const payload: Record<string, unknown> = {};
				if (subject !== undefined) payload.subject = subject;
				if (start_time !== undefined) payload.start = toGraphDateTime(start_time);
				if (end_time !== undefined) payload.end = toGraphDateTime(end_time);
				if (location !== undefined) payload.location = { displayName: location };
				if (body_html !== undefined) payload.body = { contentType: "HTML", content: body_html };
				if (attendees !== undefined) {
					payload.attendees = attendees.map((a) => ({
						emailAddress: { address: a.email, ...(a.name ? { name: a.name } : {}) },
						type: a.type,
					}));
				}
				if (Object.keys(payload).length === 0) {
					return jsonResponse(blocked("No fields to update were provided.", { event_id }));
				}
				const result = await graphRequest(`${base}/events/${encodeURIComponent(event_id)}`, {
					method: "PATCH",
					body: JSON.stringify(payload),
				});
				return jsonResponse(ok({ event_updated: true, event: normalizeEvent(result) }));
			}
		);
	}
}

// ─── OAuth-wrapped Worker entry ──────────────────────────────────────────────────
// Microsoft OAuth (delegated) gates the /mcp endpoint. The signed-in user's profile
// and Graph tokens are passed to OperationsMCP as this.props; ALLOWED_EMAILS decides
// who gets tools, and Outlook tools call Graph using that user's own token.

export default new OAuthProvider({
	apiHandler: OperationsMCP.serve("/mcp") as any,
	apiRoute: "/mcp",
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: MicrosoftHandler as any,
	tokenEndpoint: "/token",
});
