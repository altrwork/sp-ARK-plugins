# Connectors

Plugin skills use `~~category` as a placeholder for whatever tool the user connects in that category.

| Category | Tool included | MCP URL | Auth |
|---|---|---|---|
| `~~email` | Gmail | `https://gmailmcp.googleapis.com/mcp/v1` | Google account (claude.ai integrations) |
| `~~spreadsheet` | Google Drive / Sheets | `https://drivemcp.googleapis.com/mcp/v1` | Google account (claude.ai integrations) |
| `~~bosshub` | sp-ARK Operations MCP | `https://sp-ark-operations-mcp.jarred-823.workers.dev/mcp` | Microsoft account (sign in when prompted) |
| `~~calendar` | sp-ARK Operations MCP (Outlook calendar tools) | `https://sp-ark-operations-mcp.jarred-823.workers.dev/mcp` | Microsoft account (sign in when prompted) |
| `~~slack` | Slack | claude.ai Slack connector | Slack workspace (claude.ai integrations) |

## Setup

1. Go to **claude.ai → Settings → Integrations**
2. Connect your **Gmail** account
3. Connect your **Google Drive** account
4. Sign in as the Google account that owns the CEO's inbox and the distribution list Sheet
5. Add a **custom connector** with URL `https://sp-ark-operations-mcp.jarred-823.workers.dev/mcp` and sign in with your sp-ARK Microsoft account when prompted
6. Connect your **Slack** workspace (used by `slack-happening-this-week` to save the weekly member update as a draft)

**Note:** there is also a generic `Microsoft 365` connector some clients (e.g. Claude Desktop) may have loaded alongside the sp-ARK Operations MCP. Its calendar tools look similar (`outlook_calendar_search` vs. our `outlook_search_events`) but don't return `add_to_calendar_url` or `description`. `slack-happening-this-week` requires the sp-ARK Operations MCP tools specifically — if a client has both connectors, be explicit that it should use the sp-ARK one.
