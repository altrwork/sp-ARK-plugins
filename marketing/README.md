# ARK Event Agent

An AI agent that grows your event distribution list automatically. It scrapes the CEO's Gmail inbox for contacts not already on the list, drafts personalized event invitations, and syncs RSVP responses back to a Google Sheet — all in three commands.

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

### `/send-invites` *(coming soon)*
Drafts personalized event invitation emails to new contacts found by `/scrape-inbox` and stages them as Gmail drafts for CEO approval before sending.

### `/sync-responses` *(coming soon)*
Monitors the inbox for replies to sent invitations and updates the RSVP status column in the Google Sheet.

## Setup

See [CONNECTORS.md](./CONNECTORS.md) for full MCP server setup instructions.

**Quick start:**
1. Run the Google Workspace MCP server (see CONNECTORS.md)
2. Install this plugin in Claude Code or Cowork
3. Run `/scrape-inbox` with your distribution list Sheet URL

## Sheet Format

The distribution list Google Sheet should have the following columns. The agent will append new rows and leave existing rows untouched.

| Column | Description |
|---|---|
| `Name` | Contact full name |
| `Email` | Contact email address (used for deduplication) |
| `Company` | Contact company or organization |
| `Source` | How they were added (e.g. "CEO Inbox") |
| `Added Date` | Date the row was appended |
| `Invited` | Whether an invitation was sent (Yes / No) |
| `RSVP` | Response status (Attending / Not Attending / No Response) |
