# Connectors

Plugin skills use `~~category` as a placeholder for whatever tool the user connects in that category.

| Category | Tool included | MCP URL | Auth |
|---|---|---|---|
| `~~email` | Gmail | `https://gmailmcp.googleapis.com/mcp/v1` | Google account (claude.ai integrations) |
| `~~spreadsheet` | Google Drive / Sheets | `https://drivemcp.googleapis.com/mcp/v1` | Google account (claude.ai integrations) |
| `~~bosshub` | sp-ARK Operations MCP | `https://sp-ark-operations-mcp.jarred-823.workers.dev/mcp` | Microsoft account (sign in when prompted) |

## Setup

1. Go to **claude.ai → Settings → Integrations**
2. Connect your **Gmail** account
3. Connect your **Google Drive** account
4. Sign in as the Google account that owns the CEO's inbox and the distribution list Sheet
5. Add a **custom connector** with URL `https://sp-ark-operations-mcp.jarred-823.workers.dev/mcp` and sign in with your sp-ARK Microsoft account when prompted
