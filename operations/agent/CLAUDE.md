# operations/agent

This directory contains the managed agent definition for the sp-ARK Operations
agent deployed to the Anthropic Claude Console.

## What Is This

`agent.yaml` defines a Claude Managed Agent (beta) — a versioned, server-hosted
agent configuration that lives on Anthropic's platform and runs on-demand via
sessions. The agent wraps the two member onboarding skills from the parent
`operations/` plugin.

Docs:
- Overview: https://platform.claude.com/docs/en/managed-agents/overview
- Quickstart: https://platform.claude.com/docs/en/managed-agents/quickstart
- API reference: https://platform.claude.com/docs/en/managed-agents/api

## Environment Variables

Copy `.env.example` → `.env` and fill in values. Never commit `.env`.

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key with managed-agents beta access |
| `SP_ARK_AGENT_ID` | Returned by deploy.sh on first create; paste it back here |

## MCP Placeholder Steps

Before running `deploy.sh` you must replace the two placeholder URLs in
`agent.yaml`:

1. Open Claude Console → **Integrations**.
2. Find **DocuSign** → copy its MCP endpoint URL → replace
   `<PLACEHOLDER: Claude Console → Integrations → DocuSign → copy MCP URL>`.
3. Find **Microsoft 365** → copy its MCP endpoint URL → replace
   `<PLACEHOLDER: Claude Console → Integrations → Microsoft 365 → copy MCP URL>`.

The `sp-ark-operations` URL is already set — it's the Cloudflare Worker at
`https://sp-ark-operations-mcp.jarred-823.workers.dev`.

## Deploy

```bash
cd operations/agent
cp .env.example .env   # fill in ANTHROPIC_API_KEY
# fill in MCP placeholder URLs in agent.yaml (see above)
bash scripts/deploy.sh
```

First run creates the agent and prints its ID. Paste the ID into `.env` as
`SP_ARK_AGENT_ID`. Subsequent runs update the existing agent.

## Files

```
agent/
├── agent.yaml          # Agent definition — edit this to update the agent
├── CLAUDE.md           # This file
├── .env                # Local secrets (gitignored)
├── .env.example        # Template for required env vars
└── scripts/
    └── deploy.sh       # Upload skills + create/update agent via ant CLI
```

## Agent ID

Once deployed, paste the returned agent ID here:

```
SP_ARK_AGENT_ID=<paste here after first deploy>
```
