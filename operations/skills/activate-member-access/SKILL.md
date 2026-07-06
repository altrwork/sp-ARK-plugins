---
name: activate-member-access
description: Provision building access, member portal, and Slack invite for a new sp-ARK Labs member after their membership agreement has been signed. Run this after the signed DocuSign is returned. Handles Verkada access creation, Nexudus member creation, and an Outlook draft with the Slack workspace invite link.
argument-hint: "[member email]"
---

# Activate Member Access

You are helping sp-ARK Labs provision access for a new member whose membership agreement has been signed and returned. This skill is the second step of new member onboarding — the DocuSign agreement should already be completed before running this.

This skill handles:
- Verkada building access (create user, assign to All Access group, send Pass app invite, enable remote unlock)
- Nexudus member portal creation
- Outlook draft email with the Slack workspace invite link

## Required Connectors

- BossHub / LeadConnector connector for looking up member details by email.
- Verkada connector for creating the access user and assigning access.
- Nexudus connector for adding the member to the member portal.
- Microsoft 365 (`ms365`) for drafting the Slack invite email from Outlook.

If a connector is unavailable, continue through the remaining systems and report the blocked action in the summary.

## Workflow

### Step 1 - Look up member

Accept a member email as the argument. Use `bosshub_get_member_inquiry` to find the matching BossHub submission by email.

If no email is provided, ask the operator:

```
Which member should I activate? Please provide their email address.
```

If no matching submission is found in BossHub, ask the operator to confirm the member's details manually:
- First name
- Last name
- Company name
- Membership type (used to determine the Nexudus tariff)

### Step 2 - Confirm member and signing status

Show the member details and confirm before provisioning anything:

```
Ready to activate access for:
- Name: [first name] [last name]
- Company: [company name]
- Email: [email]
- Membership type: [interested membership option]

Confirm: has the signed agreement been returned?

Planned actions:
- Add Verkada access user, assign to All Access group, send Pass app invite, enable remote unlock
- Add Nexudus member account
- Draft Outlook email with Slack invite link

Proceed?
```

Wait for explicit confirmation before creating, adding, or inviting anything.

### Step 3 - Add Verkada access

Use the Verkada connector tools, in order:

1. Call `verkada_find_access_user` with `[email]`.
2. If none exists, call `verkada_create_access_user` for `[first name] [last name]` and `[email]`. Note the `user_id` from the response (or from `verkada_find_access_user` if the member already existed) — the remaining steps need it.
3. Call `verkada_add_user_to_access_group` with the existing or created user and the configured access group.
4. Call `verkada_send_pass_invite` with `user_id` and `email` so they get the "download Verkada Pass and set your password" email. This is required — the member needs the app to badge/unlock the door. Both `user_id` and `email` are required arguments — Verkada rejects the request if only `external_id` is supplied.
5. Call `verkada_activate_remote_unlock` with the same `user_id` and `email` so they can unlock doors from the Pass app, not just badge in.

Target access group: **All Access** (`1018efcf-5d11-4a3d-b01a-57bd8d3cd346`). If the connector or access group is unavailable, do not attempt a partial access update. Mark Verkada as blocked in the final summary.

Bluetooth unlock has no public Verkada API endpoint as of this writing — that toggle still has to be set manually in Verkada Command (Access Users and Groups → user profile → Verkada Pass).

### Step 4 - Add Nexudus access

Use the Nexudus connector tools:

1. Call `nexudus_find_person` with `[email]`.
2. If none exists, determine the correct plan using the table below, then call `nexudus_create_person` with `[first name] [last name]`, `[email]`, `[company_name]`, and the resolved `tariff_id`.

**Plan mapping — use `membership_type` from the confirmed BossHub data to look up the Nexudus tariff ID. If the membership type is not in this table, ask Edwin to confirm before creating.**

| BossHub form option | Nexudus plan | Tariff ID | Monthly price |
|---|---|---|---|
| Flex Desk | Flex | 1415300509 | $300 |
| Fixed Desk | Fixed | 1415300510 | $400 |
| Micro Office | Micro | 1415300506 | $850 |
| Small Office | Small | 1415300389 | $1,000 |
| Medium Office | Medium | 1415300508 | $1,500 |
| Large Office | Large | 1415300388 | $2,500 |

Nexudus auth note: Nexudus supports bearer tokens from `POST /api/token` with form-encoded username/password credentials. If a static access token is available, use it as `NEXUDUS_ACCESS_TOKEN`; otherwise the custom MCP server can exchange `NEXUDUS_USERNAME` and `NEXUDUS_PASSWORD` for a token.

### Step 5 - Draft welcome email

Use Microsoft 365 Outlook to draft a welcome email from Edwin to `[email]`.

Use the template at `references/welcome-email.md`. Substitute `{member_name}` with the member's first name.

Save the message as a draft with subject **"Welcome to spARK Labs!"**. Do not send automatically unless the user explicitly asks.

### Step 6 - Report results

```
Activate Member Access

Member: [first name] [last name] <[email]>
Company: [company name]
Membership: [membership type]

- Verkada: Added / Already existed / Blocked / Failed
- Verkada Pass invite: Sent / Blocked / Failed
- Verkada remote unlock: Enabled / Blocked / Failed
- Nexudus: Added / Already existed / Blocked / Failed
- Slack invite email: Drafted / Blocked / Failed

Notes:
- [Only include meaningful blockers, failures, or follow-up items.]
```

## Guardrails

- Process one member per run.
- Do not provision access until the operator explicitly confirms the member details and that the agreement is signed.
- Do not guess Verkada access group IDs, Nexudus tariff IDs, or Slack channels.
- If a write action fails, continue to the remaining independent systems and report the failure clearly.
- Treat duplicate detection as best effort by email address.
