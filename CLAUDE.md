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
│   ├── agent/                        # Managed agent config (agent.yaml)
│   ├── mcp-servers/
│   │   └── remote/                   # Cloudflare Worker (GitHub OAuth)
│   └── skills/
│       ├── send-member-agreement/
│       └── activate-member-access/
└── community-management/             # Plugin: community operations
    ├── .claude-plugin/plugin.json
    ├── .mcp.json                     # Microsoft 365 MCP server config
    └── skills/
        ├── expense-reports/
        └── event-request/
```

Each skill is a folder containing a `SKILL.md`. Supporting files stay inside that skill's folder under `references/`.

## Active MCP Servers

### Operations Worker (`operations/mcp-servers/remote/`)

**URL:** `https://sp-ark-operations-mcp.jarred-823.workers.dev/mcp`
**Auth:** GitHub OAuth — only `JarredR092699` and `edwin727` get tools
**Deploy:** `cd operations/mcp-servers/remote && npm run deploy`

Tools: BossHub inquiry lookup, Verkada access user management, Nexudus member creation and room booking, Outlook draft creation (client credentials via Edwin's Microsoft account).

Wrangler secrets: `COOKIE_ENCRYPTION_KEY`, `BOSSHUB_ACCESS_TOKEN`, `VERKADA_API_KEY`, `NEXUDUS_USERNAME`, `NEXUDUS_PASSWORD`, `MS_CLIENT_SECRET`

### CEO Tools Worker (`ceo-tools/mcp-servers/remote/`)

**URL:** `https://sp-ark-ceo-tools.jarred-823.workers.dev/mcp`
**Auth:** Microsoft OAuth (delegated) — Becca signs in with her Microsoft account
**Deploy:** `cd ceo-tools/mcp-servers/remote && npm run deploy`

Tools: SharePoint/Excel read-write (`search_sharepoint_files`, `list_excel_worksheets`, `get_excel_rows`, `append_excel_rows`, `update_excel_cell`) and Outlook read-write (`list_emails`, `search_emails`, `read_email`, `create_email_draft`, `send_email`, `reply_to_email`).

Azure app: client ID `bcaefde6-b9ed-407e-9dbe-04de6127730e`, multi-tenant, redirect URI `https://sp-ark-ceo-tools.jarred-823.workers.dev/callback`

Wrangler secrets: `MS_CLIENT_SECRET`, `COOKIE_ENCRYPTION_KEY`
Wrangler vars: `MS_CLIENT_ID`

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
- `activate-member-access` — `/activate-member-access [member email]`; confirms signing, creates Verkada access user (All Access group), creates Nexudus member account, drafts Outlook welcome email.

**Managed agent config:** `operations/agent/agent.yaml` — deployed to Claude Console; wraps both skills with full workflow instructions for Edwin.

**BossHub/LeadConnector:**
- Location ID: `jqh6rxfWtvMIQCKxcDlc`
- Form ID: `Ftg5p93SEeTnUWiyAgYn`
- API base: `https://services.leadconnectorhq.com`
- API version header: `2023-02-21`

**DocuSign:**
- Template ID: `8772e4f2-e427-4f4d-828f-69cfa69fd779`
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

CEO tools for Becca — Excel/SharePoint write access and Outlook read-write via delegated Microsoft OAuth. Becca adds `https://sp-ark-ceo-tools.jarred-823.workers.dev/mcp` as a custom connector in Claude.ai and signs in with her Microsoft account once.

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
