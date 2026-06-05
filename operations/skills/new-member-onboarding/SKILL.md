---
name: new-member-onboarding
description: Onboard one new sp-ARK Labs member from a BossHub/LeadConnector form submission. Use when Edwin or another operator wants to manually start new member onboarding, review one pending member inquiry, send the agreement through DocuSign, add building access in Verkada, add member portal access in Nexudus, and draft an Outlook email to the member with the Slack invite link.
argument-hint: "[member name or email]"
---

# New Member Onboarding

You are helping sp-ARK Labs operations onboard one new member at a time. This is a controlled workflow: read the BossHub form submissions, let the operator choose one person/company, confirm details, then perform the external provisioning steps.

## Required Connectors

- BossHub / LeadConnector connector for reading new member inquiry form submissions.
- Microsoft 365 (`ms365`) for Outlook draft email creation with the Slack invite link.
- DocuSign connector for sending the onboarding agreement once the Word document is converted into a DocuSign template/workflow.
- Verkada connector for creating the access user and assigning access.
- Nexudus connector for adding the member so they can book rooms and see availability.

If any connector is unavailable, continue through the review step and report that the unavailable action is blocked.

## Source Form

BossHub form URL:

```text
https://api.bosshub.ai/widget/form/Ftg5p93SEeTnUWiyAgYn
```

This is backed by LeadConnector/HighLevel form submissions.

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
| `company_name` | Company name for DocuSign and Nexudus |
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

Which member should I onboard?
```

If the user supplied a name or email in the command and exactly one submission matches, present that submission for confirmation. If multiple submissions match, ask the user to choose by number.

### Step 3 - Confirm details

Before taking external actions, show:

```
Ready to onboard:
- Name: [first name] [last name]
- Company: [company name]
- Email: [email]
- Phone: [phone]
- Membership interest: [interested membership option]
- Desired start date: [desired start date]
- Additional workspace users: [additional workspace users]

Planned actions:
- Send DocuSign agreement
- Add Verkada access user and access group
- Add Nexudus member access
- Draft Outlook email to the member with the Slack invite link

Proceed?
```

Wait for explicit confirmation before creating, sending, or inviting anything.

### Step 4 - Send DocuSign agreement

Use the DocuSign connector to send the onboarding agreement from the configured template.

**Template ID:** `8772e4f2-e427-4f4d-828f-69cfa69fd779`
**Roles:** `Founder` (routing order 1) → `ARK` (routing order 2)

Call `createEnvelopeFromTemplate`. Override the `Founder` role recipient:
- Name: `[first_name] [last_name]`
- Email: `[email]`

Do not override the `ARK` role recipient — leave it as configured in the template.

**Pre-fill all locked tabs before sending.** Locked tabs appear on the document but cannot be edited by the signer.

Tabs on the `Founder` role — map directly from BossHub data:

| Tab label | Source field |
|---|---|
| `member_organization` | `company_name` |
| `company_name` | `company_name` |
| `member_representative` | `first_name` + `last_name` |
| `registered_individuals` | `additional_workspace_users` |
| `membership_type` | `interested_membership_option` |
| `membership_start_date` | `desired_start_date` |
| `membership_end_date` | Ask operator — not in BossHub form |
| `membership_length` | Ask operator — derive from membership type or confirm directly |
| `max_occupancy` | Ask operator — not in BossHub form |

Tabs on the `ARK` role — pricing fields, ask operator before sending:

| Tab label | Notes |
|---|---|
| `monthly_membership_price` | Base rate for the selected membership type |
| `monthly_membership_qty` | Typically `1` |
| `monthly_membership_subtotal` | `price × qty` |
| `mail_service_price` | `0` if not selected; otherwise the monthly mail rate |
| `mail_service_qty` | `0` or `1` |
| `mail_service_subtotal` | `price × qty` |
| `other_monthly_fees_price` | Any additional fees; `0` if none |
| `other_monthly_fees_qty` | Quantity |
| `other_monthly_fees_subtotal` | `price × qty` |
| `total_monthly` | Sum of all three subtotals |

If any pricing field is unknown, ask the operator before sending. Do not leave locked pricing fields blank.

### Step 5 - Add Verkada access

Use the Verkada connector tools:

1. Call `verkada_find_access_user` with `[email]`.
2. If none exists, call `verkada_create_access_user` for `[first name] [last name]` and `[email]`.
3. Call `verkada_add_user_to_access_group` with the existing or created user and the configured access group.

V1 setup is pending until Edwin provides an admin-enabled Verkada account/API key and the target access group name or ID. If the connector or access group is unavailable, do not attempt a partial access update. Mark Verkada as blocked in the final summary.

Known Edwin workflow in Verkada:

- Add new user with first name, last name, and email.
- Enable Verkada Pass.
- Enable remote unlock.
- Assign the user to the all-access group.

If Verkada Pass or remote unlock cannot be set through the current MCP tools, create/assign the access user and report those remaining settings as manual follow-up.

### Step 6 - Add Nexudus access

Use the Nexudus connector tools:

1. Call `nexudus_find_person` with `[email]`.
2. If none exists, determine the correct plan using the table below, then call `nexudus_create_person` with `[first name] [last name]`, `[email]`, `[company_name]`, and the resolved `tariff_id`.

**Plan mapping — use `membership_type` from the confirmed DocuSign data to look up the Nexudus tariff ID. If the membership type does not map clearly to one plan, ask the operator to confirm before creating.**

| Nexudus plan name | Tariff ID | Monthly price |
|---|---|---|
| Community | 1415300513 | $0 |
| Coworking Micro Office | 1415291121 | $800 |
| Coworking Private Office | 1415291214 | $1,100 |
| Coworking Shed | 1415291215 | $1,200 |
| Dedicated Member | 1415300514 | $0 |
| Dedicated Suite | 1415291122 | $0 |
| Executive | 1415300516 | $0 |
| Fixed | 1415300510 | $400 |
| Flex | 1415300509 | $300 |
| Hotdesk | 1415291213 | $450 |
| Large | 1415300388 | $2,500 |
| Makers Space | 1415305630 | $0 |
| Medium | 1415300508 | $1,500 |
| Micro | 1415300506 | $850 |
| Premium | 1415300515 | $0 |
| Small | 1415300389 | $1,000 |
| Team Member | 1415295148 | $0 |

**"Flex Desk" on the BossHub form maps to the Fixed plan (ID: `1415300510`, $400/mo).** If in doubt, ask Edwin to confirm the plan before creating the coworker.

Nexudus auth note: Nexudus supports bearer tokens from `POST /api/token` with form-encoded username/password credentials. If a static access token is available, use it as `NEXUDUS_ACCESS_TOKEN`; otherwise the custom MCP server can exchange `NEXUDUS_USERNAME` and `NEXUDUS_PASSWORD` for a token.

### Step 7 - Draft Slack invite email

Use Microsoft 365 Outlook to draft an email from Edwin directly to `[email]` with the Slack workspace invite link.

Slack invite link:

```text
https://sparklabsbyarkinvest.slack.com/join/invite/enQtMTEyODExNTY5NjQ3NzQtNjI3NDg3YTkxMzllODcwZDkxNDg2YWRiOTNkZjNjMDUwMmNhZTdkNDY1MDQ5ZmFlYWFhYjBiNzMxMTRlYTZlNQ#/email-invite/credentials
```

The draft should include:

- New member name: `[first name] [last name]`
- The Slack invite link
- A short note that they should use the email address submitted in the member inquiry form

Save the message as a draft. Do not send automatically unless the user explicitly asks.

### Step 8 - Report results

End with a concise execution summary:

```
New Member Onboarding

Member: [first name] [last name] <[email]>
Company: [company name]

- DocuSign: Sent / Blocked / Failed
- Verkada: Added / Already existed / Blocked / Failed
- Nexudus: Added / Already existed / Blocked / Failed
- Slack invite email: Drafted / Blocked / Failed

Notes:
- [Only include meaningful blockers, failures, or follow-up items.]
```

## Guardrails

- Process one member per run.
- Do not provision access until the user confirms the reviewed member details.
- Do not guess DocuSign template IDs, Verkada access group IDs, Nexudus plans, or Slack channels.
- If a write action fails, continue to the remaining independent systems and report the failure clearly.
- Treat duplicate detection as best effort by email address.
