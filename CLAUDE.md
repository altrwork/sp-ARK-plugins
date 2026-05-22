# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

This is **sp-ARK-plugins** — a collection of AI agent plugins for Claude Code, built for startup accelerator operations. Plugins are installed into Claude Code and invoked via slash commands. There is no build step, no test runner, and no server. Skills are Markdown files.

## Repository Structure

```
sp-ARK-plugins/
├── .claude-plugin/
│   └── marketplace.json        # Marketplace catalog for plugin distribution
├── marketing/                  # Plugin: event marketing automation
│   ├── CONNECTORS.md           # MCP setup for Gmail + Google Drive
│   ├── README.md               # End-user docs
│   └── skills/
│       ├── inbox-scraper/      # /scrape-inbox skill
│       └── draft-invites/      # /draft-invites skill
└── community-management/       # Plugin: community operations
    └── skills/
        └── expense-reports/    # /expense-report skill
```

Each skill is a folder containing a `SKILL.md` — the only required file.

## Plugins

### `sp-ark-marketing` (marketing/)

Event marketing automation for startup accelerators. Uses Gmail and Google Drive MCPs via claude.ai integrations.

**Skills:**
- `/scrape-inbox <sheet_url> [days=30]` — scans the CEO's Gmail inbox for contacts not on the distribution list Sheet and appends new rows
- `/draft-invites "<event name, date, location>"` — reads the distribution list, finds uninvited contacts, saves personalized Gmail drafts, and updates the Sheet

**Connectors:** `~~email` (Gmail) and `~~spreadsheet` (Google Drive/Sheets). These are placeholder patterns swapped at runtime — never hardcode specific MCP tool names inside skill files.

| Placeholder | Connected tool | MCP endpoint |
|---|---|---|
| `~~email` | Gmail | `https://gmailmcp.googleapis.com/mcp/v1` |
| `~~spreadsheet` | Google Drive / Sheets | `https://drivemcp.googleapis.com/mcp/v1` |

**Demo Sheet ID:** `1tYDIr6GZy5jl01oiWOrjXEyu6FdElaBil-i7lvh_oZs`
Schema: `Name | Organization | How do I know them | Events Invited`

---

### `sp-ark-community` (community-managment/)

Community operations automation for startup accelerators. Works entirely with local files — no MCP connectors required.

**Skills:**
- `/expense-report [path to scans folder]` — reads PDFs from a local scans folder, extracts transaction data using Claude's native PDF reading, categorizes each transaction into one of five expense codes, and appends new rows to a local Excel report file using Python/openpyxl

**Skills:**
- `/draft-agreement` — searches Outlook for the latest Microsoft Forms event rental submission, extracts event details, asks for pricing, and generates a filled Word document agreement using Python/python-docx

**Connectors:** `ms365` (Microsoft 365 / Outlook). Configured via `.mcp.json` — requires one-time `npx @softeria/ms-365-mcp-server --login` to authenticate. See `CONNECTORS.md`.

The expense-report skill uses no connectors — all file I/O is local (Read tool + Bash/Python).

---

## Adding a New Skill

1. Create a folder under the relevant plugin's `skills/` directory
2. Write a `SKILL.md` with YAML frontmatter (`name`, `description`, `argument-hint`)
3. For marketing skills: use `~~email` / `~~spreadsheet` placeholders — never hardcode MCP tool names
4. For community skills: use local file operations (Read tool, Bash/Python) — no MCP needed
5. Update `marketplace.json` if adding a new plugin (not needed for new skills within an existing plugin)

## Planned Skills (not yet built)

- `/sync-responses` (marketing) — monitor inbox for RSVP replies and update the Sheet
- `/send-report` (community) — email the completed expense report to the CEO at month-end
