---
name: draft-invites
description: Draft personalized event invitation emails to contacts in the distribution list Google Sheet who have not yet been invited to a specific event. Use when the user wants to send event invites to uninvited contacts, provides an event name and details, or asks to "draft invites", "send invitations", or "reach out to the list" for an event.
argument-hint: "<event_details>"
---

## Overview

This skill reads the distribution list Google Sheet, finds every contact who has not been invited to the specified event, and drafts a personalized Gmail invite for each one using their relationship context. Drafts are saved to Gmail for the CEO to review and send.

## Distribution List Sheet

Sheet ID: `1tYDIr6GZy5jl01oiWOrjXEyu6FdElaBil-i7lvh_oZs`

Always use this sheet — do not ask the user for a sheet URL.

## Trigger

Invoked via `/draft-invites "<event details>"`. Also responds to natural language like "draft invites for demo day", "who hasn't been invited to [event]?", or "send invitations for [event]".

## Inputs

Collect before proceeding:

| Input | Required | Notes |
|---|---|---|
| `event_details` | Yes | Event name, date, location, and any other relevant details for the invite |

If `event_details` is missing, ask: *"What event are we sending invites for? Include the name, date, and location."*

## Sheet Schema

The distribution list Sheet has these columns:

`Name | Organization | How do I know them | Events Invited`

- `Events Invited` is a comma-separated list of event names (e.g. `Demo Day June 12, Pitch Night July 8`)
- A contact is **uninvited** if the `Events Invited` cell does not contain the specified event name

## Step-by-Step Process

### Step 1 — Read the distribution list

Use ~~spreadsheet to read all rows from the Sheet. For each contact, extract:
- `Name`
- `Organization`
- `How do I know them`
- `Events Invited`

### Step 2 — Filter uninvited contacts

Compare the `Events Invited` value for each row against the event name provided. A contact is uninvited if the event name is **not** found in their `Events Invited` cell (case-insensitive match).

Build an `uninvited` list from all contacts who don't match.

If zero uninvited contacts are found, tell the user: *"Everyone on the list has already been invited to [event]."* and stop.

### Step 3 — Draft personalized invitations

For each contact in `uninvited`, draft a Gmail email using ~~email:

**Drafting guidelines:**
- Reference the relationship context from `How do I know them` naturally in the opening line — do not quote it verbatim
- Mention the contact's `Organization` where it feels natural
- Include all event details (name, date, location, any other info provided)
- Keep the tone warm and personal, not templated
- End with a clear call to action (RSVP, register, reply to confirm, etc.)
- Do NOT send — save as a draft only

**Example opening lines based on relationship context:**
- "How do I know them: Met at SeedFund Tampa" → *"It was great connecting at SeedFund Tampa..."*
- "How do I know them: Introduced by Maria, discussed Series A" → *"Following up on the intro from Maria..."*
- "How do I know them: Cold outreach, responded positively" → *"Thanks for being open to connecting earlier..."*

### Step 4 — Update the Sheet

After all drafts are saved, use ~~spreadsheet to update the `Events Invited` column for each contact:
- If the cell is empty, set it to the event name
- If the cell already has values, append the event name: `existing_value, new_event_name`

### Step 5 — Report results

Output a summary in this format:

---
**Invite Drafts Ready**

- Event: [event name]
- Contacts on list: [N]
- Already invited: [N]
- **Drafts created: [N]**

| Name | Organization | Draft saved |
|---|---|---|
| Jane Smith | Acme Ventures | Yes |
| ... | ... | ... |

Drafts are saved in Gmail and ready for your review. Once you've reviewed and sent them, the Sheet has been updated to reflect that these contacts were invited to [event].

---

## Error Handling

| Situation | Response |
|---|---|
| Sheet URL is invalid or inaccessible | Ask user to check sharing settings |
| `How do I know them` cell is blank | Write a warm but generic intro; do not fabricate a relationship |
| Contact has no name, only organization | Address the email to the organization (e.g. "Hi Acme Ventures team") |
| Gmail draft save fails | Note the failure in the summary and list the contact so the user can draft manually |
