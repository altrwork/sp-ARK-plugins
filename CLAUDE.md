# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

This is **sp-ARK-plugins** — a collection of AI agent skills for Claude Code / Cowork, built for startup accelerator customers. Skills are installed into Claude Code and invoked via slash commands. They use MCP-connected external services (Gmail, Google Drive/Sheets) to automate marketing and operations workflows.

There is no build step, no test runner, and no server. Skills are Markdown files.

## Repository Structure

```
sp-ARK-plugins/
└── marketing/              # Plugin for event marketing automation
    ├── CONNECTORS.md       # MCP server setup for Gmail + Google Drive
    ├── README.md           # End-user docs for the marketing plugin
    └── skills/
        ├── inbox-scraper/  # /scrape-inbox skill
        └── draft-invites/  # /draft-invites skill
```

Each skill is a folder containing a `SKILL.md` — the only required file. Optional subdirectories: `scripts/`, `references/`, `assets/`.

## Skill Architecture

Skills use `~~email` and `~~spreadsheet` as connector placeholders. These are swapped at runtime for whatever MCP tool the user has connected (see `marketing/CONNECTORS.md`). Do not reference specific MCP tool names (e.g. `mcp__claude_ai_Gmail__*`) inside skill files — always use the `~~category` placeholder pattern.

The two connectors in use:

| Placeholder | Connected tool | MCP endpoint |
|---|---|---|
| `~~email` | Gmail | `https://gmailmcp.googleapis.com/mcp/v1` |
| `~~spreadsheet` | Google Drive / Sheets | `https://drivemcp.googleapis.com/mcp/v1` |

## Demo Sheet

The `draft-invites` skill has a hardcoded sheet ID for demo purposes:
`1tYDIr6GZy5jl01oiWOrjXEyu6FdElaBil-i7lvh_oZs`

Schema: `Name | Organization | How do I know them | Events Invited`

`Events Invited` is a comma-separated list of event names. This is how the skill tracks invite history across multiple events over time.

## Skills in This Repo

### `/scrape-inbox` (`inbox-scraper`)
Scans the CEO's Gmail inbox (sent + received) for contacts not already on the distribution list Sheet, infers company from email domain, and appends new rows. Usage: `/scrape-inbox <sheet_url> [days=30]`

### `/draft-invites` (`draft-invites`)
Reads the distribution list Sheet, finds contacts whose `Events Invited` column does not contain the specified event, and saves a personalized Gmail draft for each one. Updates the Sheet after drafting. Usage: `/draft-invites "<event name, date, location>"`

## Planned Skills (not yet built)

- `/sync-responses` — monitor inbox for RSVP replies and update the Sheet

## Adding a New Skill

1. Create a folder under the relevant plugin's `skills/` directory
2. Write a `SKILL.md` with YAML frontmatter (`name`, `description`, `argument-hint`) and step-by-step instructions
3. Use `~~email` / `~~spreadsheet` placeholders — never hardcode MCP tool names
4. Update `README.md` to document the new slash command
