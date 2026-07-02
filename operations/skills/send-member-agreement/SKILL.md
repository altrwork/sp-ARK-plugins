---
name: send-member-agreement
description: Read a BossHub/LeadConnector member inquiry and send the onboarding agreement through DocuSign. Use this first step when a new potential member inquiry comes in and Edwin wants to send them the membership agreement. Building access and member portal creation happen separately after the agreement is signed.
argument-hint: "[member name or email]"
---

# Send Member Agreement

You are helping sp-ARK Labs send a membership agreement to one prospective member. This skill covers the intake-to-DocuSign portion of onboarding only. Building access, Nexudus creation, and Slack invite are handled separately by `/activate-member-access` after the agreement is returned signed.

## Required Connectors

- BossHub / LeadConnector connector for reading new member inquiry form submissions.
- DocuSign connector for sending the onboarding agreement.

If either connector is unavailable, report it and stop.

## Source Form

BossHub form URL:

```text
https://api.bosshub.ai/widget/form/Ftg5p93SEeTnUWiyAgYn
```

Use the BossHub connector tools:

- `bosshub_list_member_inquiries`
- `bosshub_get_member_inquiry`

Important normalized fields:

| Field | Notes |
|---|---|
| `first_name` | Member first name |
| `last_name` | Member last name |
| `title_role` | Member title/role |
| `email` | Member email |
| `phone` | Member phone |
| `company_name` | Company name for DocuSign |
| `additional_workspace_users` | Registered individuals who will use the space |
| `interested_membership_option` | Candidate membership type |
| `desired_start_date` | Candidate membership start date |
| `workspace_requirements` | Desk/office setup notes |
| `mail_services` | Mail service preference |
| `communication_preference` | Slack/email/SMS preference |
| `other_needs_notes` | Special requirements |

## Workflow

### Step 1 - Read member inquiries

Use `bosshub_list_member_inquiries` to read recent submissions from the BossHub/LeadConnector form.

If a member name or email is provided in the command, use `bosshub_get_member_inquiry` to find matching submissions.

### Step 2 - Select one member

Show a numbered list of submissions:

```
Found X member inquiries:

1. Jane Smith - Acme AI - jane@example.com - Flex Desk - Desired start: 07/01/2026
2. Taylor Brown - Example Robotics - taylor@example.com - Private Office - Desired start: 08/01/2026

Which member should I send the agreement to?
```

If the user supplied a name or email and exactly one submission matches, present that submission for confirmation. If multiple match, ask the user to choose by number.

### Step 3 - Confirm member details

Before collecting DocuSign fields or sending anything, show:

```
Ready to send agreement to:
- Name: [first name] [last name]
- Company: [company name]
- Email: [email]
- Phone: [phone]
- Membership interest: [interested membership option]
- Desired start date: [desired start date]
- Additional workspace users: [additional workspace users]

Proceed?
```

Wait for explicit confirmation before asking for DocuSign fields.

### Step 4 - Collect DocuSign fields from operator

Most fields are auto-derived. The only operator input needed is for optional pricing add-ons.

**Auto-derived fields — do not ask the operator:**

| Field | How to derive |
|---|---|
| `membership_length` | Always `1 year` |
| `membership_end_date` | `desired_start_date` + 1 year |
| `max_occupancy` | From membership option table below |
| `monthly_membership_price` | From membership option table below |

**Membership option reference:**

| BossHub form option | Monthly price | Max occupancy |
|---|---|---|
| Flex Desk | $300 | 1 |
| Fixed Desk | $400 | 2 |
| Micro Office | $850 | 2 |
| Small Office | $1,000 | 4 |
| Medium Office | $1,500 | 6 |
| Large Office | $2,500 | 8 |

Set `monthly_membership_qty` to `1` and calculate `monthly_membership_subtotal` as `price × qty`.

**Only ask the operator for pricing add-ons:**

| Field | Notes |
|---|---|
| `mail_service_price` | `0` if not selected; otherwise the monthly mail rate |
| `other_monthly_fees_price` | Any additional fees; `0` if none |
| `other_monthly_fees_qty` | Quantity (only if `other_monthly_fees_price > 0`) |

Set `mail_service_qty` to `0` or `1` to match whether mail service is selected. Calculate all subtotals and `total_monthly` (sum of all three subtotals) before sending.

In the **1.3 Price Details** table, prefix price and subtotal fields with `$` (e.g. `$300`, `$1,000`) — this applies to `monthly_membership_price`, both subtotal fields, `mail_service_price`, `other_monthly_fees_price`, and `total_monthly`. Qty fields (`monthly_membership_qty`, `mail_service_qty`, `other_monthly_fees_qty`) stay plain numbers with no `$`.

Do not send the DocuSign until pricing add-ons are confirmed. Do not leave locked pricing fields blank.

### Step 5 - Send DocuSign agreement

Use the DocuSign connector to send the onboarding agreement from the configured template.

Call `getTemplates` and find the template named exactly **`spARK new member template`**. Use the `templateId` returned from that result. If no match is found, stop and report the error. If multiple matches are found, list them and ask the operator which to use.

**Roles:** `Founder` (routing order 1) → `ARK` (routing order 2)

Call `createEnvelopeFromTemplate`. Override the `Founder` role recipient:
- Name: `[first_name] [last_name]`
- Email: `[email]`

Do not override the `ARK` role recipient — the template is configured with **Rebecca Brown (CEO)** as the ARK signer.

Pre-fill all locked tabs before sending.

> **Note on field visibility:** Pre-filled locked tabs are not visible in the DocuSign sender preview or envelope draft view. This is expected — they will appear correctly in the envelope delivered to signers. Do not re-enter or adjust tabs based on the preview.

Tabs on the `Founder` role — map from BossHub data and operator-provided fields:

| Tab label | Source |
|---|---|
| `member_organization` | `company_name` |
| `company_name` | `company_name` |
| `member_representative` | `first_name` + `last_name` + `phone`, formatted `[first_name] [last_name] — [phone]` |
| `registered_individuals` | `additional_workspace_users` |
| `membership_type` | `interested_membership_option` |
| `membership_start_date` | `desired_start_date` |
| `membership_end_date` | Auto-derived in Step 4 |
| `membership_length` | Auto-derived in Step 4 |
| `max_occupancy` | Auto-derived in Step 4 |

Tabs on the `ARK` role — pricing fields collected from operator in Step 4. Enter all price values with a leading `$` per the formatting rule above.

### Step 6 - Report result

```
Send Member Agreement

Member: [first name] [last name] <[email]>
Company: [company name]
Membership: [membership type] — starting [start date]

- DocuSign: Sent / Blocked / Failed

Next step: Run /activate-member-access [email] after the signed agreement is returned.
```

## Guardrails

- Process one member per run.
- Do not send the DocuSign until the operator explicitly confirms member details in Step 3.
- Do not guess DocuSign template IDs or pricing values — always look up the template by name.
- Do not grant any building access or portal access in this skill — that happens only after signing.
