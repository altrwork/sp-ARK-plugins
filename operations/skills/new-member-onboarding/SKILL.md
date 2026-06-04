---
name: new-member-onboarding
description: Onboard one new sp-ARK Labs member from a BossHub/LeadConnector form submission. Use when Edwin or another operator wants to manually start new member onboarding, review one pending member inquiry, send the agreement through DocuSign, add building access in Verkada, add member portal access in Nexudus, and draft the Slack invite email in Outlook.
argument-hint: "[member name or email]"
---

# New Member Onboarding

You are helping sp-ARK Labs operations onboard one new member at a time. This is a controlled workflow: read the BossHub form submissions, let the operator choose one person/company, confirm details, then perform the external provisioning steps.

## Required Connectors

- BossHub / LeadConnector connector for reading new member inquiry form submissions.
- Microsoft 365 (`ms365`) for Outlook draft email creation.
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
- Draft Outlook email for Slack channel invite

Proceed?
```

Wait for explicit confirmation before creating, sending, or inviting anything.

### Step 4 - Send DocuSign agreement

Use the DocuSign connector to send the onboarding agreement.

The source Word document is:

```text
operations/skills/new-member-onboarding/references/spARK Membership Agreement Template.docx
```

V1 setup is pending. The DocuSign template/workflow still needs to be created from the Word document. If no DocuSign template or envelope instructions are available, do not guess. Report:

```
DocuSign is blocked: Edwin still needs to provide the DocuSign template or sending instructions.
```

When configured, use:
- Recipient name: `[first name] [last name]`
- Recipient email: `[email]`
- Company name: `[company_name]`
- Membership type: `[interested_membership_option]`
- Membership start date: `[desired_start_date]`

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
2. If none exists, call `nexudus_create_person` for `[first name] [last name]` and `[email]`.
3. If Edwin confirms a plan/product is required for booking access, call `nexudus_assign_booking_access`.

V1 setup is pending until Edwin confirms whether the person should be created as a member or contact and whether a plan/product must be assigned for booking access. If this is not configured, do not guess. Mark Nexudus as blocked in the final summary.

Known Edwin workflow in Nexudus:

- Go to Operations -> Members -> Add Customer.
- Customer Type: Company.
- Enter Company Name, Email, and Person's Name.
- Set identifier to Member.
- Set Plan from the DocuSign agreement.

Nexudus auth note: Nexudus supports bearer tokens from `POST /api/token` with form-encoded username/password credentials. If a static access token is available, use it as `NEXUDUS_ACCESS_TOKEN`; otherwise the custom MCP server can exchange `NEXUDUS_USERNAME` and `NEXUDUS_PASSWORD` for a token.

If company name or plan is not available from the workbook or completed agreement, do not guess. Mark Nexudus as blocked or partially blocked and identify the missing field.

### Step 7 - Draft Slack invite email

Use Microsoft 365 Outlook to draft an email from Edwin to the person who sends Slack channel invites.

The draft should include:

- New member name: `[first name] [last name]`
- New member email: `[email]`
- Slack channel or channels to invite them to, if configured

If the recipient or channel list is not configured, draft what is known and leave a clear placeholder in the email body for Edwin to fill before sending.

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
- Do not guess DocuSign template IDs, Verkada access group IDs, Nexudus plans, Slack channels, or the Slack invite email recipient.
- If a write action fails, continue to the remaining independent systems and report the failure clearly.
- Treat duplicate detection as best effort by email address.
