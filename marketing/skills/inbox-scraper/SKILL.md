---
name: inbox-scraper
description: Scan the CEO's Gmail inbox for contacts not already on the distribution list Google Sheet, then append new contacts with name, email, company, source, and date. Use when growing the event list from the CEO's existing email relationships.
argument-hint: "<google_sheet_url> [days=30]"
---

## Overview

This skill reads the CEO's Gmail inbox, extracts every unique sender and recipient, deduplicates against the existing distribution list in Google Sheets, and appends any new contacts.

## Trigger

Invoked via `/scrape-inbox <sheet_url> [days=30]`. Also responds to natural language like "scrape the inbox", "find new contacts from email", or "who's in the CEO's inbox that isn't on the list?"

## Inputs

Collect before proceeding:

| Input | Required | Default | Notes |
|---|---|---|---|
| `sheet_url` | Yes | — | Full Google Sheets URL for the distribution list |
| `days` | No | 30 | How many days back to scan in Gmail |

If `sheet_url` is missing, ask: *"What's the URL of the distribution list Google Sheet?"*

## Step-by-Step Process

### Step 1 — Read the existing distribution list

Use ~~spreadsheet to read all rows from the Sheet. Extract every value in the `Email` column and normalize to lowercase. Store as `existing_emails` set for deduplication.

If the Sheet is empty or the Email column doesn't exist, note this and proceed — all inbox contacts will be treated as new.

### Step 2 — Search Gmail for recent contacts

Use ~~email to search the inbox for emails from the past `days` days. Pull both **sent** and **received** messages to capture two-way relationships.

For each email thread, extract:
- `From` field (sender name + email)
- `To` field (recipients)
- `CC` field (if present)

**Exclude:**
- Automated/noreply addresses (e.g. `noreply@`, `no-reply@`, `notifications@`, `mailer-daemon@`)
- The CEO's own email address
- Internal domain addresses if the customer specifies one to skip

Parse display names where available (e.g. `"Jane Smith" <jane@acme.com>` → name: Jane Smith, email: jane@acme.com).

### Step 3 — Extract company from email domain

For each new contact, infer company from the email domain:
- `jane@acme.com` → `Acme`
- `john@gmail.com` or `@yahoo.com`, `@outlook.com`, `@icloud.com` → leave Company blank (personal email)
- Capitalize and clean the domain name (strip TLD, capitalize first letter)

If the email signature is accessible in the thread body, prefer the signature's company name over the domain inference.

### Step 4 — Deduplicate

Compare each extracted email (lowercased) against `existing_emails`. Only keep contacts where the email is NOT already in the Sheet.

Build a `new_contacts` list:

```
[
  { name, email, company, source: "CEO Inbox", added_date: today }
]
```

### Step 5 — Append to Google Sheet

Use ~~spreadsheet to append `new_contacts` as new rows to the Sheet. Fill columns in this order:

`Name | Email | Company | Source | Added Date | Invited | RSVP`

Set `Invited` = `No` and `RSVP` = `No Response` for all new rows.

### Step 6 — Report results

Output a summary in this format:

---
**Inbox Scrape Complete**

- Emails scanned: [N] (last [days] days)
- Contacts found: [N unique]
- Already on list: [N]
- **New contacts added: [N]**

| Name | Email | Company |
|---|---|---|
| Jane Smith | jane@acme.com | Acme |
| ... | ... | ... |

Ready to send invitations? Run `/send-invites` to draft personalized emails to these [N] new contacts.

---

If zero new contacts were found, say so clearly and suggest expanding the date range: *"No new contacts found in the last [days] days. Try `/scrape-inbox <url> days=90` to look further back."*

## Error Handling

| Situation | Response |
|---|---|
| Sheet URL is invalid or inaccessible | Ask user to check sharing settings — Sheet must be accessible to the Google account the MCP server is authenticated as |
| Gmail returns no results | Confirm the MCP server is authenticated to the correct Google account (CEO's, not the user's personal account) |
| Name not parseable from email | Leave Name blank — do not guess |
| Duplicate emails with different names | Keep the entry already on the Sheet; do not overwrite |
