#!/usr/bin/env bash
# Deploy the sp-ARK Operations managed agent.
# Run from: operations/agent/
#   bash scripts/deploy.sh
#
# First run: creates agent, prints ID → paste into .env as SP_ARK_AGENT_ID
# Subsequent runs: updates existing agent to latest agent.yaml

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILLS_DIR="$(cd "$AGENT_DIR/../../skills" && pwd)"

# ── Load environment ──────────────────────────────────────────────────────────
ENV_FILE="$AGENT_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "ERROR: ANTHROPIC_API_KEY is not set. Add it to $ENV_FILE." >&2
  exit 1
fi

# ── Dependency check ──────────────────────────────────────────────────────────
if ! command -v ant &>/dev/null; then
  echo "ERROR: 'ant' CLI not found. Install it with:" >&2
  echo "  npm install -g @anthropic-ai/cli" >&2
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo "ERROR: 'jq' not found. Install it with: brew install jq" >&2
  exit 1
fi

# ── Check for MCP placeholder URLs ───────────────────────────────────────────
if grep -q '<PLACEHOLDER' "$AGENT_DIR/agent.yaml"; then
  echo "ERROR: agent.yaml still has placeholder MCP URLs." >&2
  echo "  Replace them with actual URLs from Claude Console → Integrations." >&2
  grep -n '<PLACEHOLDER' "$AGENT_DIR/agent.yaml" >&2
  exit 1
fi

BETA_HEADER="anthropic-beta: managed-agents-2026-04-01"
SKILLS_BETA_HEADER="anthropic-beta: skills-2025-10-02"
API_BASE="https://api.anthropic.com/v1"

# ── Upload skills ─────────────────────────────────────────────────────────────
upload_skill() {
  local name="$1"
  local skill_md_path="$2"

  if [[ ! -f "$skill_md_path" ]]; then
    echo "WARNING: SKILL.md not found at $skill_md_path — skipping skill upload." >&2
    return
  fi

  echo "Uploading skill: $name ..."

  local content
  content=$(cat "$skill_md_path")

  local response
  response=$(curl -s -X POST "$API_BASE/skills" \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -H "$SKILLS_BETA_HEADER" \
    -H "content-type: application/json" \
    --data "$(jq -n \
      --arg name "$name" \
      --arg content "$content" \
      '{name: $name, content: $content}')")

  local skill_id
  skill_id=$(echo "$response" | jq -r '.id // empty')

  if [[ -z "$skill_id" ]]; then
    echo "ERROR: Failed to upload skill '$name'." >&2
    echo "  Response: $response" >&2
    exit 1
  fi

  echo "  Uploaded → $skill_id"
  echo "$skill_id"
}

echo "=== Uploading skills ==="
SKILL_ID_SMA=$(upload_skill \
  "send-member-agreement" \
  "$SKILLS_DIR/send-member-agreement/SKILL.md")

SKILL_ID_AMA=$(upload_skill \
  "activate-member-access" \
  "$SKILLS_DIR/activate-member-access/SKILL.md")

# ── Inject skill IDs into a temp copy of agent.yaml ──────────────────────────
TEMP_YAML=$(mktemp /tmp/sp-ark-agent-XXXXXX.yaml)
trap 'rm -f "$TEMP_YAML"' EXIT

cp "$AGENT_DIR/agent.yaml" "$TEMP_YAML"

if [[ -n "${SKILL_ID_SMA:-}" && -n "${SKILL_ID_AMA:-}" ]]; then
  # Uncomment the skills block and inject IDs
  python3 - "$TEMP_YAML" "$SKILL_ID_SMA" "$SKILL_ID_AMA" <<'PYEOF'
import sys, re

path, sma_id, ama_id = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path) as f:
    text = f.read()

# Replace the commented skills block with live IDs
skills_block = f"""skills:
  - skill_id: "{sma_id}"
  - skill_id: "{ama_id}"
"""
text = re.sub(
    r'^# skills:.*?(?=^\w|\Z)',
    skills_block,
    text,
    flags=re.MULTILINE | re.DOTALL
)

with open(path, 'w') as f:
    f.write(text)
PYEOF
  echo ""
  echo "Skills injected into agent definition:"
  echo "  send-member-agreement  → $SKILL_ID_SMA"
  echo "  activate-member-access → $SKILL_ID_AMA"
fi

# ── Create or update the agent ────────────────────────────────────────────────
echo ""
echo "=== Deploying agent ==="

if [[ -n "${SP_ARK_AGENT_ID:-}" ]]; then
  echo "Updating existing agent: $SP_ARK_AGENT_ID"
  ant beta:agents update "$SP_ARK_AGENT_ID" < "$TEMP_YAML"
  echo ""
  echo "Agent updated: $SP_ARK_AGENT_ID"
else
  echo "Creating new agent ..."
  AGENT_RESPONSE=$(ant beta:agents create < "$TEMP_YAML" --json 2>/dev/null || ant beta:agents create < "$TEMP_YAML")
  NEW_AGENT_ID=$(echo "$AGENT_RESPONSE" | jq -r '.id // empty' 2>/dev/null || true)

  echo ""
  if [[ -n "$NEW_AGENT_ID" ]]; then
    echo "Agent created: $NEW_AGENT_ID"
    echo ""
    echo "Next step: add this line to $ENV_FILE"
    echo "  SP_ARK_AGENT_ID=$NEW_AGENT_ID"
    echo ""
    echo "Then also add it to CLAUDE.md in this directory."
  else
    echo "Agent created. Check the output above for the agent ID."
    echo "$AGENT_RESPONSE"
  fi
fi
