<img src="assets/sp-ark-labs-logo.png" alt="sp-ARK Labs" width="160" />

# sp-ARK Plugins

AI agent plugins built for the sp-ARK Labs startup accelerator. Skills run in [Claude Code](https://claude.ai/code) and [Claude.ai](https://claude.ai) and automate day-to-day operations across onboarding, marketing, and community management.

---

## Connect to Claude

### Claude.ai (web)

The operations tools run on a shared remote MCP server — no local setup needed.

1. Go to **claude.ai → Settings → Connectors → Add custom connector**
2. Enter: `https://sp-ark-operations-mcp.jarred-823.workers.dev/mcp`
3. Sign in with your **sp-ARK Microsoft account** when prompted
4. If your email is on the allowlist, all tools appear automatically

> To be added to the allowlist, contact Jarred.

### Claude Code (desktop)

Install plugins from the marketplace:

```
/plugin marketplace add altrwork/sp-ARK-plugins
/plugin install sp-ark-operations@sp-ark-plugins
/plugin install sp-ark-marketing@sp-ark-plugins
/plugin install sp-ark-community@sp-ark-plugins
```

---

## Skills

### Operations

New member onboarding and front desk workflows. Backed by the remote MCP server (BossHub, Verkada, Nexudus, Outlook).

| Skill | What it does |
|---|---|
| `/send-member-agreement` | Pull a BossHub inquiry, confirm details, and send the DocuSign membership agreement |
| `/activate-member-access` | After signing: create Verkada building access, Nexudus account, and draft a welcome email |
| Book a room | Ask Claude to book a meeting room — no slash command needed, just say the room and time |

### Marketing

Event outreach and intern matching.

| Skill | What it does |
|---|---|
| `/scrape-inbox` | Scan the CEO's Gmail for new contacts and add them to the distribution list |
| `/draft-invites` | Draft personalized event invitations for all uninvited contacts |
| `/match-interns` | Match intern applicants to member companies by skills and availability |

Requires Gmail and Google Drive connected in claude.ai.

### Community Management

Expense reporting and event agreements.

| Skill | What it does |
|---|---|
| `/expense-report` | Process PDF receipts and append categorized rows to the monthly Excel report |
| `sp-ark-event-agreement` | Fill the event rental agreement PDF from a Microsoft Forms submission |

---

## About

Built by [sp-ARK Labs](https://sparklabs.com) — a startup accelerator helping early-stage founders build, launch, and grow.
