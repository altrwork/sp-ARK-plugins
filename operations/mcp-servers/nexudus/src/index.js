#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "sp-ark-nexudus",
  version: "0.1.0",
});

const apiBaseUrl = process.env.NEXUDUS_API_BASE_URL || "https://spaces.nexudus.com";
const accessToken = process.env.NEXUDUS_ACCESS_TOKEN || "";
const username = process.env.NEXUDUS_USERNAME || "";
const password = process.env.NEXUDUS_PASSWORD || "";
const totp = process.env.NEXUDUS_TOTP || "";
const businessId = process.env.NEXUDUS_BUSINESS_ID || "";
const defaultPlanId = process.env.NEXUDUS_DEFAULT_PLAN_ID || "";
const personType = process.env.NEXUDUS_PERSON_TYPE || "";
const dryRun = process.env.NEXUDUS_DRY_RUN !== "false";
let cachedAccessToken = accessToken;

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

function missingConfig() {
  const missing = [];
  if (!apiBaseUrl) missing.push("NEXUDUS_API_BASE_URL");
  if (!accessToken && (!username || !password)) {
    missing.push("NEXUDUS_USERNAME + NEXUDUS_PASSWORD (or NEXUDUS_ACCESS_TOKEN for one-off use)");
  }
  if (!businessId) missing.push("NEXUDUS_BUSINESS_ID");
  return missing;
}

async function getAccessToken() {
  if (cachedAccessToken) {
    return cachedAccessToken;
  }

  if (!username || !password) {
    throw new Error("Nexudus credentials are not configured.");
  }

  const params = new URLSearchParams({
    grant_type: "password",
    username,
    password,
  });

  if (totp) {
    params.set("totp", totp);
  }

  const response = await fetch(`${apiBaseUrl}/api/token`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      JSON.stringify({
        status: response.status,
        statusText: response.statusText,
        body,
      })
    );
  }

  cachedAccessToken = body.access_token || "";
  if (!cachedAccessToken) {
    throw new Error("Nexudus token response did not include access_token.");
  }

  return cachedAccessToken;
}

async function doFetch(path, token, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
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
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  return { status: response.status, ok: response.ok, body };
}

async function request(path, options = {}) {
  const missing = missingConfig();
  if (missing.length) {
    throw new Error(`Missing Nexudus configuration: ${missing.join(", ")}`);
  }

  let token = await getAccessToken();
  let { status, ok, body } = await doFetch(path, token, options);

  if (status === 401) {
    // Token expired — clear cache and retry once with fresh credentials
    cachedAccessToken = "";
    token = await getAccessToken();
    ({ ok, body } = await doFetch(path, token, options));
  }

  if (!ok) {
    throw new Error(JSON.stringify({ status, body }));
  }

  return body;
}

server.tool(
  "nexudus_find_person",
  "Find a Nexudus coworker/member by email address.",
  {
    email: z.string().email(),
  },
  async ({ email }) => {
    const missing = missingConfig();
    if (missing.length) {
      return jsonResponse(blocked("Nexudus API configuration is incomplete.", { missing, email }));
    }

    const result = await request(
      `/api/spaces/coworkers?Coworker_Email=${encodeURIComponent(email)}&size=5`
    );

    const records = result.Records || [];
    if (records.length === 0) {
      return jsonResponse(ok({ found: false, email, coworker: null }));
    }

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
      BusinessId: parseInt(businessId, 10),
      TariffId: tariff_id,
      CountryId: 1221,
      SimpleTimeZoneId: 2013,
    };

    const missing = missingConfig();
    if (missing.length) {
      return jsonResponse(blocked("Nexudus API configuration is incomplete.", { missing, payload }));
    }

    if (dryRun) {
      return jsonResponse(
        blocked("NEXUDUS_DRY_RUN is enabled. Set NEXUDUS_DRY_RUN=false to create coworkers.", {
          payload,
        })
      );
    }

    const result = await request("/api/spaces/coworkers", {
      method: "POST",
      body: JSON.stringify(payload),
    });

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
    const missing = missingConfig();
    if (missing.length) {
      return jsonResponse(blocked("Nexudus API configuration is incomplete.", { missing }));
    }

    if (dryRun) {
      return jsonResponse(
        blocked("NEXUDUS_DRY_RUN is enabled. Set NEXUDUS_DRY_RUN=false to assign plans.", {
          coworker_id,
          tariff_id,
        })
      );
    }

    const result = await request(`/api/spaces/coworkers/${coworker_id}`, {
      method: "PUT",
      body: JSON.stringify({ Id: coworker_id, TariffId: tariff_id }),
    });

    return jsonResponse(ok({ coworker: result }));
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
