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
├── ceo-tools/                        # Plugin: CEO tools (Excel/Outlook)
│   ├── .claude-plugin/plugin.json
│   └── mcp-servers/remote/           # Cloudflare Worker (Microsoft OAuth)
├── marketing/                        # Plugin: event marketing automation
│   ├── .claude-plugin/plugin.json
│   ├── CONNECTORS.md
│   ├── README.md
│   └── skills/
│       ├── inbox-scraper/
│       └── draft-invites/
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

This currently still runs on the **same shared Azure app registration as the CEO Tools worker** below (same client ID/secret, different redirect URI) — pending a decision to split off a dedicated app registration with delegated-only permissions, since CEO Tools still needs that app's Application permissions for its own client-credentials flow. See Part 1 of the rearchitecture plan for the recommended new-app-registration path once Entra admin access is available.

**Known gotcha:** anyone who added this connector in Claude before the 2026-06-23 GitHub→Microsoft OAuth switch is holding a session tied to the old auth flow and will get 401s even though they're on the allowlist. Fix: remove and re-add the `sp-ark-operations-mcp` connector in Claude to force a fresh Microsoft login.

**Known gotcha (delegated-scope upgrade):** anyone who signed in before the `Mail.Send`/`Mail.ReadWrite`/`Calendars.ReadWrite` delegated scopes were added is holding a token without those scopes and will get Graph 403s on Outlook tools even though they're on the allowlist. Fix: remove and re-add the `sp-ark-operations-mcp` connector to force a fresh Microsoft login with the new scopes.

**Known gotcha (Verkada 401s):** since Verkada's Nov 2024 API model, `VERKADA_API_KEY` permissions are scoped per product. Read/write on "Access Control" (covers `/access/v1/...` — access groups, access users lookup, pass invite, remote unlock) does **not** cover "Core" (covers `/core/v1/user`, used by `verkada_create_access_user`). A key missing the Core permission returns a 401 `"Failed to authenticate request"` on create while reads still succeed. Fix: in Verkada Command, add a Core (Read/Write) permission row to the key alongside Access Control — no redeploy needed, the same key just needs the broader scope. Also: `verkada_send_pass_invite` and `verkada_activate_remote_unlock` require `user_id` + `email` explicitly — Verkada rejects requests that only supply `external_id`.

Tools:
- BossHub: `bosshub_list_forms`, `bosshub_list_submissions`, `bosshub_get_submission`
- Verkada: `verkada_find_access_user`, `verkada_create_access_user`, `verkada_list_access_groups`, `verkada_add_user_to_access_group`, `verkada_send_pass_invite`, `verkada_activate_remote_unlock`
- Nexudus: `nexudus_find_person`, `nexudus_create_person`, `nexudus_assign_booking_access`, `nexudus_list_resources`, `nexudus_list_bookings`, `nexudus_create_booking`, `nexudus_cancel_booking`
- Outlook (delegated, as the signed-in user): `outlook_create_draft`, `outlook_list_calendars`, `outlook_search_events`, `outlook_create_event`, `outlook_update_event`

Wrangler secrets: `COOKIE_ENCRYPTION_KEY`, `BOSSHUB_ACCESS_TOKEN`, `VERKADA_API_KEY`, `NEXUDUS_ACCESS_TOKEN` (or `NEXUDUS_USERNAME` + `NEXUDUS_PASSWORD`), `MS_CLIENT_SECRET`

### CEO Tools Worker (`ceo-tools/mcp-servers/remote/`)

**URL:** `https://sp-ark-ceo-tools.jarred-823.workers.dev/mcp`
**Auth:** Microsoft OAuth (tenant-scoped identity check, no allowlist) — Becca signs in with her Microsoft account. Login is identity-only; the actual Excel/Outlook calls run on a separate client-credentials Graph token for `brownr@sp-ark-labs.com`, not Becca's delegated token.
**Deploy:** `cd ceo-tools/mcp-servers/remote && npm run deploy`

Tools: SharePoint/Excel read-write (`search_sharepoint_files`, `list_excel_worksheets`, `get_excel_rows`, `append_excel_rows`, `update_excel_cell`) and Outlook read-write (`list_emails`, `search_emails`, `read_email`, `create_email_draft`, `send_email`, `reply_to_email`).

Azure app: client ID `c5182f34-3a23-4975-9c94-36f8add94dd4`, tenant `739a4a9e-9e21-404a-9676-0200f2283cf6` — the same Azure app as the Operations Worker above (same client ID/secret, different redirect URI registered per worker: `https://sp-ark-ceo-tools.jarred-823.workers.dev/callback`).

Wrangler secrets: `MS_CLIENT_SECRET`, `COOKIE_ENCRYPTION_KEY`
Wrangler vars: `MS_CLIENT_ID`, `MS_TENANT_ID`, `MS_SENDER_EMAIL` (`brownr@sp-ark-labs.com`)

## Plugins

### `sp-ark-marketing` (`marketing/`)

Event marketing automation.

**Skills:**
- `inbox-scraper` — `/scrape-inbox <sheet_url> [days=30]`; scans Gmail for recent contacts, deduplicates against a distribution list Sheet, appends new rows.
- `draft-invites` — `/draft-invites "<event details>"`; reads the distribution list Sheet, finds uninvited contacts, saves personalized Gmail drafts, updates the `Events Invited` column.
- `match-interns` — `/match-interns`; pulls intern applications and member intern requests from BossHub, matches interns to member companies by skills/industry/availability, optionally drafts intro emails.

**Connector placeholders:**

| Placeholder | Tool | MCP endpoint |
|---|---|---|
| `~~email` | Gmail | `https://gmailmcp.googleapis.com/mcp/v1` |
| `~~spreadsheet` | Google Drive / Sheets | `https://drivemcp.googleapis.com/mcp/v1` |

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

**Nexudus plan tariff IDs:**
| Plan | Tariff ID |
|---|---|
| Flex Desk | 1415300509 |
| Fixed Desk | 1415300510 |
| Micro Office | 1415300506 |
| Small Office | 1415300389 |
| Medium Office | 1415300508 |
| Large Office | 1415300388 |

### `sp-ark-ceo-tools` (`ceo-tools/`)

CEO tools for Becca — Excel/SharePoint write access and Outlook read-write. Becca adds `https://sp-ark-ceo-tools.jarred-823.workers.dev/mcp` as a custom connector in Claude.ai and signs in with her Microsoft account once (identity-only login; the actual Graph calls run on a separate client-credentials token).

**No skills yet** — tools are exposed directly through the MCP server.

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
