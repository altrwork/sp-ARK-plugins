---
name: slack-happening-this-week
description: Pulls this week's events from the sp-ARK Events calendar and drafts the Monday-morning "Happening This Week" member rundown message for Slack — day/time in Eastern, location, a short blurb, and an RSVP/Add to Calendar link under each event. Use when the user asks for "happening this week for Slack", the "Monday rundown", "weekly member update", "this week's events for Slack", or wants to post the weekly lineup to the members Slack channel. Not to be confused with the separate `sp-ark-happening-this-week` skill, which generates a Canva slide instead of a Slack message.
argument-hint: "[#slack-channel]"
---

## Overview

Pulls every non-cancelled event for the current week from the shared **Events** calendar (owner `events@sp-ark-labs.com`) and drafts the Monday-morning member Slack message: emoji header, one bullet per event with day/date, Eastern time range, title, a short blurb pulled from the event description, location, and an RSVP link. Saves as a Slack draft — does not post.

Deliberately **read-only against the calendar**: it uses `outlook_search_events`, not `outlook_update_event`. Writing the RSVP link into each event's own description would make Microsoft Graph email an "event updated" notification to every attendee (the Events calendar's organizer is `events@sp-ark-labs.com`), which we don't want just to add a link.

## Trigger

Invoked via `/slack-happening-this-week [#channel]`. Also responds to natural language like "happening this week for Slack", "monday rundown", "weekly member update for slack", "this week's events for the members channel", or "draft this week's lineup".

## Connectors

- `~~calendar` — sp-ARK Operations MCP server (same server as `~~bosshub` in the operations skills; used here for `outlook_list_calendars` / `outlook_search_events`)
- `~~slack` — Slack, for saving the drafted message

## Inputs

| Input | Required | Notes |
|---|---|---|
| `channel` | No | Slack channel to draft into. If not given, ask which channel before drafting. |

## Room → Floor Reference

Graph only returns the room name (`location`), not the floor. Prefix the floor for rooms in this table; leave the location as-is (no floor prefix) for anything not listed, and flag it in the Step 8 report so the table can be extended.

| Room name (from Graph `location`) | Floor |
|---|---|
| Innovation Foundation Hall | 2nd Floor |
| Colorful Corner Coworking Lounge | 3rd Floor |

## Step-by-Step Process

### Step 1 — Find the Events calendar

Call `~~calendar` → `outlook_list_calendars` and find the calendar named exactly `Events` (owner `events@sp-ark-labs.com`). Use its `id` as `calendar_id` for every call below — don't hardcode the ID, since it can differ depending on who is signed in.

If no calendar named `Events` exists, stop and tell the user.

### Step 2 — Determine the week's date range

Using today's date, find this calendar week's Monday and Sunday in America/New_York time, then convert both to UTC ISO 8601:
- `start_date` = Monday 00:00 ET → UTC
- `end_date` = Sunday 23:59:59 ET → UTC

Eastern Daylight Time (UTC-4) runs from the 2nd Sunday in March to the 1st Sunday in November; Eastern Standard Time (UTC-5) covers the rest of the year.

### Step 3 — Pull the week's events

Call `~~calendar` → `outlook_search_events` with the `calendar_id` from Step 1, `start_date`/`end_date` from Step 2, `limit: 50`. Do **not** pass `query` — free-text `$search` is not supported on this calendar resource and returns a 501.

### Step 4 — Filter and sort

- Drop any event where `is_cancelled` is `true`.
- Drop any event whose subject starts with `HOLD:` or `Canceled:` (internal placeholders, not member-facing).
- Drop any event that is **not** actually a member event: keep only events whose `attendees` list includes `allmembers@sp-ark-labs.com` and/or `airsupply@sp-ark-labs.com`. The Events calendar also carries internal-only meetings (e.g. staff sync-ups organized by `events@sp-ark-labs.com` but attended only by internal accounts) — those must not go out in the member rundown even though they live on the same calendar.
- Sort the remaining events chronologically by `start.dateTime`.

If zero events remain, tell the user: *"No member events found on the Events calendar for the week of [date range]."* and stop.

### Step 5 — Convert times to Eastern

`start.dateTime`/`end.dateTime` always come back in UTC (the worker requests `Prefer: outlook.timezone="UTC"` on every Graph call). Convert to America/New_York wall-clock time using the EDT/EST rule from Step 2.

Format as 12-hour time, no leading zero: `3:30–5:00 PM`. If start and end share the same AM/PM, show it once at the end only (`2:00–3:00 PM`, not `2:00 PM–3:00 PM`).

### Step 6 — Draft the message

Slack mrkdwn, structured like this:

```
Good morning, :sunny: We've got a great lineup for the week of [Month D–D]. Here's what's coming up :point_down:

• [Weekday], [Month D] | [start–end time]
[Event subject]
[One-line blurb from description, if it adds information — don't fabricate one]
[Floor, ]Location
RSVP: <[add_to_calendar_url]|Add to Calendar>

• ...

See you all around the Center this week! :zap:
```

Notes:
- Only include the blurb line if `description` is non-empty and adds information beyond the subject.
- Prefix `location` with its floor from the Room → Floor Reference table above when the room is listed there; otherwise use `location` as-is.
- The RSVP line uses the event's `add_to_calendar_url`, formatted as a Slack link (`<url|Add to Calendar>`) — **but only when this message is actually delivered through the Slack API** (Step 8, via `~~slack`). Slack only parses `<url|label>` syntax on messages it receives through the API with mrkdwn enabled; it does **not** parse that syntax when a human pastes the literal text into the composer — Slack's client-side autolinker runs instead, and it reliably mangles/truncates URLs this long (confirmed 2026-07-13: a pasted `<url|label>` line got cut off mid-`uid`, leaving `|Add to Calendar>` as literal unparsed text).
- If the message text is being shown to a person for manual review, copy-paste, or Slack DM-to-self testing rather than sent via `~~slack`, use **bare URLs** instead (`RSVP: [add_to_calendar_url]`, no `<...|...>` wrapper) — bare URLs survive manual paste because Slack's autolinker handles plain URLs correctly; it's only the explicit mrkdwn link syntax that requires API delivery.

### Step 7 — Confirm channel

If a channel wasn't given as an argument, ask: *"Which Slack channel should this go to?"*

### Step 8 — Save as a Slack draft and report

Use `~~slack` to save the composed message as a draft in the specified channel — do not send; the team reviews and sends it manually, matching how invite drafts work elsewhere in this repo.

Then report:
- Events included: [N]
- Events excluded (cancelled/HOLD): [N]
- Rooms not in the floor table (if any): [list, so the table can be updated]
- Draft saved to: #[channel]

Show the full drafted message text back to the user.

## Edge Cases

| Situation | Response |
|---|---|
| Events calendar not found | Stop, tell the user to check `outlook_list_calendars` output |
| Event has no description | Omit the blurb line — don't fabricate one |
| Event has no location | Omit the location line |
| Room not in the floor table | Use the room name with no floor prefix, flag it in the Step 8 report |
| Two events at the same time | List both, sorted by subject |
| Slack draft save fails | Output the full message text, but re-render RSVP lines as bare URLs first (`RSVP: [add_to_calendar_url]`, not `<url|Add to Calendar>`) — the mrkdwn link syntax breaks when pasted manually instead of delivered via the API |
| User wants to preview/test the message without posting to a channel | Render RSVP lines as bare URLs, not `<url|label>` mrkdwn, and don't call `~~slack` at all |
