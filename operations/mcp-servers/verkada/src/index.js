#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "sp-ark-verkada",
  version: "0.1.0",
});

const apiKey = process.env.VERKADA_API_KEY || "";
const region = process.env.VERKADA_REGION || "api";
const defaultAccessGroupId = process.env.VERKADA_DEFAULT_ACCESS_GROUP_ID || "";
const dryRun = process.env.VERKADA_DRY_RUN !== "false";

let cachedSessionToken = null;
let tokenExpiresAt = 0;

function baseUrl() {
  return `https://${region}.verkada.com`;
}

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

async function getSessionToken() {
  if (cachedSessionToken && Date.now() < tokenExpiresAt) {
    return cachedSessionToken;
  }

  const response = await fetch(`${baseUrl()}/token`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "x-api-key": apiKey,
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.token) {
    throw new Error(
      JSON.stringify({ status: response.status, body, message: "Failed to obtain Verkada session token" })
    );
  }

  cachedSessionToken = body.token;
  tokenExpiresAt = Date.now() + 25 * 60 * 1000; // 25 min (tokens last 30 min)
  return cachedSessionToken;
}

async function request(path, options = {}) {
  if (!apiKey) {
    throw new Error("VERKADA_API_KEY is not configured.");
  }

  const token = await getSessionToken();

  const response = await fetch(`${baseUrl()}${path}`, {
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
  "verkada_find_access_user",
  "Find a Verkada access user by email address.",
  {
    email: z.string().email(),
  },
  async ({ email }) => {
    if (!apiKey) {
      return jsonResponse(blocked("VERKADA_API_KEY is not configured.", { email }));
    }

    const result = await request(
      `/access/v1/access_users/user?email=${encodeURIComponent(email)}`
    );

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
    const payload = {
      first_name,
      last_name,
      email,
      external_id: external_id || email,
    };

    if (!apiKey) {
      return jsonResponse(blocked("VERKADA_API_KEY is not configured.", { payload }));
    }

    if (dryRun) {
      return jsonResponse(
        blocked("VERKADA_DRY_RUN is enabled. Set VERKADA_DRY_RUN=false to create users.", {
          payload,
        })
      );
    }

    const result = await request("/core/v1/user", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return jsonResponse(ok({ user: result }));
  }
);

server.tool(
  "verkada_list_access_groups",
  "List Verkada access groups so the correct group ID can be configured.",
  {},
  async () => {
    if (!apiKey) {
      return jsonResponse(blocked("VERKADA_API_KEY is not configured."));
    }

    const result = await request("/access/v1/access_groups");
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
    const resolvedGroupId = group_id || defaultAccessGroupId;

    if (!user_id && !external_id) {
      return jsonResponse(blocked("Either user_id or external_id is required."));
    }

    if (!resolvedGroupId) {
      return jsonResponse(
        blocked("No Verkada access group is configured.", {
          required_env: "VERKADA_DEFAULT_ACCESS_GROUP_ID",
        })
      );
    }

    const payload = user_id ? { user_id } : { external_id };

    if (!apiKey) {
      return jsonResponse(blocked("VERKADA_API_KEY is not configured.", { payload }));
    }

    if (dryRun) {
      return jsonResponse(
        blocked("VERKADA_DRY_RUN is enabled. Set VERKADA_DRY_RUN=false to assign access.", {
          group_id: resolvedGroupId,
          payload,
        })
      );
    }

    const result = await request(
      `/access/v1/access_groups/group/user?group_id=${encodeURIComponent(resolvedGroupId)}`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      }
    );

    return jsonResponse(ok({ access_assignment: result }));
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
