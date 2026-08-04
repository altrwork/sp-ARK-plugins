#!/usr/bin/env bash
set -euo pipefail

# One-time setup: creates the agent, environment, vault + MCP credential, and the
# scheduled deployment. Run this once. If you edit friends-of-spark-agent.agent.yaml or
# friends-of-spark-agent.environment.yaml later, use `ant beta:agents update --agent-id
# "$AGENT_ID" --version N < friends-of-spark-agent.agent.yaml` (and the environment
# equivalent) instead of re-running this whole script.
#
# Prerequisite: send Caitlin https://sp-ark-operations-mcp.jarred-823.workers.dev/mint-credential
# (see README.md "One-time OAuth setup"), then export what she sends back as env vars
# before running this script — never paste real token values directly into this file:
#   export MCP_ACCESS_TOKEN="..."
#   export MCP_EXPIRES_AT="..."
#   export MCP_REFRESH_TOKEN="..."
#   export MCP_CLIENT_ID="..."
#
# Note: this agent is already deployed (see README.md "Deployed resource IDs") — only
# re-run this script if setting up from scratch again (e.g. a full re-deploy).

cd "$(dirname "$0")"

for var in MCP_ACCESS_TOKEN MCP_EXPIRES_AT MCP_REFRESH_TOKEN MCP_CLIENT_ID; do
	if [ -z "${!var:-}" ]; then
		echo "Missing required env var: $var (see prerequisite comment above)" >&2
		exit 1
	fi
done

echo "Creating agent..."
AGENT_ID=$(ant beta:agents create < friends-of-spark-agent.agent.yaml --transform id -r)
echo "AGENT_ID=$AGENT_ID"

echo "Creating environment..."
ENV_ID=$(ant beta:environments create < friends-of-spark-agent.environment.yaml --transform id -r)
echo "ENV_ID=$ENV_ID"

echo "Creating vault..."
VAULT_ID=$(ant beta:vaults create --display-name "sp-ark-friends-of-spark-agent-vault" --transform id -r)
echo "VAULT_ID=$VAULT_ID"

echo "Creating MCP OAuth credential from MCP_ACCESS_TOKEN / MCP_REFRESH_TOKEN / MCP_CLIENT_ID..."
ant beta:vaults:credentials create --vault-id "$VAULT_ID" <<YAML
display_name: "Operations MCP (Caitlin)"
auth:
  type: mcp_oauth
  mcp_server_url: https://sp-ark-operations-mcp.jarred-823.workers.dev/mcp
  access_token: "$MCP_ACCESS_TOKEN"
  expires_at: "$MCP_EXPIRES_AT"
  refresh:
    refresh_token: "$MCP_REFRESH_TOKEN"
    client_id: "$MCP_CLIENT_ID"
    token_endpoint: "https://sp-ark-operations-mcp.jarred-823.workers.dev/token"
    token_endpoint_auth:
      type: none
YAML

echo ""
echo "Creating scheduled deployment (daily, 8am Eastern)..."
# `ant beta:deployments` is one of the newest Managed Agents resources — verify your
# installed CLI has it first:
#   ant beta:deployments --help
# If that errors, use the raw HTTP fallback documented in README.md instead.
ant beta:deployments create <<YAML
name: sp-ark-friends-of-spark-agent-schedule
agent: $AGENT_ID
environment_id: $ENV_ID
vault_ids: ["$VAULT_ID"]
initial_events:
  - type: user.message
    content:
      - type: text
        text: "Run the Friends of spARK check: scan the Payment Form for new payments and already-onboarded members due for a Lunch & Learn or renewal reminder, and draft whatever follow-ups are due, per your instructions."
schedule:
  type: cron
  expression: "0 8 * * *"
  timezone: America/New_York
YAML

echo ""
echo "Done. The deployment response above includes schedule.upcoming_runs_at — confirm"
echo "the times look right. To test immediately without waiting for the schedule:"
echo "  ant beta:deployments run --deployment-id <depl_...>"
