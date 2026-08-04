# sp-ARK Friends of spARK Agent

Runs the automated tail of the Friends of spARK email sequence (steps 6/7/8 — onboarding,
Lunch & Learn reminder, renewal reminder) on a daily schedule, and drafts (never sends)
each email into Caitlin Ryan's Outlook mailbox for her to review.

Steps 1-3 (initial invite, reply when Becca loops in, application follow-up) stay manual —
this agent doesn't touch them.

## How it's built

- **Execution platform:** Anthropic Managed Agents, run on a **scheduled deployment**
  (cron, daily at 8am Eastern) — no external scheduler needed.
- **Trigger:** there's no BossHub webhook. Every run, the agent polls
  [`sp-ark-operations-mcp`](../../operations/mcp-servers/remote/) for the Friends of
  spARK Payment Form (`wpTj12LnfXrnztBKPVqO`) and re-evaluates every paid member against
  the current date — it isn't just watching for new submissions.
- **State:** no external database or sheet. Pipeline state lives entirely as **tags on
  the BossHub/GHL contact** (`friends-onboarded`, `friends-ll-reminded`,
  `friends-renewal-reminded`), read and written via two tools added to the operations
  worker specifically for this (`bosshub_get_contact` / `bosshub_tag_contact`, using
  GHL's Contacts API — `Version: v3` header, distinct from the Forms API's version
  scheme). The BossHub Private Integration token backing `BOSSHUB_ACCESS_TOKEN` had
  `contacts.readonly` / `contacts.write` added to its existing `forms.readonly` /
  `forms.write` scopes (2026-08-03) — editing scopes on an existing GHL Private
  Integration does not rotate the token, so no Cloudflare secret change was needed.
- **Tools:** `bosshub_list_submissions`, `bosshub_get_contact`, `bosshub_tag_contact`,
  `outlook_create_draft` — allowlisted via `configs` on the `mcp_toolset` entry in
  `friends-of-spark-agent.agent.yaml`, same tight-scope pattern as `inbox-agent`. No
  `outlook_send_mail` / `outlook_send_draft` — every email is a draft, by design, not by
  omission.
- **Credentials:** the MCP OAuth token lives in an Anthropic-managed **vault**, never in
  the agent's prompt or context.
- **Cost:** model is `claude-sonnet-5` at `effort: low` — this is deterministic
  lookup-and-template logic (check tags, compare dates, fill in a fixed email body), not
  reasoning-heavy work, so there's no reason to pay for higher effort. At daily cadence
  with a handful of tool calls, expect low-single-digit-cents per run.

## Files

| File | Purpose |
|---|---|
| `friends-of-spark-agent.agent.yaml` | Agent config — model, system prompt (full pipeline logic + email templates baked in), MCP server declaration |
| `friends-of-spark-agent.environment.yaml` | Environment (container) config |
| `deploy.sh` | One-time setup: creates agent, environment, vault + credential, scheduled deployment |

## One-time OAuth setup (required before `deploy.sh` works)

The operations worker only issues tools to its `ALLOWED_EMAILS` allowlist (see
`operations/mcp-servers/remote/src/index.ts`) — `caitlinr@sp-ark-labs.com` (Caitlin) is
already on it. The vault credential that lets the scheduled agent draft into her mailbox
has to come from an OAuth consent completed **as Caitlin**, since drafts land via her own
delegated Microsoft token — same requirement `inbox-agent` has for Becca. Concretely:

1. Send Caitlin this link: `https://sp-ark-operations-mcp.jarred-823.workers.dev/mint-credential`.
   She clicks "Sign in with Microsoft," signs in as `caitlinr@sp-ark-labs.com`, and lands
   on a page showing a credential block with a copy button — no Node, no terminal, nothing
   installed. She copies that block back (Slack/email) and closes the tab.
2. Fill the copied values (`access_token`, `refresh_token`, `expires_at`, `client_id`,
   `token_endpoint`) into the `ant beta:vaults:credentials create` block inside `deploy.sh`
   (replace every `REPLACE_ME`).

This is the one manual step in an otherwise fully-scripted deploy — there's no way
around it, since the worker's security model deliberately requires the signed-in
identity to be Caitlin's. The route is `/mint-credential` in
`operations/mcp-servers/remote/src/microsoft-handler.ts` — it's a generic hosted OAuth
helper (not specific to this agent), the same one `inbox-agent` should use for Becca
instead of its own local `mint-vault-credential.mjs` script.

## Deploy

```sh
./deploy.sh
```

Creates, in order: the agent, the environment, a vault + MCP credential, and a
scheduled deployment firing daily at 8am Eastern. Check the deployment response's
`schedule.upcoming_runs_at` to confirm the cadence looks right.

## Test without waiting for the schedule

```sh
ant beta:deployments run --deployment-id <depl_...>
```

Worth running once right after deploy to confirm the whole chain — BossHub read, contact
tag read/write, draft creation — actually works end to end, rather than waiting for
tomorrow morning to find out.

## Updating the agent later

Don't re-run `deploy.sh` (it creates a *new* agent/environment/vault). Instead:

```sh
ant beta:agents update --agent-id "$AGENT_ID" --version <current-version> < friends-of-spark-agent.agent.yaml
```

## Deployed resource IDs (live as of 2026-08-03)

| Resource | ID |
|---|---|
| Agent | `agent_01Y8Ccmd2waJ1faUZNHsMuEk` |
| Environment | `env_01XJWMXo97keF3iradh6YwSF` |
| Vault | `vlt_011Cdg6mctPgbXycQMufEsUu` |
| Vault credential | `vcrd_01B2vfMURDskgohadtSSq1SV` (Caitlin's Microsoft token, auto-refreshes) |
| Scheduled deployment | `depl_01PTqZuofq5YZSLV1hoc7RfV` (daily, 8am America/New_York) |

First manual test run (`drun_01Jpp8TWyXasvdNS8J2ephrv`) confirmed correct behavior: read all 3
Payment Form submissions, saw `friends-onboarded` already on all three from the backfill,
correctly skipped duplicate onboarding drafts, and correctly determined none are within the
6-month/11-month windows yet. Zero drafts created — the expected result, not a failure.

## Backfill (done 2026-08-03)

The three members who'd already paid and been manually onboarded before this agent
existed — Gary Hensley, Aissa McGuirl, Nicole Potts Hart — were tagged `friends-onboarded`
directly in the BossHub UI, so the first scheduled run treats them as already handled
instead of drafting duplicate onboarding emails. If a new paid member ever needs the same
treatment (onboarded outside this pipeline), tag their contact `friends-onboarded` by hand
the same way, using the `contact_id` from their **Payment Form** submission specifically —
that's the only form this agent reads.

## Known limitations (v1)

- **Payment ↔ application contact_id mismatch isn't handled specially.** The Payment Form
  is the sole source of truth for this agent (name, email, tier via amount, payment date) —
  it never joins back to the separate Friends of spARK Application Form, so the contact_id
  mismatch seen on Nicole Potts Hart's two form submissions doesn't affect this pipeline.
- **L&L-scheduled check has no negative case.** Once someone shows up in the Lunch N Learn
  Submission Form, the agent stops checking them — if they later cancel and never
  reschedule, nothing re-flags it. Acceptable gap for v1.
- **No cross-run memory beyond BossHub tags.** Every run re-derives full state from
  BossHub submissions + contact tags — there's no separate log of past runs. If tagging
  ever fails after a draft is created (e.g. the tag call errors), the same email could be
  drafted again next run. Worth adding a Memory Store if this becomes a real problem.
