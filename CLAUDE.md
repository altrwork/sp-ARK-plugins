# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

This is **sp-ARK-plugins** - a collection of Claude Code plugins for sp-ARK Labs startup accelerator operations. Plugins are installed into Claude Code and invoked as slash-command skills.

There is no app build, test runner, or server. Most behavior lives in Markdown `SKILL.md` files, with a small Cloudflare Worker per plugin that needs remote API access.

## Current Remote

Push active work to:

```
https://github.com/altrwork/sp-ARK-plugins.git
```

## Repository Structure

```
sp-ARK-plugins/
├── .claude-plugin/
│   └── marketplace.json              # Marketplace catalog for all plugins
├── assets/
│   └── sp-ark-labs-logo.png
├── ceo-tools/                        # Not a plugin — just inbox-agent/, a scheduled
│   └── inbox-agent/                  # Managed Agent that calls the operations MCP server
├── marketing/                        # Plugin: event marketing automation
│   ├── .claude-plugin/plugin.json
│   ├── CONNECTORS.md
│   ├── README.md
│   └── skills/
│       ├── inbox-scraper/
│       ├── draft-invites/
│       ├── match-interns/
│       └── slack-happening-this-week/
├── operations/                       # Plugin: operations workflows
│   ├── .claude-plugin/plugin.json
│   ├── CONNECTORS.md
│   ├── mcp-servers/
│   │   └── remote/                   # Cloudflare Worker (Microsoft OAuth)
│   └── skills/
│       ├── send-member-agreement/
│       └── activate-member-access/
└── community-management/             # Plugin: community operations
    ├── .claude-plugin/plugin.json
    ├── .mcp.json                     # Microsoft 365 MCP server config
    ├── CONNECTORS.md
    └── skills/
        ├── expense-reports/
        └── event-request/
```

Each skill is a folder containing a `SKILL.md`. Supporting files stay inside that skill's folder under `references/`.

## Active MCP Servers

### Operations Worker (`operations/mcp-servers/remote/`)

**URL:** `https://sp-ark-operations-mcp.jarred-823.workers.dev/mcp`
**Auth:** Microsoft OAuth (tenant-scoped, switched from GitHub OAuth 2026-06-23) — access gated by the `ALLOWED_EMAILS` allowlist in `src/index.ts`, not by client-side scopes. Non-allowlisted users can sign in but get zero tools. Current allowlist: `jarred@altrwork.com`, `robidouxj@sp-ark-labs.com`, `deeke@tbinnovates.com` (Edwin), `bernardc@sp-ark-labs.com`, `ryanc@sp-ark-labs.com`, `brownr@sp-ark-labs.com`, `kange@sp-ark-labs.com`, `twilson@tbinnovates.com`.
**Deploy:** `cd operations/mcp-servers/remote && npm run deploy`

**Delegated Graph permissions (rearchitected 2026-07-09, per Tommy/MSP guidance):** Outlook tools call Microsoft Graph using the signed-in user's own delegated access/refresh token (`/me/...` paths), not a fixed-mailbox client-credentials app token. Whoever is currently connected sends as themselves — e.g. if Edwin is signed in, drafts/invites come from Edwin's own mailbox. `MS_SCOPES` in `microsoft-handler.ts` requests `Mail.Send Mail.ReadWrite Calendars.ReadWrite` in addition to the identity scopes; the access/refresh token pair is captured into `Props` at `/callback` and cached per-Durable-Object in `index.ts` (`getUserMsToken()`), refreshing via `grant_type=refresh_token` as needed. Refreshed tokens live only in that Durable Object's memory — `workers-oauth-provider` has no API to persist updated tokens back into the OAuth grant, so a DO eviction falls back to the original login-time refresh token (Azure AD's rotation grace window generally still honors it).

This runs on its own dedicated Entra app registration (`MS_CLIENT_ID: 0b84d0be-4b61-46e0-8f44-56e6986a65a2`, delegated-only permissions) — not shared with any other worker.

**CEO Tools consolidation (2026-07-17):** there used to be a separate `sp-ark-ceo-tools` worker for Becca's Excel/SharePoint/Outlook access, authenticating identity via OAuth but running every Graph call on a **client-credentials (app-only) token** hardcoded to her mailbox. Testing a copy of it against a different mailbox failed with "access is denied" — Exchange's Application Access Policy scopes app-only Graph tokens per-mailbox, independent of the worker's own OAuth/allowlist layer (which was confirmed working via `wrangler tail`; the identity check passed cleanly and still failed at the Graph layer). Decision: no worker in this repo should use application permissions, even scoped to one person. `sp-ark-ceo-tools` and its test copy were torn down entirely (Workers, KV namespaces, plugin manifest). The only capability actually in use — `ceo-tools/inbox-agent` reading and drafting in Becca's inbox — was ported here as four delegated `outlook_*` tools (below), gated by the same `ALLOWED_EMAILS` as everything else (Becca was already on it); `inbox-agent`'s own `agent.yaml` further narrows itself to exactly those four tools via `mcp_toolset` `configs` filtering, since this worker now also serves Verkada/Nexudus/BossHub and every other Outlook tool. Excel/SharePoint tools from the old worker were confirmed unused and were not migrated.

**Known gotcha:** anyone who added this connector in Claude before the 2026-06-23 GitHub→Microsoft OAuth switch is holding a session tied to the old auth flow and will get 401s even though they're on the allowlist. Fix: remove and re-add the `sp-ark-operations-mcp` connector in Claude to force a fresh Microsoft login.

**Known gotcha (delegated-scope upgrade):** anyone who signed in before the `Mail.Send`/`Mail.ReadWrite`/`Calendars.ReadWrite` delegated scopes were added is holding a token without those scopes and will get Graph 403s on Outlook tools even though they're on the allowlist. Fix: remove and re-add the `sp-ark-operations-mcp` connector to force a fresh Microsoft login with the new scopes.

**Known gotcha (Verkada 401s):** since Verkada's Nov 2024 API model, `VERKADA_API_KEY` permissions are scoped per product. Read/write on "Access Control" (covers `/access/v1/...` — access groups, access users lookup, pass invite, remote unlock) does **not** cover "Core" (covers `/core/v1/user`, used by `verkada_create_access_user`). A key missing the Core permission returns a 401 `"Failed to authenticate request"` on create while reads still succeed. Fix: in Verkada Command, add a Core (Read/Write) permission row to the key alongside Access Control — no redeploy needed, the same key just needs the broader scope. Also: `verkada_send_pass_invite` and `verkada_activate_remote_unlock` require `user_id` + `email` explicitly — Verkada rejects requests that only supply `external_id`.

**Outlook events → Slack "add to calendar" links (added 2026-07-13):** Microsoft Graph has no endpoint that exports a single event as `.ics`, and no way to make Outlook natively subscribe to an external `.ics` URL either — so this is built entirely on our own worker. `normalizeEvent()` in `src/index.ts` builds an `add_to_calendar_url` field (via `buildAddToCalendarUrl()`) on every event returned by `outlook_create_event`, `outlook_search_events`, and `outlook_update_event`, pointing at a public, unauthenticated `GET /add-to-calendar` route added to `src/microsoft-handler.ts`. That route takes `subject`/`start`/`end`/`location`/`uid` as query params and renders an HTML landing page (`content-type: text/html`, not a file) with buttons for Google Calendar, Outlook, and a `.ics` download for Apple Calendar/other apps — a raw link straight to `/ics` was tried first, but that made browsers silently download a file instead of letting the recipient choose a calendar app, which doesn't work for a Slack channel with mixed calendar providers. The plain `GET /ics` route (same query params, `Content-Disposition: attachment`) still exists and is what the landing page's "Apple Calendar / Download .ics" button links to. No Graph call happens on either route, no storage — both just render whatever the query string says, so start/end are strictly regex-validated and subject/location are HTML-escaped before interpolation (public, unauthenticated endpoint). `graphRequest()` sends `Prefer: outlook.timezone="UTC"` on every call so event start/end always come back in UTC (required for correct `DTSTART`/`DTEND`/Google `dates=`/Outlook `startdt=`).

Member events live on a separate **Events** calendar (`outlook_list_calendars` → `name: "Events"`, `owner: events@sp-ark-labs.com`, editable by the signed-in user). That calendar also carries internal-only meetings (organized by `events@sp-ark-labs.com` but attended only by staff) — the `sp-ark-marketing` plugin's `slack-happening-this-week` skill (`marketing/skills/slack-happening-this-week/`) handles the actual Monday member update: it pulls the week's events, keeps only ones whose attendees include `allmembers@sp-ark-labs.com`/`airsupply@sp-ark-labs.com`, converts times to Eastern, and drafts the Slack message with each event's `add_to_calendar_url`. Deliberately **not** implemented by writing the link into each event's own description — `outlook_update_event` on an event where `events@sp-ark-labs.com` is organizer would make Graph email an "event updated" notification to every attendee (including external members), just to inject a link. Revisit only if there's a way to do it without that side effect.

**Known gotcha (multiple Outlook-flavored connectors):** Claude Desktop may have both the `spARK Connector` (this worker — has `add_to_calendar_url`) and a generic `Microsoft 365` connector loaded at once, and their calendar tools look interchangeable (`outlook_search_events` vs `outlook_calendar_search`). Only spARK Connector's tools return `add_to_calendar_url`; if Claude picks the Microsoft 365 tool instead, it won't find one and may incorrectly conclude ICS export isn't possible. Tell it explicitly to use the spARK Connector tools, or drive this through a skill that hardcodes the tool name.

**Guest/visitor registration (added 2026-07-15):** `nexudus_register_visitor`, `nexudus_list_visitors`, `nexudus_cancel_visitor` register a one-off guest (front-desk check-in) rather than a paying coworker/member — use `nexudus_create_person` for actual members. These hit a separate Nexudus namespace, `/api/public/visitors/...`, not the `/api/spaces/...` admin API the other Nexudus tools use. Nexudus's docs say this namespace requires a "customer bearer token" without clarifying whether that's the same token type as the admin password-grant token cached for `/api/spaces/...` calls — the tools reuse that cached token, so if the scopes actually differ, expect a 401/403 the first time these run (same failure shape as the Verkada Core-permission gotcha above), not a silent bug.

Tools:
- BossHub: `bosshub_list_forms`, `bosshub_list_submissions`, `bosshub_get_submission`
- Verkada: `verkada_find_access_user`, `verkada_create_access_user`, `verkada_list_access_groups`, `verkada_add_user_to_access_group`, `verkada_send_pass_invite`, `verkada_activate_remote_unlock`
- Nexudus: `nexudus_find_person`, `nexudus_create_person`, `nexudus_assign_booking_access`, `nexudus_list_resources`, `nexudus_list_bookings`, `nexudus_create_booking`, `nexudus_cancel_booking`, `nexudus_register_visitor`, `nexudus_list_visitors`, `nexudus_cancel_visitor`
- Outlook (delegated, as the signed-in user): `outlook_create_draft`, `outlook_send_mail`, `outlook_send_draft`, `outlook_list_calendars`, `outlook_search_events`, `outlook_create_event`, `outlook_update_event`, `outlook_list_emails`, `outlook_search_emails`, `outlook_read_email`, `outlook_reply_to_email`

The last four (`outlook_list_emails`/`outlook_search_emails`/`outlook_read_email`/`outlook_reply_to_email`) were ported in from the retired `sp-ark-ceo-tools` worker — see "CEO Tools consolidation" above. `ceo-tools/inbox-agent` depends on exactly these four; renaming or removing them requires updating `inbox-agent.agent.yaml`'s `mcp_toolset` `configs` too.

Wrangler secrets: `COOKIE_ENCRYPTION_KEY`, `BOSSHUB_ACCESS_TOKEN`, `VERKADA_API_KEY`, `NEXUDUS_ACCESS_TOKEN` (or `NEXUDUS_USERNAME` + `NEXUDUS_PASSWORD`), `MS_CLIENT_SECRET`

## Plugins

### `sp-ark-marketing` (`marketing/`)

Event marketing automation.

**Skills:**
- `inbox-scraper` — `/scrape-inbox <sheet_url> [days=30]`; scans Gmail for recent contacts, deduplicates against a distribution list Sheet, appends new rows.
- `draft-invites` — `/draft-invites "<event details>"`; reads the distribution list Sheet, finds uninvited contacts, saves personalized Gmail drafts, updates the `Events Invited` column.
- `match-interns` — `/match-interns`; pulls intern applications and member intern requests from BossHub, matches interns to member companies by skills/industry/availability, optionally drafts intro emails.
- `slack-happening-this-week` — `/slack-happening-this-week [#channel]`; pulls this week's events off the shared Events calendar, converts times to Eastern, and drafts the Monday-morning member Slack message with an RSVP/add-to-calendar link under each event. Read-only against the calendar — see `operations/mcp-servers/remote/`'s CLAUDE.md notes on `add_to_calendar_url` for why it doesn't write back to events. Not to be confused with the unrelated `sp-ark-happening-this-week` global skill, which generates a Canva slide.

**Connector placeholders:**

| Placeholder | Tool | MCP endpoint |
|---|---|---|
| `~~email` | Gmail | `https://gmailmcp.googleapis.com/mcp/v1` |
| `~~spreadsheet` | Google Drive / Sheets | `https://drivemcp.googleapis.com/mcp/v1` |
| `~~bosshub` | sp-ARK Operations MCP | `https://sp-ark-operations-mcp.jarred-823.workers.dev/mcp` |
| `~~calendar` | sp-ARK Operations MCP (Outlook calendar tools) | `https://sp-ark-operations-mcp.jarred-823.workers.dev/mcp` |
| `~~slack` | Slack | claude.ai Slack connector |

**Demo distribution list Sheet ID:** `1tYDIr6GZy5jl01oiWOrjXEyu6FdElaBil-i7lvh_oZs`

Schema used by `draft-invites`:
```
Name | Organization | How do I know them | Events Invited
```

Schema used by `inbox-scraper`:
```
Name | Email | Company | Source | Added Date | Invited | RSVP
```

### `sp-ark-community` (`community-management/`)

Community operations. Uses Microsoft 365 MCP server via `community-management/.mcp.json`.

**Skills:**
- `expense-report` — `/expense-report [path to scans folder]`; reads local PDF receipts, categorizes transactions, appends rows to a local Excel workbook with Python/openpyxl. No external connector.
- `sp-ark-event-agreement` — natural-language triggered; reads Microsoft Forms submissions from OneDrive, lets user choose a submission, runs `fill_agreement.py` against `sp-ark event template.pdf` to produce a filled Event Rental Agreement PDF.

Microsoft 365 setup: `npx @softeria/ms-365-mcp-server --login`

OneDrive workbook for event agreements:
- Drive ID: `b!YbMlVs-uWUynup7fvO9QLvQfsg_KioVJqk8MJ5VtnaRz8ZfA0YmwTIScVygOqdHw`
- Drive Item ID: `016SA4FQPXEB5DHBW5ERDZSFUAIRZWY6HS`
- Worksheet: `Sheet1`

### `sp-ark-operations` (`operations/`)

New member onboarding across agreements, building access, member portal, and Slack invite.

**Skills:**
- `send-member-agreement` — `/send-member-agreement [member name or email]`; reads a BossHub inquiry, confirms details with Edwin, collects pricing, sends the membership agreement via DocuSign.
- `activate-member-access` — `/activate-member-access [member email]`; confirms signing, creates Verkada access user (All Access group, Pass app invite, remote unlock), creates Nexudus member account, drafts Outlook welcome email.

**BossHub/LeadConnector:**
- Location ID: `jqh6rxfWtvMIQCKxcDlc`
- Form ID: `Ftg5p93SEeTnUWiyAgYn`
- API base: `https://services.leadconnectorhq.com`
- API version header: `2023-02-21`

**DocuSign:**
- Template: looked up by exact name (`spARK new member template`) via `getTemplates`, not a hardcoded template ID — the skill stops and reports if no exact match is found.
- Roles: `Founder` (routing 1) → `ARK` (routing 2, pre-configured as Rebecca Brown, CEO)

**Verkada:**
- All Access group ID: `1018efcf-5d11-4a3d-b01a-57bd8d3cd346`
- Region: `api`

**Nexudus room booking tools:** `nexudus_list_resources`, `nexudus_list_bookings`, `nexudus_create_booking` (params: `resource_id`, `from_time`, `to_time` in UTC, optional `coworker_id`, `override_price`, `internal_notes`, `tentative`), `nexudus_cancel_booking`

**Nexudus guest/visitor tools:** `nexudus_register_visitor` (params: `full_name`, `expected_arrival` ISO 8601, optional `email`, `phone_number`, `notes`), `nexudus_list_visitors` (optional `show_upcoming`), `nexudus_cancel_visitor` (`visitor_id`) — see the CLAUDE.md notes on the Operations Worker above for the `/api/public/visitors` auth caveat.

**Nexudus plan tariff IDs:**
| Plan | Tariff ID |
|---|---|
| Flex Desk | 1415300509 |
| Fixed Desk | 1415300510 |
| Micro Office | 1415300506 |
| Small Office | 1415300389 |
| Medium Office | 1415300508 |
| Large Office | 1415300388 |

## Important Implementation Notes

- Keep plugin manifests in each plugin's `.claude-plugin/plugin.json`.
- Keep marketplace metadata in root `.claude-plugin/marketplace.json`.
- Prefer updating skill instructions in `SKILL.md` over adding code unless local file generation is needed.
- Keep generated/reference assets inside the skill's own `references/` directory.
- Do not commit `.DS_Store`, `.env`, `.dev.vars`, `SETUP.md`, or `questions.md`.
- Do not commit `**/references/edwin-settings.json`.

## Adding a New Skill

1. Create a folder under the relevant plugin's `skills/` directory.
2. Write a `SKILL.md` with YAML frontmatter (`name`, `description`, `argument-hint`).
3. For marketing skills, use `~~email` / `~~spreadsheet` placeholders instead of concrete MCP tool names.
4. For community skills, prefer local file operations unless Microsoft 365 is specifically needed.
5. Add supporting files under `references/`.
6. Update the root marketplace only when adding a new **plugin**, not a new skill inside an existing plugin.
7. Update this file when adding or renaming user-facing skills.

## Planned Skills

- `/sync-responses` (marketing) — monitor inbox for RSVP replies and update the distribution list Sheet.
- `/send-report` (community) — email the completed expense report to the CEO at month-end.
