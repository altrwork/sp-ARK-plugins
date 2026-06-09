#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "sp-ark-operations",
  version: "0.1.0",
});

// ─── Shared helpers ───────────────────────────────────────────────────────────

function blocked(reason, details = {}) {
  return { status: "blocked", reason, ...details };
}

function ok(data) {
  return { status: "ok", ...data };
}

function jsonResponse(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

// ─── BossHub / LeadConnector ──────────────────────────────────────────────────

const bhBaseUrl = process.env.BOSSHUB_API_BASE_URL || "https://services.leadconnectorhq.com";
const bhToken = process.env.BOSSHUB_ACCESS_TOKEN || "";
const bhLocationId = process.env.BOSSHUB_LOCATION_ID || "jqh6rxfWtvMIQCKxcDlc";
const bhFormId = process.env.BOSSHUB_FORM_ID || "Ftg5p93SEeTnUWiyAgYn";
const bhApiVersion = process.env.BOSSHUB_API_VERSION || "2023-02-21";

const fieldMap = {
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

function readField(submission, key) {
  const rawKey = fieldMap[key] || key;
  if (submission[rawKey] !== undefined) return submission[rawKey];
  if (submission.others && submission.others[rawKey] !== undefined) return submission.others[rawKey];
  if (submission.others && submission.others[key] !== undefined) return submission.others[key];
  return "";
}

function normalizeSubmission(submission) {
  return {
    id: submission.id,
    contact_id: submission.contactId,
    created_at: submission.createdAt,
    form_id: submission.formId,
    first_name: readField(submission, "first_name"),
    last_name: readField(submission, "last_name"),
    full_name: submission.name || [readField(submission, "first_name"), readField(submission, "last_name")].filter(Boolean).join(" "),
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

async function bosshubRequest(path, query = {}) {
  if (!bhToken) throw new Error("BOSSHUB_ACCESS_TOKEN is not configured.");
  const url = new URL(`${bhBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${bhToken}`,
      version: bhApiVersion,
    },
  });
  const text = await response.text();
  let body = {};
  if (text) {
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
  }
  if (!response.ok) {
    throw new Error(JSON.stringify({ status: response.status, statusText: response.statusText, body }));
  }
  return body;
}

server.tool(
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
    if (!bhToken) {
      return jsonResponse(blocked("BOSSHUB_ACCESS_TOKEN is not configured.", {
        required_scope: "forms.readonly",
        location_id: bhLocationId,
        form_id: bhFormId,
      }));
    }
    const result = await bosshubRequest("/forms/submissions", {
      locationId: bhLocationId,
      formId: bhFormId,
      page,
      limit,
      q,
      startAt,
      endAt,
    });
    return jsonResponse(ok({
      submissions: (result.submissions || []).map(normalizeSubmission),
      meta: result.meta || {},
    }));
  }
);

server.tool(
  "bosshub_get_member_inquiry",
  "Find one member inquiry submission by submission ID, email, or name.",
  { query: z.string().min(1) },
  async ({ query }) => {
    if (!bhToken) {
      return jsonResponse(blocked("BOSSHUB_ACCESS_TOKEN is not configured.", { query, required_scope: "forms.readonly" }));
    }
    const result = await bosshubRequest("/forms/submissions", {
      locationId: bhLocationId,
      formId: bhFormId,
      q: query,
      page: 1,
      limit: 20,
    });
    const submissions = (result.submissions || []).map(normalizeSubmission);
    const exact = submissions.find(
      (s) =>
        s.id === query ||
        s.email?.toLowerCase() === query.toLowerCase() ||
        s.full_name?.toLowerCase() === query.toLowerCase()
    );
    return jsonResponse(ok({ match: exact || null, candidates: exact ? [] : submissions, meta: result.meta || {} }));
  }
);

// ─── Verkada ──────────────────────────────────────────────────────────────────

const vkApiKey = process.env.VERKADA_API_KEY || "";
const vkRegion = process.env.VERKADA_REGION || "api";
const vkDefaultGroupId = process.env.VERKADA_DEFAULT_ACCESS_GROUP_ID || "1018efcf-5d11-4a3d-b01a-57bd8d3cd346";
const vkDryRun = process.env.VERKADA_DRY_RUN !== "false";

let vkSessionToken = null;
let vkTokenExpiresAt = 0;

function vkBaseUrl() {
  return `https://${vkRegion}.verkada.com`;
}

async function getVerkadaToken() {
  if (vkSessionToken && Date.now() < vkTokenExpiresAt) return vkSessionToken;
  const response = await fetch(`${vkBaseUrl()}/token`, {
    method: "POST",
    headers: { accept: "application/json", "x-api-key": vkApiKey },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.token) {
    throw new Error(JSON.stringify({ status: response.status, body, message: "Failed to obtain Verkada session token" }));
  }
  vkSessionToken = body.token;
  vkTokenExpiresAt = Date.now() + 25 * 60 * 1000;
  return vkSessionToken;
}

async function verkadaRequest(path, options = {}) {
  if (!vkApiKey) throw new Error("VERKADA_API_KEY is not configured.");
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
  let body = {};
  if (text) {
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
  }
  if (!response.ok) {
    throw new Error(JSON.stringify({ status: response.status, statusText: response.statusText, body }));
  }
  return body;
}

server.tool(
  "verkada_find_access_user",
  "Find a Verkada access user by email address.",
  { email: z.string().email() },
  async ({ email }) => {
    if (!vkApiKey) return jsonResponse(blocked("VERKADA_API_KEY is not configured.", { email }));
    const result = await verkadaRequest(`/access/v1/access_users/user?email=${encodeURIComponent(email)}`);
    return jsonResponse(ok({ user: result }));
  }
);

server.tool(
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
    if (!vkApiKey) return jsonResponse(blocked("VERKADA_API_KEY is not configured.", { payload }));
    if (vkDryRun) return jsonResponse(blocked("VERKADA_DRY_RUN is enabled. Set VERKADA_DRY_RUN=false to create users.", { payload }));
    const result = await verkadaRequest("/core/v1/user", { method: "POST", body: JSON.stringify(payload) });
    return jsonResponse(ok({ user: result }));
  }
);

server.tool(
  "verkada_list_access_groups",
  "List Verkada access groups so the correct group ID can be configured.",
  {},
  async () => {
    if (!vkApiKey) return jsonResponse(blocked("VERKADA_API_KEY is not configured."));
    const result = await verkadaRequest("/access/v1/access_groups");
    return jsonResponse(ok({ access_groups: result }));
  }
);

server.tool(
  "verkada_add_user_to_access_group",
  "Add a Verkada access user to an access group.",
  {
    user_id: z.string().optional(),
    external_id: z.string().optional(),
    group_id: z.string().optional(),
  },
  async ({ user_id, external_id, group_id }) => {
    const resolvedGroupId = group_id || vkDefaultGroupId;
    if (!user_id && !external_id) return jsonResponse(blocked("Either user_id or external_id is required."));
    if (!resolvedGroupId) return jsonResponse(blocked("No Verkada access group is configured.", { required_env: "VERKADA_DEFAULT_ACCESS_GROUP_ID" }));
    const payload = user_id ? { user_id } : { external_id };
    if (!vkApiKey) return jsonResponse(blocked("VERKADA_API_KEY is not configured.", { payload }));
    if (vkDryRun) return jsonResponse(blocked("VERKADA_DRY_RUN is enabled. Set VERKADA_DRY_RUN=false to assign access.", { group_id: resolvedGroupId, payload }));
    const result = await verkadaRequest(
      `/access/v1/access_groups/group/user?group_id=${encodeURIComponent(resolvedGroupId)}`,
      { method: "PUT", body: JSON.stringify(payload) }
    );
    return jsonResponse(ok({ access_assignment: result }));
  }
);

// ─── Nexudus ──────────────────────────────────────────────────────────────────

const nxBaseUrl = process.env.NEXUDUS_API_BASE_URL || "https://spaces.nexudus.com";
const nxStaticToken = process.env.NEXUDUS_ACCESS_TOKEN || "";
const nxUsername = process.env.NEXUDUS_USERNAME || "";
const nxPassword = process.env.NEXUDUS_PASSWORD || "";
const nxTotp = process.env.NEXUDUS_TOTP || "";
const nxBusinessId = process.env.NEXUDUS_BUSINESS_ID || "1420978999";
const nxDryRun = process.env.NEXUDUS_DRY_RUN !== "false";
let nxCachedToken = nxStaticToken;

function nxMissingConfig() {
  const missing = [];
  if (!nxStaticToken && (!nxUsername || !nxPassword)) {
    missing.push("NEXUDUS_USERNAME + NEXUDUS_PASSWORD (or NEXUDUS_ACCESS_TOKEN)");
  }
  if (!nxBusinessId) missing.push("NEXUDUS_BUSINESS_ID");
  return missing;
}

async function getNexudusToken() {
  if (nxCachedToken) return nxCachedToken;
  if (!nxUsername || !nxPassword) throw new Error("Nexudus credentials are not configured.");
  const params = new URLSearchParams({ grant_type: "password", username: nxUsername, password: nxPassword });
  if (nxTotp) params.set("totp", nxTotp);
  const response = await fetch(`${nxBaseUrl}/api/token`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(JSON.stringify({ status: response.status, body }));
  nxCachedToken = body.access_token || "";
  if (!nxCachedToken) throw new Error("Nexudus token response did not include access_token.");
  return nxCachedToken;
}

async function nxDoFetch(path, token, options = {}) {
  const response = await fetch(`${nxBaseUrl}${path}`, {
    ...options,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = {};
  if (text) {
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
  }
  return { status: response.status, ok: response.ok, body };
}

async function nexudusRequest(path, options = {}) {
  const missing = nxMissingConfig();
  if (missing.length) throw new Error(`Missing Nexudus configuration: ${missing.join(", ")}`);
  let token = await getNexudusToken();
  let { status, ok: isOk, body } = await nxDoFetch(path, token, options);
  if (status === 401) {
    nxCachedToken = "";
    token = await getNexudusToken();
    ({ ok: isOk, body } = await nxDoFetch(path, token, options));
  }
  if (!isOk) throw new Error(JSON.stringify({ status, body }));
  return body;
}

server.tool(
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

server.tool(
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
      BusinessId: parseInt(nxBusinessId, 10),
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

server.tool(
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

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
