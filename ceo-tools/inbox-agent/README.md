# sp-ARK Inbox Agent

Reads Becca's Outlook inbox for Calendly Notetaker call summaries, judges whether a
call needs internal follow-up, and drafts (never sends) a delegation email in her
voice via the CEO Tools MCP server.

## How it's built

- **Execution platform:** Anthropic Managed Agents, run on a **scheduled deployment**
  (cron, every 30 min) — no external scheduler needed.
- **Tools:** the agent calls the
  [`sp-ark-operations-mcp`](../../operations/mcp-servers/remote/) Cloudflare Worker as an
  MCP server (`outlook_list_emails` / `outlook_search_emails` / `outlook_read_email` /
  `outlook_create_draft`), allowlisted to exactly those four tools via `configs` on the
  `mcp_toolset` entry in `inbox-agent.agent.yaml` — the worker itself also serves
  Verkada/Nexudus/BossHub and every other Outlook tool, so this narrows the agent to
  read-only + draft-only regardless of what else the server exposes. Fully delegated
  Graph access — no fixed-mailbox client-credentials token, no Exchange Application
  Access Policy to misconfigure (the former `sp-ark-ceo-tools` worker used that pattern
  and was retired 2026-07-17; see root CLAUDE.md).
- **Credentials:** the MCP OAuth token lives in an Anthropic-managed **vault**, never in
  the agent's prompt or context.

## Files

| File | Purpose |
|---|---|
| `inbox-agent.agent.yaml` | Agent config — model, system prompt (roster + rules baked in), MCP server declaration |
| `inbox-agent.environment.yaml` | Environment (container) config |
| `deploy.sh` | One-time setup: creates agent, environment, vault + credential, scheduled deployment |
| `roster.md` | Human-maintained source of truth for who owns what — keep in sync with the agent's system prompt |
| `log/` | Reserved for a future memory-store-backed learning loop (not wired up yet — see Known limitations) |

## One-time OAuth setup (required before `deploy.sh` works)

The operations worker only issues tools to its `ALLOWED_EMAILS` allowlist (see
`operations/mcp-servers/remote/src/index.ts`) — `brownr@sp-ark-labs.com` (Becca) is
already on it. The vault credential that lets the scheduled agent call those tools has
to come from an OAuth consent completed **as Becca**, since drafts need to land in her
own mailbox via her own delegated token. Concretely:

1. Run `node mint-vault-credential.mjs` and have Becca (or someone with her Microsoft
   credentials) open the printed URL and sign in.
2. The script prints the resulting `access_token`, `refresh_token`, `expires_at`,
   `client_id`, and `token_endpoint` directly — no manual capture needed.
3. Fill those into the `ant beta:vaults:credentials create` block inside `deploy.sh`
   (replace every `REPLACE_ME`).

This is the one manual step in an otherwise fully-scripted deploy — there's no way
around it, since the worker's security model deliberately requires the signed-in
identity to be Becca's.

## Deploy

```sh
./deploy.sh
```

Creates, in order: the agent, the environment, a vault + MCP credential, and a
scheduled deployment firing every 30 minutes. Check the deployment response's
`schedule.upcoming_runs_at` to confirm the cadence looks right.

## Test without waiting for the schedule

```sh
ant beta:deployments run --deployment-id <depl_...>
```

Manual runs work even while... well, there's no pause yet on a fresh deploy, but this
is also how you'll re-test after any config change.

## Updating the agent later

Don't re-run `deploy.sh` (it creates a *new* agent/environment/vault). Instead:

```sh
ant beta:agents update --agent-id "$AGENT_ID" --version <current-version> < inbox-agent.agent.yaml
```

## Known limitations (v1)

- **No cross-run memory.** Each scheduled firing is a fresh session with no persistent
  state, so dedup relies on the agent noticing an existing draft for the same meeting
  and on the ~90-minute lookback window in the system prompt roughly matching the
  30-minute poll cadence. If this produces duplicate drafts in practice, the fix is a
  **Memory Store** (`shared/managed-agents-memory.md`) attached to each deployment
  session to track which emails have already been processed — deferred for v1 to keep
  the first version simple.
- **No automated learning loop yet.** The original design included logging
  draft-vs-actually-sent diffs for periodic review (to catch Becca's edits and improve
  future drafts). That also wants a Memory Store and isn't built yet — `log/` is a
  placeholder for it.
- **Cassandra's email is missing from `roster.md`** — get it from Becca before the
  agent needs to add her as a direct recipient.
- **Shadow-mode rollout is informal.** There's no separate "shadow" code path — the
  agent only ever drafts (never sends), so the built-in safety net is real from day
  one. "Shadow mode" here just means: watch the drafts closely for the first couple
  weeks before trusting the cadence, per the agreed rollout bar.
