# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

This is **sp-ARK-plugins** - a collection of Claude Code plugins for sp-ARK Labs startup accelerator operations. Plugins are installed into Claude Code and invoked as slash-command skills.

There is no app build, test runner, or server. Most behavior lives in Markdown `SKILL.md` files, with a small amount of supporting Python and reference assets where a workflow needs local file generation.

## Current Remote

Push active work to:

```
https://github.com/altrwork/sp-ARK-plugins.git
```

The local `origin` remote is expected to point there.

## Repository Structure

```
sp-ARK-plugins/
├── .claude-plugin/
│   └── marketplace.json              # Marketplace catalog for plugin distribution
├── assets/
│   └── sp-ark-labs-logo.png          # README logo
├── marketing/                        # Plugin: event marketing automation
│   ├── .claude-plugin/plugin.json
│   ├── CONNECTORS.md                 # Gmail + Google Drive integration setup
│   ├── README.md
│   └── skills/
│       ├── inbox-scraper/            # /scrape-inbox behavior
│       └── draft-invites/            # /draft-invites behavior
└── community-management/             # Plugin: community operations
    ├── .claude-plugin/plugin.json
    ├── .mcp.json                     # Microsoft 365 MCP server config
    ├── CONNECTORS.md                 # Microsoft 365 setup notes
    └── skills/
        ├── expense-reports/          # /expense-report behavior
        └── event-request/            # event rental agreement generation
            └── references/
                ├── sp-ark event template.pdf
                └── fill_agreement.py
```

Each skill is a folder containing a `SKILL.md`. Supporting files should stay inside that skill's folder, usually under `references/`.

## Plugins Built So Far

### `sp-ark-marketing` (`marketing/`)

Event marketing automation for startup accelerators. Uses Claude integrations for Gmail and Google Drive/Sheets through connector placeholders.

**Skills:**

- `inbox-scraper` - invoked as `/scrape-inbox <sheet_url> [days=30]`; scans Gmail for recent sender/recipient contacts, deduplicates against a distribution list Sheet, infers company names, and appends new contact rows.
- `draft-invites` - invoked as `/draft-invites "<event details>"`; reads the fixed demo distribution list Sheet, finds contacts not yet invited to the event, saves personalized Gmail drafts, and updates the `Events Invited` column.

**Connector placeholders:**

| Placeholder | Connected tool | MCP endpoint |
|---|---|---|
| `~~email` | Gmail | `https://gmailmcp.googleapis.com/mcp/v1` |
| `~~spreadsheet` | Google Drive / Sheets | `https://drivemcp.googleapis.com/mcp/v1` |

Use these placeholders inside marketing skills. Do not hardcode concrete MCP tool names in `SKILL.md` files.

**Demo distribution list Sheet ID:** `1tYDIr6GZy5jl01oiWOrjXEyu6FdElaBil-i7lvh_oZs`

Current schema used by `draft-invites`:

```
Name | Organization | How do I know them | Events Invited
```

`inbox-scraper` has broader contact capture guidance and appends:

```
Name | Email | Company | Source | Added Date | Invited | RSVP
```

If these workflows are meant to share one production Sheet, reconcile the schema before changing either skill.

### `sp-ark-community` (`community-management/`)

Community operations automation for accelerator staff. This plugin currently covers local expense reporting and event rental agreement generation.

**Skills:**

- `expense-report` - invoked as `/expense-report [path to scans folder]`; reads local PDF receipts, extracts transaction data using Claude's native PDF reading, categorizes each transaction into one of five expense codes, skips duplicates, and appends rows to a local Excel workbook with Python/openpyxl.
- `sp-ark-event-agreement` - natural-language triggered for event agreements; reads Microsoft Forms submission rows from a OneDrive-hosted Excel workbook through the Microsoft 365 connector, lets the user choose a submission, and runs `fill_agreement.py` against `sp-ark event template.pdf` to produce a filled Event Rental Agreement PDF.

**Community connectors:**

- `expense-report` uses no external connector. It relies on local file reads and Python/openpyxl.
- `sp-ark-event-agreement` uses the Microsoft 365 MCP server configured by `community-management/.mcp.json`.

Microsoft 365 setup:

```
npx @softeria/ms-365-mcp-server --login
```

The event agreement skill currently reads a hardcoded Forms-synced OneDrive workbook:

- Drive ID: `b!YbMlVs-uWUynup7fvO9QLvQfsg_KioVJqk8MJ5VtnaRz8ZfA0YmwTIScVygOqdHw`
- Drive Item ID: `016SA4FQPXEB5DHBW5ERDZSFUAIRZWY6HS`
- Worksheet: `Sheet1`

## Important Implementation Notes

- Keep plugin manifests in each plugin's `.claude-plugin/plugin.json`.
- Keep marketplace metadata in root `.claude-plugin/marketplace.json`.
- The root marketplace currently exposes `sp-ark-community` and `sp-ark-marketing`.
- Prefer updating skill instructions in `SKILL.md` instead of adding code unless the workflow needs local file generation or structured file manipulation.
- Keep generated/reference assets close to the skill that uses them.
- Use ASCII filenames where practical. Existing reference names with spaces should be preserved unless a rename is part of the task.
- Do not commit `.DS_Store` or other local OS artifacts.

## Adding a New Skill

1. Create a folder under the relevant plugin's `skills/` directory.
2. Write a `SKILL.md` with YAML frontmatter (`name`, `description`, and `argument-hint` when useful).
3. For marketing skills, use `~~email` / `~~spreadsheet` placeholders instead of concrete MCP tool names.
4. For community skills, prefer local file operations unless the workflow specifically requires Microsoft 365.
5. Add supporting files under the skill's own `references/` directory.
6. Update the root marketplace only when adding a new plugin, not for a new skill inside an existing plugin.
7. Update this file and the relevant plugin README when adding or renaming user-facing skills.

## Planned Skills

- `/sync-responses` (marketing) - monitor inbox for RSVP replies and update the distribution list Sheet.
- `/send-report` (community) - email the completed expense report to the CEO at month-end.

## Known Cleanup Items

- `community-management/CONNECTORS.md` still references the old `draft-agreement` name in places; align it with `event-request` / `sp-ark-event-agreement`.
- README install instructions may still mention the previous GitHub owner. Current pushes go to `altrwork/sp-ARK-plugins`.
- Marketing Sheet schema expectations differ between `inbox-scraper` and `draft-invites`; decide whether this is intentional before production use.
