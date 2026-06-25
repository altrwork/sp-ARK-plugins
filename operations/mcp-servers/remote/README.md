# sp-ARK Operations — Remote MCP Server (Cloudflare Worker)

A single remote MCP server that exposes BossHub, Verkada, Nexudus, and Outlook tools
over Streamable HTTP, so they can be used from **Claude Cowork** and **Claude.ai**
Custom Connectors — no local Node.js, no per-user API keys.

## How it works

```
Claude.ai / Cowork              Cloudflare Worker                    Upstream APIs
┌──────────────┐  Custom   ┌──────────────────────────────┐        ┌───────────────┐
│ Custom       │ Connector │ OAuthProvider                 │        │ BossHub       │
│ Connector    │ ──HTTPS─▶ │  ├─ Microsoft login           │        │ Verkada       │
│  /mcp        │           │  └─ /mcp → OperationsMCP      │ ─────▶ │ Nexudus       │
└──────────────┘           │       (tools, allowlisted)    │ secrets│ Outlook       │
                           └──────────────────────────────┘        └───────────────┘
```

- **Caller auth = Microsoft OAuth.** Users sign in with their Microsoft account. Only emails in
  `ALLOWED_EMAILS` (in `src/index.ts`) get the tools; everyone else authenticates but
  sees nothing. Keep this list tight — these tools write to building access and member systems.
- **Upstream credentials** are stored once as **Worker secrets** — never entered by users, never in the repo.

## Tools

**BossHub:** `bosshub_list_forms`, `bosshub_list_submissions`, `bosshub_get_submission`

**Verkada:** `verkada_find_access_user`, `verkada_create_access_user`, `verkada_list_access_groups`, `verkada_add_user_to_access_group`

**Nexudus:** `nexudus_find_person`, `nexudus_create_person`, `nexudus_assign_booking_access`, `nexudus_list_resources`, `nexudus_list_bookings`, `nexudus_create_booking`, `nexudus_cancel_booking`

**Outlook:** `outlook_create_draft`

Deployed URL: `https://sp-ark-operations-mcp.jarred-823.workers.dev`
Connector endpoint: that URL + `/mcp`.

---

## Setup

### 1. Install dependencies

```bash
cd operations/mcp-servers/remote
npm install
```

### 2. Create a Microsoft (Entra) OAuth App

Azure Portal → **App registrations → New registration**:

- **Name:** `sp-ARK Operations MCP`
- **Redirect URI:** `https://sp-ark-operations-mcp.jarred-823.workers.dev/callback`

Copy the **Client ID** and generate a **Client Secret**. Set `MS_CLIENT_ID` in `wrangler.jsonc` vars and the secret below.

### 3. Set the secrets

Full secret list (for reference / re-deploys on a new account):

| Secret | Source |
|---|---|
| `COOKIE_ENCRYPTION_KEY` | `openssl rand -hex 32` |
| `MS_CLIENT_SECRET` | Azure app client secret |
| `BOSSHUB_ACCESS_TOKEN` | BossHub / LeadConnector (forms.readonly) |
| `VERKADA_API_KEY` | Verkada |
| `NEXUDUS_USERNAME` | Nexudus admin email |
| `NEXUDUS_PASSWORD` | Nexudus admin password |

```bash
npx wrangler secret put COOKIE_ENCRYPTION_KEY
npx wrangler secret put MS_CLIENT_SECRET
npx wrangler secret put BOSSHUB_ACCESS_TOKEN
npx wrangler secret put VERKADA_API_KEY
npx wrangler secret put NEXUDUS_USERNAME
npx wrangler secret put NEXUDUS_PASSWORD
```

### 4. Add allowed Microsoft emails

Edit `ALLOWED_EMAILS` in `src/index.ts` — add each operator's Microsoft account email.
Anyone not listed is denied all tools. Edit + redeploy to change it.

### 5. Deploy

```bash
npx wrangler deploy
```

### 6. Local testing (optional)

```bash
cp .dev.vars.example .dev.vars   # fill in all six values
npx wrangler dev                 # serves http://localhost:8788/mcp
```

---

## Connect from Claude

1. Claude.ai (or Cowork) → **Settings → Connectors → Add custom connector**.
2. Enter `https://sp-ark-operations-mcp.jarred-823.workers.dev/mcp`.
3. Complete the Microsoft login when prompted.
4. If your email is in `ALLOWED_EMAILS`, all tools appear automatically.

---

## Notes

- `VERKADA_DRY_RUN` / `NEXUDUS_DRY_RUN` are `"false"` in `wrangler.jsonc` (writes are live).
  Flip to `"true"` to make those tools report intended actions without executing.
- Verkada session tokens are cached in the Durable Object instance (25-min TTL).
- `OAUTH_KV` (namespace id in `wrangler.jsonc`) stores OAuth state/grants.
- The local stdio servers and the mcpb bundle remain valid for Claude Desktop/Code; this
  Worker is what unlocks Cowork.
- `src/utils.ts` and `src/workers-oauth-utils.ts` are adapted from Cloudflare's
  `remote-mcp-github-oauth` reference template.
