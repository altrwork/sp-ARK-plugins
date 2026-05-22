# Connectors

The `draft-agreement` skill reads Microsoft Forms submission emails from Outlook. This is provided by the `ms-365-mcp-server` package, which this plugin configures automatically.

| Connector | Service | Package |
|---|---|---|
| `ms365` | Microsoft 365 — Outlook + OneDrive | `@softeria/ms-365-mcp-server` |

## One-time setup

Run this command once in your terminal after installing the plugin:

```
npx @softeria/ms-365-mcp-server --login
```

A URL and a short code will appear. Open the URL in your browser, enter the code, and sign in with the Microsoft 365 account that receives the Microsoft Forms notifications. Your token is cached locally — you will not need to log in again unless the token expires.

> **Personal account?** Remove `--org-mode` from `.mcp.json` if you are connecting a personal Microsoft account rather than a work or school account.
