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
  if (!cachedAccessToken && (!username || !password)) {
    missing.push("NEXUDUS_ACCESS_TOKEN or NEXUDUS_USERNAME/NEXUDUS_PASSWORD");
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

async function request(path, options = {}) {
  const missing = missingConfig();
  if (missing.length) {
    throw new Error(`Missing Nexudus configuration: ${missing.join(", ")}`);
  }

  const token = await getAccessToken();

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
  "nexudus_find_person",
  "Find a Nexudus person/customer/member/contact by email.",
  {
    email: z.string().email(),
  },
  async ({ email }) => {
    const missing = missingConfig();
    if (missing.length) {
      return jsonResponse(
        blocked("Nexudus API configuration is incomplete.", {
          missing,
          email,
        })
      );
    }

    return jsonResponse(
      blocked("Nexudus lookup endpoint is pending account-specific API confirmation.", {
        email,
      })
    );
  }
);

server.tool(
  "nexudus_create_person",
  "Create the Nexudus person record needed for booking access.",
  {
    first_name: z.string().min(1),
    last_name: z.string().min(1),
    email: z.string().email(),
    person_type: z.enum(["member", "contact"]).optional(),
  },
  async ({ first_name, last_name, email, person_type }) => {
    const resolvedPersonType = person_type || personType;
    const payload = {
      first_name,
      last_name,
      email,
      person_type: resolvedPersonType,
      business_id: businessId,
    };

    if (!resolvedPersonType) {
      return jsonResponse(
        blocked("Nexudus person type is not configured. Edwin must confirm member or contact.", {
          payload,
          required_env: "NEXUDUS_PERSON_TYPE",
        })
      );
    }

    const missing = missingConfig();
    if (missing.length) {
      return jsonResponse(blocked("Nexudus API configuration is incomplete.", { missing, payload }));
    }

    if (dryRun) {
      return jsonResponse(
        blocked("NEXUDUS_DRY_RUN is enabled. Set NEXUDUS_DRY_RUN=false after endpoint confirmation.", {
          payload,
        })
      );
    }

    return jsonResponse(
      blocked("Nexudus create endpoint is pending account-specific API confirmation.", {
        payload,
      })
    );
  }
);

server.tool(
  "nexudus_assign_booking_access",
  "Assign the plan/product required for Nexudus room booking access.",
  {
    person_id: z.string().min(1),
    plan_id: z.string().optional(),
  },
  async ({ person_id, plan_id }) => {
    const resolvedPlanId = plan_id || defaultPlanId;

    if (!resolvedPlanId) {
      return jsonResponse(
        blocked("No Nexudus booking access plan/product is configured.", {
          person_id,
          required_env: "NEXUDUS_DEFAULT_PLAN_ID",
        })
      );
    }

    const missing = missingConfig();
    if (missing.length) {
      return jsonResponse(
        blocked("Nexudus API configuration is incomplete.", {
          missing,
          person_id,
          plan_id: resolvedPlanId,
        })
      );
    }

    if (dryRun) {
      return jsonResponse(
        blocked("NEXUDUS_DRY_RUN is enabled. Set NEXUDUS_DRY_RUN=false after endpoint confirmation.", {
          person_id,
          plan_id: resolvedPlanId,
        })
      );
    }

    return jsonResponse(
      blocked("Nexudus booking access endpoint is pending account-specific API confirmation.", {
        person_id,
        plan_id: resolvedPlanId,
      })
    );
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
