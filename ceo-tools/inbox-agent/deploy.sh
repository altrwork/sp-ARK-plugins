#!/usr/bin/env bash
set -euo pipefail

# One-time setup: creates the agent, environment, vault + MCP credential, and the
# scheduled deployment. Run this once. If you edit inbox-agent.agent.yaml or
# inbox-agent.environment.yaml later, use `ant beta:agents update --agent-id "$AGENT_ID"
# --version N < inbox-agent.agent.yaml` (and the environment equivalent) instead of
# re-running this whole script.
#
# Prerequisite: fill in the vault credential block below with real tokens from Becca's
# Microsoft OAuth consent — see README.md "One-time OAuth setup" before running.

cd "$(dirname "$0")"

echo "Creating agent..."
AGENT_ID=$(ant beta:agents create < inbox-agent.agent.yaml --transform id -r)
echo "AGENT_ID=$AGENT_ID"

echo "Creating environment..."
ENV_ID=$(ant beta:environments create < inbox-agent.environment.yaml --transform id -r)
echo "ENV_ID=$ENV_ID"

echo "Creating vault..."
VAULT_ID=$(ant beta:vaults create --name "sp-ark-inbox-agent-vault" --transform id -r)
echo "VAULT_ID=$VAULT_ID"

echo "Creating MCP OAuth credential — replace the REPLACE_ME values below with the"
echo "tokens captured from Becca's OAuth consent (see README.md) before this succeeds."
ant beta:vaults:credentials create --vault-id "$VAULT_ID" <<'YAML'
display_name: "CEO Tools MCP (Becca)"
auth:
  type: mcp_oauth
  mcp_server_url: https://sp-ark-operations-mcp.jarred-823.workers.dev/mcp
  access_token: "REPLACE_ME"
  expires_at: "REPLACE_ME"
  refresh:
    refresh_token: "REPLACE_ME"
    client_id: "REPLACE_ME"
    token_endpoint: "https://login.microsoftonline.com/REPLACE_TENANT_ID/oauth2/v2.0/token"
    token_endpoint_auth:
      type: none
YAML

echo ""
echo "Creating scheduled deployment (hourly)..."
# `ant beta:deployments` is one of the newest Managed Agents resources — verify your
# installed CLI has it first:
#   ant beta:deployments --help
# If that errors, use the raw HTTP fallback documented in README.md instead.
ant beta:deployments create <<YAML
name: sp-ark-inbox-agent-schedule
agent: $AGENT_ID
environment_id: $ENV_ID
vault_ids: ["$VAULT_ID"]
initial_events:
  - type: user.message
    content:
      - type: text
        text: "Check Becca's inbox for new Calendly Notetaker summary emails and draft any delegation emails that are warranted, per your instructions."
schedule:
  type: cron
  expression: "0 * * * *"
  timezone: America/New_York
YAML

echo ""
echo "Done. The deployment response above includes schedule.upcoming_runs_at — confirm"
echo "the times look right. To test immediately without waiting for the schedule:"
echo "  ant beta:deployments run --deployment-id <depl_...>"
