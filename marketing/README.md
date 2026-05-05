# sp-ARK Email Event Agent

An AI agent that grows your event distribution list automatically. It scrapes the CEO's Gmail inbox for contacts not already on the list, then drafts personalized event invitations — all in two commands.

## Commands

### `/scrape-inbox`
Scans the CEO's Gmail inbox for contacts (senders and recipients) who aren't already on the distribution list, then appends them to the Google Sheet with their name, email, and company.

**Usage:**
```
/scrape-inbox <sheet_url> [days=30]
```

**Examples:**
```
/scrape-inbox https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID
/scrape-inbox https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID days=60
```

### `/draft-invites`
Reads the distribution list Sheet, finds contacts who haven't been invited to the specified event, and saves a personalized Gmail draft for each one. Updates the Sheet after drafting so invite history is tracked across events.

**Usage:**
```
/draft-invites "<event name, date, location>"
```

**Examples:**
```
/draft-invites "Demo Day — June 12, 2026 at Innovation Hub Tampa"
/draft-invites "Pitch Night July 8, 7pm, Armature Works"
```

## Setup

See [CONNECTORS.md](./CONNECTORS.md) for full MCP server setup instructions.

**Quick start:**
1. Run the Google Workspace MCP server (see CONNECTORS.md)
2. Install this plugin in Claude Code or Cowork
3. Run `/scrape-inbox` with your distribution list Sheet URL
4. Run `/draft-invites` with your event details to queue personalized drafts for CEO review

## Sheet Formats

### Distribution List (`/scrape-inbox`)

Provide a Google Sheet with the following columns. The agent appends new rows and leaves existing rows untouched.

| Column | Description |
|---|---|
| `Name` | Contact full name |
| `Email` | Contact email address (used for deduplication) |
| `Company` | Contact company or organization |
| `Source` | How they were added (e.g. "CEO Inbox") |
| `Added Date` | Date the row was appended |
| `Invited` | Whether an invitation was sent (Yes / No) |
| `RSVP` | Response status (Attending / Not Attending / No Response) |

### Invite List (`/draft-invites`)

A separate Sheet tracks relationship context and invite history per event.

| Column | Description |
|---|---|
| `Name` | Contact full name |
| `Organization` | Contact's company or organization |
| `How do I know them` | Relationship context used to personalize the invite |
| `Events Invited` | Comma-separated list of event names the contact has been invited to |
