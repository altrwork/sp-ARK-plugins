<img src="assets/sp-ark-labs-logo.png" alt="sp-ARK Labs" width="160" />

# sp-ARK Plugins

AI agent plugins for [Claude Code](https://claude.ai/code), built for the sp-ARK Labs startup accelerator. Each plugin adds slash-command skills that automate operations workflows — no code required to use them.

## Plugins

### Operations (`sp-ark-operations`)

Onboards new sp-ARK Labs members from a BossHub inquiry through agreement, building access, member portal, and Slack invite. Split into two steps so building access is only granted after the agreement is signed.

| Skill | Usage |
|---|---|
| `/send-member-agreement` | Read a BossHub inquiry, confirm member details, collect pricing/dates, and send the membership agreement via DocuSign |
| `/activate-member-access` | After signing: create the Verkada access user (All Access), create the Nexudus member account, and draft the Slack invite email in Outlook |

### Marketing (`sp-ark-marketing`)

Automates event marketing outreach. Scrapes the CEO's inbox to build a contact database and drafts personalized event invitations.

| Skill | Usage |
|---|---|
| `/scrape-inbox` | Scan Gmail for new contacts and append them to the distribution list |
| `/draft-invites` | Draft personalized Gmail invites for an event to all uninvited contacts |

Requires Gmail and Google Drive connected via claude.ai integrations.

### Community Management (`sp-ark-community`)

Automates expense reporting and event rental agreements.

| Skill | Usage |
|---|---|
| `/expense-report` | Process a folder of PDF receipts and append categorized transactions to a local Excel report |
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

## How the Operations plugin works

The onboarding skills coordinate five external systems. Three are custom MCP servers in this repo (BossHub, Verkada, Nexudus); DocuSign and Microsoft 365 use Claude's built-in connectors.

```
/send-member-agreement ──┐
                         ├─ BossHub MCP ───── read pending member inquiry
                         └─ DocuSign ──────── send membership agreement (Template ID)

/activate-member-access ─┐  (after signing)
                         ├─ Verkada MCP ───── create access user → All Access group
                         ├─ Nexudus MCP ───── create member portal account + plan
                         └─ Microsoft 365 ─── draft the Slack invite email in Outlook
```

### Three ways to run the custom MCP servers

The same BossHub + Verkada + Nexudus tools ship in three formats. Pick one based on where the operator works:

| Distribution | Where it runs | Setup for the operator | Source |
|---|---|---|---|
| **Local stdio** | Claude Code desktop | Node auto-starts the servers; credentials in `~/.claude/settings.json` | `operations/.mcp.json` + `operations/mcp-servers/{bosshub,verkada,nexudus}` |
| **mcpb bundle** | Claude Desktop | Double-click the `.mcpb`, paste the three API keys into the install UI | `operations/mcpb/` |
| **Remote (Cloudflare Worker)** | claude.ai & **Claude Cowork** | None — add one connector URL and sign in with GitHub | `operations/mcp-servers/remote/` |

**The remote Worker is what unlocks Cowork.** It hosts all three custom servers behind GitHub OAuth — operators install nothing locally and never handle API keys (those live as Worker secrets). Access is gated by a GitHub-username allowlist. In Cowork, pair it with Claude's built-in Microsoft 365 and DocuSign connectors for the full workflow. See [`operations/mcp-servers/remote/README.md`](operations/mcp-servers/remote/README.md).

### First-time setup (operator)

| Step | Local / mcpb | Remote |
|---|---|---|
| API credentials | Add BossHub/Verkada/Nexudus tokens (from `SETUP.md`) | Handled server-side — nothing to do |
| Microsoft 365 | `ms365 login` (browser, once) | Built-in MS365 connector |
| DocuSign | Connect at claude.ai → Settings → Connectors | Same |
| Connect | Restart Claude Code desktop | Settings → Connectors → add the `/mcp` URL → GitHub login |

`operations/SETUP.md` holds the real credentials and is shared directly — it is never committed.

---

## Reference

**DocuSign template** — Template ID `8772e4f2-e427-4f4d-828f-69cfa69fd779`; signers Founder (member) → ARK (Edwin); the skill pre-fills locked tabs from BossHub data before sending. Export: [`operations/skills/send-member-agreement/references/`](operations/skills/send-member-agreement/references/).

**Nexudus plan mapping**

| BossHub option | Plan | Tariff ID | Monthly |
|---|---|---|---|
| Flex Desk | Flex | 1415300509 | $300 |
| Fixed Desk | Fixed | 1415300510 | $400 |
| Micro Office | Micro | 1415300506 | $850 |
| Small Office | Small | 1415300389 | $1,000 |
| Medium Office | Medium | 1415300508 | $1,500 |
| Large Office | Large | 1415300388 | $2,500 |

---

## About

Built by [sp-ARK Labs](https://sparklabs.com) — a startup accelerator helping early-stage founders build, launch, and grow.
