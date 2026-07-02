// Identity context from Microsoft OAuth, stored in the MCP auth token.
// Graph API calls use client credentials, not the user's token.
export type Props = {
	email: string;
	name: string;
};
