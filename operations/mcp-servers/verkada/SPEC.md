# Verkada MCP Server Spec

This custom MCP server will support the Operations plugin's new member onboarding workflow.

## Environment

```text
VERKADA_API_KEY=
VERKADA_REGION=api
VERKADA_DEFAULT_ACCESS_GROUP_ID=
VERKADA_DRY_RUN=true
```

The server defaults to dry-run mode. Set `VERKADA_DRY_RUN=false` only after Edwin provides an admin-enabled API key and confirms the target access group.

Use the Verkada API auth header expected by the official API docs:

```text
x-verkada-auth: <VERKADA_API_KEY>
```

## Tools

### `verkada_find_access_user`

Input:

```json
{ "email": "member@example.com" }
```

Returns the matching access user if one exists.

### `verkada_create_access_user`

Input:

```json
{
  "first_name": "Jane",
  "last_name": "Smith",
  "email": "jane@example.com",
  "external_id": "jane@example.com"
}
```

Creates an access user. Use email as `external_id` unless Edwin provides another identifier rule.

API endpoint used by the scaffold:

```text
POST /core/v1/user
```

### `verkada_list_access_groups`

Input:

```json
{}
```

Returns access groups so Edwin can identify the right group ID.

API endpoint used by the scaffold:

```text
GET /access/v1/access_groups
```

### `verkada_add_user_to_access_group`

Input:

```json
{
  "user_id": "verkada-user-id",
  "group_id": "verkada-access-group-id"
}
```

Adds the access user to an access group.

API endpoint used by the scaffold:

```text
PUT /access/v1/access_groups/group/user?group_id=...
```

## V1 Behavior

- Do duplicate checks by email before creating users.
- Do not assign access if the target group ID is missing.
- Return structured success/failure data for final workflow reporting.
