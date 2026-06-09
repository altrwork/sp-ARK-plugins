# sp-ARK Operations — Remote MCP Server (Cloudflare Worker)

A single remote MCP server that exposes the BossHub, Verkada, and Nexudus onboarding
tools over Streamable HTTP, so they can be used from **Claude Cowork** and **Claude.ai**
Custom Connectors — no local Node.js, no per-user API keys.

This is the hosted counterpart to the local `operations/mcp-servers/*` stdio servers and
the `operations/mcpb` bundle. All three distributions share the same nine tools.

## How it works

```
Claude.ai / Cowork              Cloudflare Worker                    Upstream APIs
┌──────────────┐  Custom   ┌──────────────────────────────┐        ┌───────────────┐
│ Custom       │ Connector │ OAuthProvider                 │        │ BossHub       │
│ Connector    │ ──HTTPS─▶ │  ├─ GitHub login (/authorize) │        │ Verkada       │
│  /mcp        │           │  └─ /mcp → OperationsMCP      │ ─────▶ │ Nexudus       │
└──────────────┘           │       (9 tools, allowlisted)  │ secrets└───────────────┘
                           └──────────────────────────────┘
```

- **Caller auth = GitHub OAuth.** Users sign in with GitHub. Only GitHub usernames in
  `ALLOWED_USERNAMES` (in `src/index.ts`) get the tools; everyone else authenticates but
  sees nothing. These tools write to building access + member systems, so keep the list tight.
- **Upstream credentials** (BossHub token, Verkada key, Nexudus token) are stored once as
  **Worker secrets** — never entered by users, never in the repo.

> **Why GitHub OAuth and not email one-time PIN?** Cloudflare Access (which provides email
> OTP) can only protect a domain that's an active **zone** in your Cloudflare account. This
> Worker runs on a `*.workers.dev` URL, which is not your zone, so Access can't gate it.
> GitHub OAuth is implemented inside the Worker itself and needs no custom domain. If you
> later add a domain to Cloudflare, you can switch to Access + email OTP.

## Tools

`bosshub_list_member_inquiries`, `bosshub_get_member_inquiry`,
`verkada_find_access_user`, `verkada_create_access_user`, `verkada_list_access_groups`,
`verkada_add_user_to_access_group`,
`nexudus_find_person`, `nexudus_create_person`, `nexudus_assign_booking_access`.

Deployed URL: `https://sp-ark-operations-mcp.jarred-823.workers.dev`
Connector endpoint: that URL + `/mcp`.

---

## Setup

### 1. Install dependencies

```bash
cd operations/mcp-servers/remote
npm install
```

### 2. Create a GitHub OAuth App

GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**:

- **Application name:** `sp-ARK Operations MCP`
- **Homepage URL:** `https://sp-ark-operations-mcp.jarred-823.workers.dev`
- **Authorization callback URL:** `https://sp-ark-operations-mcp.jarred-823.workers.dev/callback`

Register it, copy the **Client ID**, and generate a **Client Secret**.

### 3. Set the secrets

`COOKIE_ENCRYPTION_KEY` and the three upstream API secrets are already set. Add the GitHub
app credentials:

```bash
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
```

Full secret list (for reference / re-deploys on a new account):

| Secret | Source |
|---|---|
| `GITHUB_CLIENT_ID` | GitHub OAuth app |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app |
| `COOKIE_ENCRYPTION_KEY` | `openssl rand -hex 32` |
| `BOSSHUB_ACCESS_TOKEN` | BossHub / LeadConnector (forms.readonly) |
| `VERKADA_API_KEY` | Verkada |
| `NEXUDUS_ACCESS_TOKEN` | Nexudus |

### 4. Add allowed GitHub usernames

Edit `ALLOWED_USERNAMES` in `src/index.ts` — add each operator's GitHub username
(yours, Edwin's). Anyone not listed is denied all tools. Edit + redeploy to change it.

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
2. Enter the `/mcp` URL.
3. Complete the GitHub login + approval when prompted.
4. If your GitHub username is allowlisted, the nine onboarding tools appear and
   `/new-member-onboarding` runs end-to-end with no local setup.

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
