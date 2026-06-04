#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "sp-ark-bosshub",
  version: "0.1.0",
});

const apiBaseUrl = process.env.BOSSHUB_API_BASE_URL || "https://services.leadconnectorhq.com";
const accessToken = process.env.BOSSHUB_ACCESS_TOKEN || process.env.LEADCONNECTOR_ACCESS_TOKEN || "";
const locationId = process.env.BOSSHUB_LOCATION_ID || "jqh6rxfWtvMIQCKxcDlc";
const formId = process.env.BOSSHUB_FORM_ID || "Ftg5p93SEeTnUWiyAgYn";
const apiVersion = process.env.BOSSHUB_API_VERSION || "2023-02-21";

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

function blocked(reason, details = {}) {
  return {
    status: "blocked",
    reason,
    ...details,
  };
}

function ok(data) {
  return {
    status: "ok",
    ...data,
  };
}

function jsonResponse(payload) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

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

async function request(path, query = {}) {
  if (!accessToken) {
    throw new Error("BOSSHUB_ACCESS_TOKEN or LEADCONNECTOR_ACCESS_TOKEN is not configured.");
  }

  const url = new URL(`${apiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      version: apiVersion,
    },
  });

  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  if (!response.ok) {
    throw new Error(
      JSON.stringify({
        status: response.status,
        statusText: response.statusText,
        body,
      })
    );
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
    if (!accessToken) {
      return jsonResponse(
        blocked("BOSSHUB_ACCESS_TOKEN or LEADCONNECTOR_ACCESS_TOKEN is not configured.", {
          required_scope: "forms.readonly",
          location_id: locationId,
          form_id: formId,
        })
      );
    }

    const result = await request("/forms/submissions", {
      locationId,
      formId,
      page,
      limit,
      q,
      startAt,
      endAt,
    });

    return jsonResponse(
      ok({
        submissions: (result.submissions || []).map(normalizeSubmission),
        meta: result.meta || {},
      })
    );
  }
);

server.tool(
  "bosshub_get_member_inquiry",
  "Find one member inquiry submission by submission ID, email, or name.",
  {
    query: z.string().min(1),
  },
  async ({ query }) => {
    if (!accessToken) {
      return jsonResponse(
        blocked("BOSSHUB_ACCESS_TOKEN or LEADCONNECTOR_ACCESS_TOKEN is not configured.", {
          query,
          required_scope: "forms.readonly",
        })
      );
    }

    const result = await request("/forms/submissions", {
      locationId,
      formId,
      q: query,
      page: 1,
      limit: 20,
    });

    const submissions = (result.submissions || []).map(normalizeSubmission);
    const exact = submissions.find(
      (submission) =>
        submission.id === query ||
        submission.email?.toLowerCase() === query.toLowerCase() ||
        submission.full_name?.toLowerCase() === query.toLowerCase()
    );

    return jsonResponse(
      ok({
        match: exact || null,
        candidates: exact ? [] : submissions,
        meta: result.meta || {},
      })
    );
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
