# BossHub / LeadConnector MCP Server Spec

The new member inquiry form is hosted at:

```text
https://api.bosshub.ai/widget/form/Ftg5p93SEeTnUWiyAgYn
```

The widget is backed by LeadConnector/HighLevel form infrastructure.

## Environment

```text
BOSSHUB_API_BASE_URL=https://services.leadconnectorhq.com
BOSSHUB_ACCESS_TOKEN=
BOSSHUB_LOCATION_ID=jqh6rxfWtvMIQCKxcDlc
BOSSHUB_FORM_ID=Ftg5p93SEeTnUWiyAgYn
BOSSHUB_API_VERSION=2023-02-21
```

The access token must be a Sub-Account token or Private Integration token with `forms.readonly`.

For local development, store these values in the root `.env.local` file, which is ignored by git.

## API Endpoint

```text
GET /forms/submissions
```

Required query:

- `locationId`

Useful query:

- `formId`
- `page`
- `limit`
- `q`
- `startAt`
- `endAt`

Required headers:

```text
Authorization: Bearer <token>
Version: 2023-02-21
Accept: application/json
```

## Tools

### `bosshub_list_member_inquiries`

Lists recent submissions from the new member inquiry form.

### `bosshub_get_member_inquiry`

Finds a single submission by submission ID, email, or name.

## Field Mapping

| Normalized field | BossHub field key |
|---|---|
| `first_name` | `first_name` |
| `last_name` | `last_name` |
| `title_role` | `s0JIvAXj17YVoH2YBhu4` |
| `email` | `email` |
| `phone` | `phone` |
| `company_name` | `SveMFZmkJfqyiqQIuAKL` |
| `website_social` | `4VSRVlLjJvw7QgE3rqMf` |
| `category` | `6P4EuLNRzjcwKiWSMkjq` |
| `company_overview` | `eYDFtLOlNYZ5fsVuBT9B` |
| `company_stage` | `EDPm7rHgeLahGflz85CL` |
| `customers` | `P7cqCF9XwFSOl7toHITp` |
| `capital_raised` | `lppKMNd3RbRjqnGD5sq9` |
| `notable_investors` | `RVE6Mkvx52yidicLQZXF` |
| `team_size` | `jXa8AJG6up3Hr1GGHSJA` |
| `additional_workspace_users` | `VoU7n2eR9xgqgY0rvh9l` |
| `interested_membership_option` | `FqzY7u4YKgq6XkkwwRIY` |
| `desired_start_date` | `oCeokCCqhwv8w34IG8wj` |
| `workspace_requirements` | `JVbMOKVFRF0VplBp23ep` |
| `mail_services` | `c6u6qpONYFqxXXWkWsuI` |
| `communication_preference` | `v9JpZpQWsvialNwB4H9s` |
| `other_needs_notes` | `K8WryShuVikObpNmq7Pv` |
| `referral_source` | `WIFqOYy3YY0fOGImtcaa` |
