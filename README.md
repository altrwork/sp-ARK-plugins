<img src="assets/sp-ark-labs-logo.png" alt="sp-ARK Labs" width="160" />

# sp-ARK Plugins

AI agent plugins for [Claude Code](https://claude.ai/code), built for the sp-ARK Labs startup accelerator. Each plugin adds slash-command skills that automate operations workflows — no code required to use them.

## Plugins

### Operations (`sp-ark-operations`)

Onboards new sp-ARK Labs members end-to-end in a single command. Reads a pending inquiry from BossHub, confirms details with the operator, then coordinates DocuSign, Verkada, Nexudus, and an Outlook draft email — all without leaving Claude.

| Skill | Usage |
|---|---|
| `/new-member-onboarding` | Read a BossHub inquiry, confirm member details, send the agreement, provision building and portal access, draft the Slack invite email |

Requires Claude Code desktop. See [How it works](#how-it-works) below.

---

### Marketing (`sp-ark-marketing`)

Automates event marketing outreach. Scrapes the CEO's inbox to build a contact database and drafts personalized event invitations.

| Skill | Usage |
|---|---|
| `/scrape-inbox` | Scan Gmail for new contacts and append them to the distribution list |
| `/draft-invites` | Draft personalized Gmail invites for a given event to all uninvited contacts |

Requires Gmail and Google Drive connected via claude.ai integrations.

---

### Community Management (`sp-ark-community`)

Automates expense reporting. Reads PDF receipts from a local folder, categorizes each transaction, and writes the results to a local Excel report.

| Skill | Usage |
|---|---|
| `/expense-report` | Process a folder of PDF receipts and append transactions to the Excel expense report |

Works entirely with local files — no external connectors required.

---

## Install

Add this repo as a marketplace in Claude Code, then install the plugin you need:

```
/plugin marketplace add altrwork/sp-ARK-plugins
/plugin install sp-ark-operations@sp-ark-plugins
/plugin install sp-ark-community@sp-ark-plugins
/plugin install sp-ark-marketing@sp-ark-plugins
```

---

## How it works

### Operations plugin architecture

The `sp-ark-operations` plugin coordinates five external systems through custom MCP servers bundled inside the plugin:

```
/new-member-onboarding
        │
        ├── BossHub MCP ──────── reads pending member inquiry form submissions
        ├── DocuSign connector ── sends the membership agreement template
        ├── Verkada MCP ─────── creates building access user, assigns All Access group
        ├── Nexudus MCP ─────── creates member portal account with correct plan
        └── Microsoft 365 MCP ── drafts Slack invite email in Outlook
```

The BossHub, Verkada, Nexudus, and Microsoft 365 servers are local Node.js processes that start automatically when Claude Code desktop loads the plugin. Credentials are stored in `~/.claude/settings.json` on the operator's machine.

### Requirements

| Requirement | Notes |
|---|---|
| Claude Code desktop app | Required. Local MCP servers do not run in the web version or Claude Cowork. |
| Microsoft 365 account | One-time browser login via `ms365 login` tool. |
| DocuSign account | One-time connection at claude.ai → Settings → Connectors. |
| API credentials | BossHub, Verkada, Nexudus tokens — provided separately via SETUP.md. |

### First-time setup (operations plugin only)

After installing the plugin, Edwin needs to:

1. Add the four API credentials to `~/.claude/settings.json` under `"env"` — provided in SETUP.md
2. Restart Claude Code desktop
3. Call the `ms365 login` tool — browser opens, sign in once, token persists
4. Connect DocuSign at claude.ai → Settings → Connectors

Full instructions are in `operations/SETUP.md` (not committed — shared directly, as it contains credentials).

### Connectors used

| Connector | Type | Purpose |
|---|---|---|
| BossHub / LeadConnector | Custom MCP (bundled) | Read new member inquiry form submissions |
| Microsoft 365 | Custom MCP (bundled) | Draft Slack invite emails via Outlook |
| Verkada | Custom MCP (bundled) | Create building access users |
| Nexudus | Custom MCP (bundled) | Create member portal accounts |
| DocuSign | Claude built-in connector | Send membership agreement |

### DocuSign template

The onboarding agreement template is pre-configured and shared:

- **Template ID:** `8772e4f2-e427-4f4d-828f-69cfa69fd779`
- **Signers:** Founder (member) → ARK (Edwin)
- The skill pre-fills all locked tabs from BossHub data before sending

### Nexudus plan mapping

| BossHub option | Nexudus plan | Tariff ID | Monthly price |
|---|---|---|---|
| Flex Desk | Flex | 1415300509 | $300 |
| Fixed Desk | Fixed | 1415300510 | $400 |
| Micro Office | Micro | 1415300506 | $850 |
| Small Office | Small | 1415300389 | $1,000 |
| Medium Office | Medium | 1415300508 | $1,500 |
| Large Office | Large | 1415300388 | $2,500 |

### Future: Claude Cowork support

The current architecture runs MCP servers locally (Claude Code desktop only). A planned future version will host the BossHub, Verkada, and Nexudus servers as remote HTTP endpoints, allowing the plugin to run in Claude Cowork without any local setup. MS365 is already handled by Claude's built-in Microsoft 365 connector in Cowork. This transition requires deploying the three custom servers to a cloud provider — no changes to the skill logic are needed.

---

## About

Built by [sp-ARK Labs](https://sparklabs.com) — a startup accelerator helping early-stage founders build, launch, and grow.
