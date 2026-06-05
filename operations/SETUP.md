# sp-ARK Operations Plugin — Setup Guide

This document is written for Claude to follow. When Edwin says "set up the sp-ARK operations plugin" and provides the repo URL, Claude should fetch this file and work through each step in order, pausing to ask Edwin for credentials when needed.

**Repo:** `https://github.com/altrwork/sp-ARK-plugins`

---

## What this plugin does

Onboards new sp-ARK Labs members in one command (`/new-member-onboarding`):

1. Reads a pending member inquiry from BossHub
2. Confirms details with the operator
3. Sends the membership agreement via DocuSign
4. Creates a building access user in Verkada
5. Creates a member portal account in Nexudus with the correct plan
6. Drafts a Slack invite email in Outlook

---

## Step 1 — Install the plugin

In Claude Code (CLI or desktop app), run:

```
/install https://github.com/altrwork/sp-ARK-plugins
```

Select **Operations** from the list. The plugin installs to the local Claude plugin cache. No npm or build step is required — the MCP server bundles are included.

---

## Step 2 — Set environment variables

Create a `.env.local` file in the project working directory (this file is gitignored and never committed). Ask Edwin for each value marked `[Edwin provides]`.

```bash
# BossHub / LeadConnector — read new member inquiry submissions
BOSSHUB_ACCESS_TOKEN=[Edwin provides — from BossHub API settings, requires forms.readonly scope]

# Verkada — building access provisioning
VERKADA_API_KEY=[Edwin provides — from Verkada Command → Organization Settings → API keys]

# Nexudus — member portal provisioning
NEXUDUS_USERNAME=[Edwin provides — his Nexudus admin login email]
NEXUDUS_PASSWORD=[Edwin provides — his Nexudus admin login password]
NEXUDUS_BUSINESS_ID=1420978999
```

Write these values to `.env.local` in the working directory once Edwin provides them.

---

## Step 3 — Authorize Microsoft 365

Microsoft 365 is used to draft the Slack invite email in Outlook. The Microsoft 365 MCP server is bundled in the plugin — no terminal command is needed.

Call the `login` tool on the `ms365` MCP server. It will open Edwin's system browser for a Microsoft sign-in. Edwin signs in with his sp-ARK Microsoft 365 account. The auth token is stored locally — no credentials are saved in the project files.

After the browser sign-in completes, call `verify-login` to confirm the session is active.

---

## Step 4 — Authorize DocuSign

DocuSign is a built-in Claude connector. Edwin needs to connect it once at claude.ai:

1. Go to **claude.ai → Settings → Connectors**
2. Find **DocuSign** and click **Connect**
3. Sign in with Edwin's DocuSign credentials and authorize

Once connected at claude.ai, the DocuSign connector is available in Claude Code and the desktop app automatically.

The membership agreement template is already configured in DocuSign:
- Template ID: `8772e4f2-e427-4f4d-828f-69cfa69fd779`
- Signers: Founder (member) → ARK (Edwin)

No additional DocuSign configuration is needed.

---

## Step 5 — Verify the setup

Run a test to confirm all connectors are working:

```
/new-member-onboarding
```

Claude will attempt to list pending BossHub inquiries. A successful response shows a numbered list of member inquiries. If any connector is blocked or fails, Claude will report which one and what is missing.

Expected working connectors at this point:
- BossHub: lists member inquiries
- DocuSign: connector available (verified when an envelope is sent)
- Microsoft 365: drafts visible in Outlook
- Nexudus: creates member records with plan
- Verkada: creates access users (live — not dry-run)

---

## Environment variable reference

| Variable | Source | Notes |
|---|---|---|
| `BOSSHUB_ACCESS_TOKEN` | BossHub API settings | Requires `forms.readonly` scope |
| `VERKADA_API_KEY` | Verkada Command → Org Settings → API | Needs admin permissions |
| `NEXUDUS_USERNAME` | Nexudus admin login | Email address used to log into Nexudus |
| `NEXUDUS_PASSWORD` | Nexudus admin login | Stored only in local `.env.local` |
| `NEXUDUS_BUSINESS_ID` | Fixed | `1420978999` — ARK Innovation Center |

---

## Re-setup after a new machine or fresh install

Repeat Steps 1–4. The `.env.local` values and Microsoft 365 login are machine-local and do not transfer automatically.

---

## Updating the plugin

When a new version is available, run:

```
/install https://github.com/altrwork/sp-ARK-plugins
```

Select **Operations** again to pull the latest version.
