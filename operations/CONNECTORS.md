# Connectors

The Operations plugin coordinates new member onboarding across BossHub/LeadConnector, Microsoft 365, DocuSign, Verkada, Nexudus, and Outlook-drafted Slack invite emails to members.

## Required Connectors

| Connector | Service | Purpose | Status |
|---|---|---|---|
| BossHub | BossHub / LeadConnector / HighLevel | Read new member inquiry form submissions | Custom MCP server scaffolded in this marketplace |
| `ms365` | Microsoft 365 / Outlook | Draft the Slack invite email to the member | Reuse existing Microsoft 365 MCP pattern |
| DocuSign | DocuSign | Send the onboarding agreement | Use Claude's prebuilt DocuSign connector after creating the template/workflow from Edwin's Word document |
| Verkada | Verkada Command | Create access users and assign access groups | Custom MCP server scaffolded in this marketplace |
| Nexudus | Nexudus | Add member portal/booking access | Custom MCP server scaffolded in this marketplace |

## BossHub / LeadConnector

The new member inquiry form is:

```text
https://api.bosshub.ai/widget/form/Ftg5p93SEeTnUWiyAgYn
```

The form is backed by LeadConnector/HighLevel. The submissions API is:

```text
GET https://services.leadconnectorhq.com/forms/submissions
```

Required configuration:

```text
BOSSHUB_ACCESS_TOKEN=
BOSSHUB_LOCATION_ID=jqh6rxfWtvMIQCKxcDlc
BOSSHUB_FORM_ID=Ftg5p93SEeTnUWiyAgYn
BOSSHUB_API_VERSION=2023-02-21
```

The token must have `forms.readonly`.

For local development, put these values in the ignored root `.env.local` file. Do not commit access tokens.

Local package:

```text
operations/mcp-servers/bosshub/
```

Tools:

- `bosshub_list_member_inquiries`
- `bosshub_get_member_inquiry`

## Microsoft 365

Use the same Microsoft 365 connector pattern as `community-management`.

One-time login:

```bash
npx @softeria/ms-365-mcp-server --login
```

Microsoft 365 is currently used for Outlook draft email creation, not form intake.

Slack invite draft emails should be addressed directly to the member email from the BossHub form.

## DocuSign

DocuSign is required for V1. Edwin provided the source Word document, and the next step is converting that document into the DocuSign template/workflow.

Source agreement:

```text
operations/skills/new-member-onboarding/references/spARK Membership Agreement Template.docx
```

Fields visible in the current document that likely need DocuSign/workbook mapping:

- Date Agreement Created
- Member Organization / Company name
- Authorized Member Representative / POC name
- Phone number
- Email
- Registered Individual(s)
- Membership Type
- Membership Start Date
- Membership End Date
- Max Occupancy
- Pricing terms

Pending configuration:

- DocuSign template ID or envelope sending instructions after the template is created
- Required signing fields
- Any sender/account constraints for Edwin

## Verkada

The Verkada MCP server should live under:

```text
operations/mcp-servers/verkada/
```

Install dependencies before wiring the server into `.mcp.json`:

```bash
cd operations/mcp-servers/verkada
npm install
```

The server needs tools for:

- `verkada_find_access_user` - find an access user by email
- `verkada_create_access_user` - create a core Verkada user
- `verkada_list_access_groups` - list access groups so Edwin can choose the right one
- `verkada_add_user_to_access_group` - add a user to the configured access group

Local package:

```text
operations/mcp-servers/verkada/
```

Environment:

```text
VERKADA_API_KEY=
VERKADA_REGION=api
VERKADA_DEFAULT_ACCESS_GROUP_ID=
VERKADA_DRY_RUN=true
```

The server defaults to dry-run mode. Set `VERKADA_DRY_RUN=false` only after Edwin provides an admin-enabled API key and confirms the access group.

Pending configuration:

- Verkada API key should be supplied through `VERKADA_API_KEY`, never committed
- Verkada region/base URL
- Target all-access group name or ID
- Whether Verkada Pass and remote unlock can be configured through the available API

## Nexudus

The Nexudus MCP server should live under:

```text
operations/mcp-servers/nexudus/
```

Install dependencies before wiring the server into `.mcp.json`:

```bash
cd operations/mcp-servers/nexudus
npm install
```

The server needs tools for:

- `nexudus_find_person` - find a customer/member/contact by email
- `nexudus_create_person` - create the person record needed for portal access
- `nexudus_assign_booking_access` - assign the plan/product required for room booking, if required

Local package:

```text
operations/mcp-servers/nexudus/
```

Environment:

```text
NEXUDUS_API_BASE_URL=
NEXUDUS_ACCESS_TOKEN=
NEXUDUS_USERNAME=
NEXUDUS_PASSWORD=
NEXUDUS_TOTP=
NEXUDUS_BUSINESS_ID=
NEXUDUS_PERSON_TYPE=
NEXUDUS_DEFAULT_PLAN_ID=
NEXUDUS_DRY_RUN=true
```

Nexudus authentication supports bearer tokens. Per the Nexudus docs, a bearer token can be obtained with `POST /api/token` using form-encoded username/password credentials. Prefer setting `NEXUDUS_ACCESS_TOKEN` directly for testing if Edwin can provide a token. If using username/password, keep credentials in local environment variables only.

The server intentionally blocks create/assign actions until Edwin confirms the exact Nexudus endpoints and required fields for the sp-ARK setup.

Pending configuration:

- Nexudus access token, or username/password credentials for token exchange
- Create as Customer Type: Company
- Company Name source field
- Plan source from the DocuSign agreement
- Target location/business identifier

## Slack Invite Email

V1 should draft a Slack invite email in Outlook through Microsoft 365 instead of using a Slack connector.

Slack invite link:

```text
https://sparklabsbyarkinvest.slack.com/join/invite/enQtMTEyODExNTY5NjQ3NzQtNjI3NDg3YTkxMzllODcwZDkxNDg2YWRiOTNkZjNjMDUwMmNhZTdkNDY1MDQ5ZmFlYWFhYjBiNzMxMTRlYTZlNQ#/email-invite/credentials
```

Draft behavior:

- To: member email from the BossHub form
- Body: short welcome note plus the Slack invite link
- Send behavior: save as draft only unless the user explicitly asks to send

Pending configuration:

- Default Slack channel list, if any
- Preferred email subject/body wording
