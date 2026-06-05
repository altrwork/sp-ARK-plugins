# sp-ARK Plugins — Setup Guide

This document walks through everything needed to install and configure the sp-ARK plugins for Claude Code. It is written for Claude to follow — when an operator says "set up the sp-ARK plugin," Claude should read this file and work through each section, pausing for credentials when needed.

**Repo:** `https://github.com/altrwork/sp-ARK-plugins`

---

## Quick Overview

There are three plugins in this repo. Install one, two, or all three depending on what you need:

| Plugin | Slash commands | What it does |
|---|---|---|
| **Operations** (`sp-ark-operations`) | `/new-member-onboarding` | Onboard new members: BossHub intake → DocuSign agreement → Verkada access → Nexudus portal → Slack invite email |
| **Community Management** (`sp-ark-community`) | `/expense-report`, `/sp-ark-event-agreement` | Process expense receipts into Excel; generate event rental agreement PDFs from OneDrive form submissions |
| **Marketing** (`sp-ark-marketing`) | `/scrape-inbox`, `/draft-invites` | Build a contact database from Gmail; draft personalized event invitations |

---

## Step 1 — Install the plugins

In Claude Code (CLI or desktop app), run:

```
/install https://github.com/altrwork/sp-ARK-plugins
```

Select the plugin(s) you want. No npm or build step is required — MCP server bundles are included.

---

## Step 2 — Set up connectors by plugin

Each plugin has its own connectors. Follow only the sections for the plugins you installed.

---

### Operations Plugin (`sp-ark-operations`)

The operations plugin uses five connectors: BossHub, DocuSign, Microsoft 365, Verkada, and Nexudus.

#### 2a. Environment variables

Create a `.env.local` file in your working directory (gitignored, never committed). Ask the operator for each value:

```bash
# BossHub / LeadConnector — read new member inquiry submissions
BOSSHUB_ACCESS_TOKEN=pit-24fe41cc-2df4-47fa-96e9-3452eb581a70   # From BossHub API settings, requires forms.readonly scope

# Verkada — building access provisioning
VERKADA_API_KEY=M2E5MWY5NTYtZTY5Mi00ZWVkLTkyM2YtYjU4OTcwNzQ1NmYxfDgzMzZhMGJhLWMyYTYtNDRmNC1hN2U3LWUyYWM1YTI0ZDA5YQ==        # From Verkada Command → Organization Settings → API keys

# Nexudus — member portal provisioning
NEXUDUS_ACCESS_TOKEN=taAQAnVxCf-6CKL1utyUkxwRezhmCqTFqzEreEzWROH4oNC0nEhn8P6Rj82HippoV3EWdNqzm48il6oluAJ8ahzrdeQfuy9iB1hgv3grLDP7D3C4OERH2uNMa0CMOz-9_wkGrfYVXUb7x_97UZUS2lPeUofBq45l9QO90OsCzqF8AL2VPj6iJArwx9kBzkXV8d29kyw7yavG1VFcI9hNqkR9vo40yR5HALsIuU59LZrrZ0vGkkJtztTSC1_fsdGgtwaO_tKmTe19f4Y-_CUAfrUQiE8QeckEueyNLQANL9RqCdgN8gh_JrVYmfA1SMVaNaceEm-_VXNj-Z8pk1izi-CcHgb1eJCJBNPxoxJ5vXUfXfdi3dUvIJltzwsNXYns9DlepXUxeFJLuv2pbMOsBQjTVNEbMEwzWAL8TnmFrnZpM0w8WIoR6Dqjy8SGIq27jdnJ0A   # Bearer token from Nexudus API (POST /api/token with admin credentials)
NEXUDUS_BUSINESS_ID=1420978999
```

Write these values to `.env.local` once the operator provides them.

#### 2b. Microsoft 365 (Outlook email drafts)

The Microsoft 365 MCP server is bundled in the plugin. Call the `login` tool on the `ms365` MCP server — it will open the system browser for a Microsoft sign-in. The operator signs in with the sp-ARK Microsoft 365 account.

After sign-in completes, call `verify-login` to confirm the session is active.

#### 2c. DocuSign (membership agreements)

DocuSign is a built-in Claude connector. The operator connects it once:

1. Go to **claude.ai → Settings → Connectors**
2. Find **DocuSign** and click **Connect**
3. Sign in with DocuSign credentials and authorize

The membership agreement template is already configured:
- Template ID: `8772e4f2-e427-4f4d-828f-69cfa69fd779`
- Signers: Founder (member) → ARK (operator)

No additional DocuSign configuration is needed.

#### 2d. Verify operations setup

Run:

```
/new-member-onboarding
```

A successful response lists pending BossHub inquiries. If any connector fails, Claude will report which one.

Expected working connectors:
- **BossHub** — lists member inquiries
- **DocuSign** — connector available (verified on first envelope send)
- **Microsoft 365** — drafts visible in Outlook
- **Nexudus** — creates member records
- **Verkada** — creates access users

---

### Community Management Plugin (`sp-ark-community`)

The community plugin has two skills with different connector needs.

#### Expense Reports (`/expense-report`)

No external connectors required. Works entirely with local files — PDF receipts read by Claude, output written to a local Excel workbook via Python/openpyxl.

Requirements:
- Python 3 installed locally
- `openpyxl` package (`pip install openpyxl`)

#### Event Rental Agreements (`/sp-ark-event-agreement`)

Uses the Microsoft 365 MCP server to read form submissions from a OneDrive-hosted Excel workbook.

**Microsoft 365 setup:**

The MS365 MCP server is bundled in the plugin. Call the `login` tool on the `ms365` MCP server — it opens the system browser for Microsoft sign-in. Sign in with the sp-ARK Microsoft 365 account that has access to the Forms-synced workbook.

After sign-in, call `verify-login` to confirm.

The skill also runs a local Python script (`fill_agreement.py`) to generate the PDF. Requirements:
- Python 3
- `pypdf` and `reportlab` packages (`pip install pypdf reportlab`)

**Verify:**

Ask Claude to generate an event agreement. It should read submissions from the OneDrive workbook and present them for selection.

---

### Marketing Plugin (`sp-ark-marketing`)

The marketing plugin uses Gmail and Google Drive/Sheets through Claude's built-in Google integrations.

#### Google connectors

1. Go to **claude.ai → Settings → Integrations**
2. Connect your **Gmail** account
3. Connect your **Google Drive** account
4. Sign in as the Google account that owns the inbox and the distribution list Sheet

No MCP servers, environment variables, or local setup required.

#### Verify

Run:

```
/scrape-inbox
```

Claude should be able to read recent Gmail messages. Then test:

```
/draft-invites "Test Event"
```

Claude should read the distribution list Sheet (ID: `1tYDIr6GZy5jl01oiWOrjXEyu6FdElaBil-i7lvh_oZs`) and draft invite emails.

---

## Step 3 — Python dependencies (if needed)

If you installed the community plugin, install the Python packages used by the skills:

```bash
pip install openpyxl pypdf reportlab
```

These are only needed for local file generation (expense reports and event agreement PDFs). The operations and marketing plugins do not require Python.

---

## Environment variable reference

| Variable | Plugin | Source | Notes |
|---|---|---|---|
| `BOSSHUB_ACCESS_TOKEN` | Operations | BossHub API settings | Requires `forms.readonly` scope |
| `VERKADA_API_KEY` | Operations | Verkada Command → Org Settings → API | Needs admin permissions |
| `NEXUDUS_ACCESS_TOKEN` | Operations | Nexudus API (`POST /api/token`) | Bearer token for API access |
| `NEXUDUS_BUSINESS_ID` | Operations | Fixed | `1420978999` — ARK Innovation Center |

The community and marketing plugins do not require environment variables.

---

## Re-setup after a new machine or fresh install

1. Re-run `/install https://github.com/altrwork/sp-ARK-plugins`
2. Recreate `.env.local` with the operations credentials
3. Re-authorize Microsoft 365 via the `login` tool
4. Re-connect DocuSign at claude.ai → Settings → Connectors
5. Re-connect Gmail and Google Drive at claude.ai → Settings → Integrations

---

## Updating plugins

Run the install command again to pull the latest version:

```
/install https://github.com/altrwork/sp-ARK-plugins
```

Select the plugin(s) to update.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| BossHub returns 401 | Token expired or missing `forms.readonly` scope — ask the operator for a new token |
| Microsoft 365 tools fail | Re-run the `login` tool on the `ms365` MCP server |
| DocuSign not available | Re-connect at claude.ai → Settings → Connectors |
| Verkada returns 403 | API key needs admin permissions, or check `VERKADA_API_KEY` is set |
| Nexudus auth fails | Verify `NEXUDUS_ACCESS_TOKEN` in `.env.local` — token may need refresh via `POST /api/token` |
| Python script errors | Install missing packages: `pip install openpyxl pypdf reportlab` |
| Gmail/Drive not accessible | Re-connect at claude.ai → Settings → Integrations |
