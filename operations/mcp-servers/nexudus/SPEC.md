# Nexudus MCP Server Spec

This custom MCP server will support the Operations plugin's new member onboarding workflow.

## Environment

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

Nexudus supports bearer token auth. Tokens can be supplied directly via `NEXUDUS_ACCESS_TOKEN` or obtained with `POST /api/token` using form-encoded username/password credentials. If 2FA is enabled, include `NEXUDUS_TOTP`.

Exact endpoint details should be finalized from Edwin's Nexudus account and current Nexudus API docs before enabling writes.

## Tools

### `nexudus_find_person`

Input:

```json
{ "email": "member@example.com" }
```

Returns an existing customer/member/contact if one exists.

### `nexudus_create_person`

Input:

```json
{
  "first_name": "Jane",
  "last_name": "Smith",
  "email": "jane@example.com"
}
```

Creates the person record needed for portal access.

Pending decision: Edwin needs to confirm whether this should create a member or contact.

### `nexudus_assign_booking_access`

Input:

```json
{
  "person_id": "nexudus-person-id",
  "plan_id": "optional-plan-id"
}
```

Assigns whatever membership plan/product is required for booking rooms and seeing availability.

Pending decision: Edwin needs to confirm whether booking access requires a plan/product.

## V1 Behavior

- Do duplicate checks by email before creating records.
- Do not guess member/contact type.
- Do not guess plan/product IDs.
- Return structured success/failure data for final workflow reporting.
