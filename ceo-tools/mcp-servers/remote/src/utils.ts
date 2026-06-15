// Context from Microsoft OAuth, encrypted & stored in the MCP auth token,
// and provided to CeoToolsMCP as this.props
export type Props = {
	email: string;
	name: string;
	accessToken: string;
	refreshToken: string;
	tokenExpiresAt: number; // Unix timestamp in ms
};
