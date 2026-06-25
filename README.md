<img src="assets/sp-ark-labs-logo.png" alt="sp-ARK Labs" width="160" />

# sp-ARK Plugins

AI agent plugins for [Claude Code](https://claude.ai/code) and [Claude.ai](https://claude.ai), built for the sp-ARK Labs startup accelerator. Each plugin adds slash-command skills that automate operations workflows.

## Plugins

### Operations (`sp-ark-operations`)

New member onboarding and front desk operations. Connects BossHub, DocuSign, Verkada, Nexudus, and Outlook through a single remote MCP server.

| Skill | Usage |
|---|---|
| `/send-member-agreement` | Read a BossHub inquiry and send the membership agreement via DocuSign |
| `/activate-member-access` | After signing: create Verkada building access, Nexudus member account, and draft a welcome email |

Room booking is available directly through the MCP tools (`nexudus_list_resources`, `nexudus_create_booking`, etc.) — no skill needed, just ask Claude to book a room.

**Remote MCP server:** `https://sp-ark-operations-mcp.jarred-823.workers.dev/mcp` — add as a custom connector in claude.ai and sign in with your Microsoft account. See [`operations/mcp-servers/remote/README.md`](operations/mcp-servers/remote/README.md).

### Marketing (`sp-ark-marketing`)

Event marketing outreach and intern matching.

| Skill | Usage |
|---|---|
| `/scrape-inbox` | Scan Gmail for new contacts and append them to the distribution list |
| `/draft-invites` | Draft personalized Gmail invites for an event to all uninvited contacts |
| `/match-interns` | Match intern applicants to member companies by skills and availability |

Requires Gmail and Google Drive connected via claude.ai integrations.

### Community Management (`sp-ark-community`)

Expense reporting and event rental agreements.

| Skill | Usage |
|---|---|
| `/expense-report` | Process PDF receipts and append categorized transactions to a local Excel report |
| `sp-ark-event-agreement` | Fill the event rental agreement PDF from a Microsoft Forms submission |

---

## Install

Add this repo as a marketplace in Claude Code, then install the plugins you need:

```
/plugin marketplace add altrwork/sp-ARK-plugins
/plugin install sp-ark-operations@sp-ark-plugins
/plugin install sp-ark-marketing@sp-ark-plugins
/plugin install sp-ark-community@sp-ark-plugins
```

---

## About

Built by [sp-ARK Labs](https://sparklabs.com) — a startup accelerator helping early-stage founders build, launch, and grow.
