---
name: send-event-template
description: Read a BossHub Event Inquiry Form submission and send the Event Agreement through DocuSign, pre-filled with event details and rental pricing. Use when Edwin has an external group wanting to host an event at spARK Labs and needs to send them the rental agreement. Quotes, logistics, calendar, and comms remain Edwin's responsibility per the Events Constitution — this skill only covers intake-to-DocuSign.
argument-hint: "[event name, company, or submitter email]"
---

# Send Event Template

You are helping sp-ARK Labs send an Event Agreement to one external group requesting to host an event at spARK Labs. This skill covers the intake-to-DocuSign portion only. Approving the event against the Events Constitution (theme alignment, exceptions), logistics, calendar, and marketing comms are Edwin's/Cassandra's responsibility and happen outside this skill.

## Required Connectors

- BossHub / LeadConnector connector for reading Event Inquiry Form submissions.
- DocuSign connector for sending the Event Agreement.

If either connector is unavailable, report it and stop.

## Reference Files

- `references/EventAgreementTemplate.json` — full DocuSign template export (Event Agreement Template, templateId `c893b967-f92c-44a6-8c40-9d79a0e7b418`). The 14 fillable fields live at `documents[0].tabs.prefillTabs.textTabs` — these are **document-level prefill fields, not recipient tabs** (different from `spARK new member template`, whose fillable fields are locked tabs on the `ARK` recipient). Match by `name`, not by the generated `tabLabel` GUID.
- `references/spARK-Labs-External-Events-Constitution.pdf` — internal policy: room setup rules, the pricing rate card, cleaning-fee tiers, insurance requirement, and the theme-alignment approval rule. Source of truth for Step 4's pricing math.

## Source Form

BossHub form: **spARK Labs Event Inquiry Form**, `form_id: JuAudDvFOm9CGB602qmE`.

Use `bosshub_list_submissions` / `bosshub_get_submission` with `form_id: "JuAudDvFOm9CGB602qmE"` — this form is not the default (the default is the member inquiry form), so always pass `form_id` explicitly.

Normalized fields available on each submission (added to the shared `normalizeSubmission` in the operations worker on 2026-08-06 specifically for this form):

| Field | Notes |
|---|---|
| `first_name` / `last_name` / `full_name` | Submitter name |
| `email` | Submitter email |
| `phone` | Submitter phone |
| `company_name` | Business / organization name |
| `title_role` | Submitter's title |
| `entity_type` | e.g. "For-profit Corporation", "501(c)(3) Nonprofit" — drives the nonprofit discount |
| `event_name` | Event title, e.g. "Florida Healthcare Robotics Summit" — this is also what goes in the DocuSign **Type of Event** field; the form has no separate event-type/category field |
| `event_description` | Free-text description or event URL |
| `event_audience` | Who the event is for |
| `expected_attendees` | Headcount, e.g. "60+", "40", "85" — free text, not always a clean number |
| `event_date_start` / `event_date_end` | MM-DD-YYYY. Equal for single-day events (the common case) |
| `event_start_time` / `event_end_time` | Free text, e.g. "5:30", "9:30am" |
| `event_space_requested` | Room requested, e.g. "Innovation Foundation Hall (160 Max Capacity)" |
| `referral_source` | How they heard about spARK Labs |

Everything else (theme category, alcohol/catering questions, insurance acknowledgment) is on the submission but not normalized — read it from `raw.others` if you need it for the Step 3 confirmation, but no field is required for the DocuSign send itself.

## Workflow

### Step 1 - Read event inquiries

Use `bosshub_list_submissions` with `form_id: "JuAudDvFOm9CGB602qmE"` to read recent submissions.

If a name, company, or email is provided in the command, use `bosshub_get_submission` with the same `form_id` to find matching submissions.

### Step 2 - Select one inquiry

Show a numbered list:

```
Found X event inquiries:

1. Luke Lee - Rovex Technologies - luke@gorovex.com - Florida Healthcare Robotics Summit - 10/21/2026
2. Meghan O'Keefe - Tampa Bay Tech - mokeefe@tampabay.tech - Human Side of Scaling in the Age of AI - 08/19/2026

Which event should I send the agreement for?
```

If the user supplied identifying info and exactly one submission matches, present that submission for confirmation. If multiple match, ask the user to choose by number.

### Step 3 - Confirm event details

Before pricing or sending anything, show:

```
Ready to prepare agreement for:
- Organization: [company_name] ([entity_type])
- Contact: [first_name] [last_name] <[email]> — [phone]
- Event: [event_name]
- Date(s): [event_date_start]–[event_date_end]
- Time: [event_start_time]–[event_end_time]
- Room: [event_space_requested]
- Expected attendees: [expected_attendees]

Reminder (Events Constitution): confirm this event aligns with 2+ of spARK's four
themes (Technology, Entrepreneurship, Education, Local Community) — unless the host
is a sponsor or Friend of spARK. Special Event Insurance is required regardless of
alcohol service.

Proceed to pricing?
```

Wait for explicit confirmation before calculating pricing.

### Step 4 - Calculate pricing

Reference: `references/spARK-Labs-External-Events-Constitution.pdf`.

**1. Room rate:**

| `event_space_requested` contains | Rate |
|---|---|
| "Innovation Foundation Hall" | $500/hour |
| "Training Room" | $125/hour |

If the room name doesn't match either, stop and ask Edwin for the rate — do not guess.

**2. Billable hours:** `event_end_time` − `event_start_time`, as submitted. Per the Constitution, hosts are responsible for reserving/paying for their entire block including setup/teardown — trust the times on the form as the full billable block, don't add hours on top of it.

**3. Base rental** = rate/hour × hours.

**4. Nonprofit discount:** if `entity_type` contains "Nonprofit", apply 25% off base rental. This discounted (or full) amount is the **Price** tab value.

**5. Service fee** = 20% of Price. Applies to every event, no exceptions.

**6. Cleaning fee**, by `expected_attendees`:

| Attendees | Cleaning fee |
|---|---|
| Under 30 | $0 |
| 30–100 | $200 flat |
| 100+ | $50/hr (1 cleaner) or $100/hr (2-person team) — spARK decides staffing based on attendance, catering, duration, and setup. **Ask Edwin** which tier and how many hours. |

Also: if the event falls outside Mon–Fri 8:00 AM–5:00 PM, professional cleaning is required regardless of attendee count, at the same $50/$100-per-hour rates — **ask Edwin** to confirm staffing here too.

**Additional Fees** = Service fee + Cleaning fee.

**Total Due** = Price + Additional Fees.

Present the full breakdown and get Edwin's explicit confirmation (or override) before locking in Price / Additional Fees / Total Due:

```
Pricing:
- Room: [room] @ $[rate]/hr × [hours]hr = $[base rental]
- Nonprofit discount: [applied 25% / n/a]
- Price: $[price]
- Service fee (20%): $[service fee]
- Cleaning fee: $[cleaning fee] [flat $200 / <30 no fee / needs staffing confirm]
- Additional Fees: $[additional fees]
- Total Due: $[total due]

Confirm these figures before I send the agreement?
```

Do not send the DocuSign until pricing is confirmed. Do not leave Price / Additional Fees / Total Due blank or guessed.

### Step 5 - Send DocuSign agreement

Call `getTemplates` and find the template named exactly **`Event Agreement Template`**. Use the `templateId` returned. If no exact match is found, stop and report the error. If multiple matches are found, list them and ask the operator which to use.

**Recipients:** `Client` and `Rebecca` — both routing order 1 (they sign in parallel, not sequentially like the member agreement's Founder→ARK).

Call `createEnvelopeFromTemplate`. Override the `Client` role recipient:
- Name: `[first_name] [last_name]`
- Email: `[email]`

Do not override the `Rebecca` role recipient — the template is pre-configured with **Rebecca Brown (brownr@sp-ark-labs.com)** as the ARK signer.

**Populate the document-level prefill fields** (`documents[0].tabs.prefillTabs.textTabs` in `references/EventAgreementTemplate.json` — not recipient tabs):

| Tab name | Value |
|---|---|
| `Business / Organization` | `company_name` |
| `Phone Number` | `phone` |
| `Email` | `email` |
| `Authorized Representative` | `[first_name] [last_name]` |
| `Date Executed` | Today's date |
| `Event Date(s)` | `event_date_start` if it equals `event_date_end`, otherwise `[event_date_start] – [event_date_end]` |
| `Event Start Time` | `event_start_time` |
| `Event End Time` | `event_end_time` |
| `Expected Attendees` | `expected_attendees` |
| `Event Space Reserved` | `event_space_requested`, verbatim |
| `Type of Event` | `event_name` |
| `Price` | Confirmed in Step 4 |
| `Additional Fees` | Confirmed in Step 4 |
| `Total Due` | Confirmed in Step 4 |

> **Note on field visibility:** as with the member agreement template, pre-filled fields may not show in the DocuSign sender preview/draft view. This is expected — verify against the delivered envelope, not the preview.

### Step 6 - Report result

```
Send Event Template

Event: [event_name] — [company_name]
Contact: [first_name] [last_name] <[email]>
Date(s): [event_date_start]–[event_date_end], [event_start_time]–[event_end_time]
Room: [event_space_requested]
Total Due: $[total due]

- DocuSign: Sent / Blocked / Failed
```

## Guardrails

- Process one event per run.
- Do not send the DocuSign until the operator confirms event details in Step 3 **and** pricing in Step 4.
- Do not guess the DocuSign template ID — always look up `Event Agreement Template` by exact name.
- Do not guess the room rate if `event_space_requested` doesn't match a known rate-card room — stop and ask.
- Do not guess cleaning-fee staffing for 100+ attendee or after-hours events — always ask Edwin.
- This skill does not check theme alignment or approve the event — that judgment call stays with Edwin/Becca per the Events Constitution. Surface the reminder in Step 3; don't block on it.
