import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import { MicrosoftHandler } from "./microsoft-handler";
import type { Props } from "./utils";

// ─── Shared helpers ──────────────────────────────────────────────────────────

function ok(data: Record<string, unknown>) {
	return { status: "ok", ...data };
}

function jsonResponse(payload: unknown) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
	};
}

// Convert a column index (0-based) to Excel column letter (A, B, ..., Z, AA, ...)
function colIndexToLetter(index: number): string {
	let letter = "";
	let n = index + 1;
	while (n > 0) {
		const rem = (n - 1) % 26;
		letter = String.fromCharCode(65 + rem) + letter;
		n = Math.floor((n - 1) / 26);
	}
	return letter;
}

// ─── MCP Agent ───────────────────────────────────────────────────────────────

export class CeoToolsMCP extends McpAgent<Env, Record<string, never>, Props> {
	server = new McpServer({ name: "sp-ark-ceo-tools", version: "0.1.0" });

	// Cached refreshed token (DO instance memory)
	private cachedToken: string | null = null;
	private cachedTokenExpiresAt = 0;

	async init() {
		const env = this.env;

		// ── Microsoft Graph token management ─────────────────────────────────

		const getMsToken = async (): Promise<string> => {
			// Use DO-cached refreshed token if still valid
			if (this.cachedToken && Date.now() < this.cachedTokenExpiresAt) {
				return this.cachedToken;
			}
			// Use original props token if still valid
			if (this.props?.accessToken && Date.now() < (this.props.tokenExpiresAt || 0)) {
				this.cachedToken = this.props.accessToken;
				this.cachedTokenExpiresAt = this.props.tokenExpiresAt;
				return this.cachedToken;
			}
			// Refresh using the refresh token from props
			if (!this.props?.refreshToken) {
				throw new Error("Microsoft session expired. Please reconnect the MCP server.");
			}
			const params = new URLSearchParams({
				grant_type: "refresh_token",
				client_id: env.MS_CLIENT_ID,
				client_secret: env.MS_CLIENT_SECRET,
				refresh_token: this.props.refreshToken,
				scope: "offline_access Files.ReadWrite Sites.Read.All Mail.ReadWrite Mail.Send",
			});
			const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: params.toString(),
			});
			const body: any = await res.json().catch(() => ({}));
			if (!res.ok || !body.access_token) {
				throw new Error(`Token refresh failed: ${JSON.stringify(body)}`);
			}
			this.cachedToken = body.access_token;
			this.cachedTokenExpiresAt = Date.now() + ((body.expires_in ?? 3600) - 60) * 1000;
			return this.cachedToken as string;
		};

		const graphRequest = async (path: string, options: RequestInit = {}) => {
			const token = await getMsToken();
			const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
				...options,
				headers: {
					accept: "application/json",
					"content-type": "application/json",
					authorization: `Bearer ${token}`,
					...(options.headers || {}),
				},
			});
			const text = await response.text();
			let body: any = {};
			if (text) {
				try { body = JSON.parse(text); } catch { body = { raw: text }; }
			}
			if (!response.ok) {
				throw new Error(JSON.stringify({ status: response.status, statusText: response.statusText, body }));
			}
			return body;
		};

		// ── Excel / SharePoint tools ──────────────────────────────────────────

		this.server.tool(
			"search_sharepoint_files",
			"Search for Excel files across SharePoint and OneDrive. Returns drive_id and item_id needed for all Excel operations.",
			{
				query: z.string().min(1).describe("Filename or keyword to search for"),
				file_extension: z.enum(["xlsx", "xls", "csv"]).optional().default("xlsx"),
			},
			async ({ query, file_extension = "xlsx" }) => {
				const searchQuery = `${query} filetype:${file_extension}`;
				const result = await graphRequest("/search/query", {
					method: "POST",
					body: JSON.stringify({
						requests: [{
							entityTypes: ["driveItem"],
							query: { queryString: searchQuery },
							fields: ["id", "name", "webUrl", "parentReference", "lastModifiedDateTime", "size"],
						}],
					}),
				});
				const hits = result.value?.[0]?.hitsContainers?.[0]?.hits || [];
				const files = hits.map((hit: any) => ({
					name: hit.resource?.name,
					item_id: hit.resource?.id,
					drive_id: hit.resource?.parentReference?.driveId,
					web_url: hit.resource?.webUrl,
					last_modified: hit.resource?.lastModifiedDateTime,
					size_bytes: hit.resource?.size,
				}));
				return jsonResponse(ok({ files, total: files.length }));
			}
		);

		this.server.tool(
			"list_excel_worksheets",
			"List all worksheets in an Excel file. Run search_sharepoint_files first to get drive_id and item_id.",
			{
				drive_id: z.string().min(1),
				item_id: z.string().min(1),
			},
			async ({ drive_id, item_id }) => {
				const result = await graphRequest(
					`/drives/${drive_id}/items/${item_id}/workbook/worksheets`
				);
				const sheets = (result.value || []).map((s: any) => ({
					id: s.id,
					name: s.name,
					position: s.position,
					visibility: s.visibility,
				}));
				return jsonResponse(ok({ worksheets: sheets }));
			}
		);

		this.server.tool(
			"get_excel_rows",
			"Read rows from an Excel worksheet. Returns cell values as a 2D array. Omit range to read the entire used range.",
			{
				drive_id: z.string().min(1),
				item_id: z.string().min(1),
				sheet: z.string().min(1).describe("Worksheet name"),
				range: z.string().optional().describe("Cell range like 'A1:D20'. Omit to read all used data."),
			},
			async ({ drive_id, item_id, sheet, range }) => {
				const encodedSheet = encodeURIComponent(sheet);
				const endpoint = range
					? `/drives/${drive_id}/items/${item_id}/workbook/worksheets/${encodedSheet}/range(address='${range}')`
					: `/drives/${drive_id}/items/${item_id}/workbook/worksheets/${encodedSheet}/usedRange`;
				const result = await graphRequest(endpoint);
				return jsonResponse(ok({
					address: result.address,
					values: result.values,
					row_count: result.values?.length ?? 0,
					column_count: result.values?.[0]?.length ?? 0,
				}));
			}
		);

		this.server.tool(
			"append_excel_rows",
			"Append new rows to the bottom of existing data in an Excel worksheet. Automatically detects the next empty row.",
			{
				drive_id: z.string().min(1),
				item_id: z.string().min(1),
				sheet: z.string().min(1).describe("Worksheet name"),
				rows: z
					.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
					.min(1)
					.describe("Array of rows to append. Each row is an array of cell values in column order."),
				start_column: z.string().default("A").optional().describe("Column letter to start writing from. Default: A"),
			},
			async ({ drive_id, item_id, sheet, rows, start_column = "A" }) => {
				const encodedSheet = encodeURIComponent(sheet);

				// Find the last used row (empty sheet is handled gracefully)
				let lastRow = 0;
				try {
					const usedRange = await graphRequest(
						`/drives/${drive_id}/items/${item_id}/workbook/worksheets/${encodedSheet}/usedRange`
					);
					lastRow = usedRange.values?.length ?? 0;
				} catch {
					lastRow = 0;
				}

				const nextRow = lastRow + 1;
				const startColIndex = start_column.toUpperCase().charCodeAt(0) - 65;
				const endColIndex = startColIndex + rows[0].length - 1;
				const endCol = colIndexToLetter(endColIndex);
				const endRow = nextRow + rows.length - 1;
				const address = `${start_column.toUpperCase()}${nextRow}:${endCol}${endRow}`;

				const result = await graphRequest(
					`/drives/${drive_id}/items/${item_id}/workbook/worksheets/${encodedSheet}/range(address='${address}')`,
					{ method: "PATCH", body: JSON.stringify({ values: rows }) }
				);
				return jsonResponse(ok({
					rows_appended: rows.length,
					range_written: result.address,
					next_empty_row: endRow + 1,
				}));
			}
		);

		this.server.tool(
			"update_excel_cell",
			"Update a specific cell or range in an Excel worksheet with new values.",
			{
				drive_id: z.string().min(1),
				item_id: z.string().min(1),
				sheet: z.string().min(1),
				address: z.string().min(1).describe("Cell address like 'A1' or range like 'A1:C3'"),
				values: z
					.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
					.describe("2D array of values matching the range size. For a single cell use [[value]]."),
			},
			async ({ drive_id, item_id, sheet, address, values }) => {
				const encodedSheet = encodeURIComponent(sheet);
				const result = await graphRequest(
					`/drives/${drive_id}/items/${item_id}/workbook/worksheets/${encodedSheet}/range(address='${address}')`,
					{ method: "PATCH", body: JSON.stringify({ values }) }
				);
				return jsonResponse(ok({
					updated: true,
					range: result.address,
				}));
			}
		);

		// ── Outlook tools ─────────────────────────────────────────────────────

		this.server.tool(
			"list_emails",
			"List recent emails from a mailbox folder.",
			{
				folder: z
					.enum(["inbox", "sentitems", "drafts", "deleteditems"])
					.default("inbox")
					.optional()
					.describe("Mailbox folder. Default: inbox"),
				limit: z.number().int().positive().max(50).default(20).optional(),
				unread_only: z.boolean().default(false).optional(),
			},
			async ({ folder = "inbox", limit = 20, unread_only = false }) => {
				let url = `/me/mailFolders/${folder}/messages?$top=${limit}&$orderby=receivedDateTime desc&$select=id,subject,from,toRecipients,receivedDateTime,isRead,hasAttachments,bodyPreview`;
				if (unread_only) url += "&$filter=isRead eq false";
				const result = await graphRequest(url);
				const messages = (result.value || []).map((m: any) => ({
					id: m.id,
					subject: m.subject,
					from: m.from?.emailAddress,
					to: m.toRecipients?.map((r: any) => r.emailAddress),
					received: m.receivedDateTime,
					is_read: m.isRead,
					has_attachments: m.hasAttachments,
					preview: m.bodyPreview,
				}));
				return jsonResponse(ok({ messages, count: messages.length }));
			}
		);

		this.server.tool(
			"search_emails",
			"Search emails across all mailbox folders by keyword, sender, subject, or date.",
			{
				query: z.string().min(1).describe("Search query. Supports 'from:email', 'subject:text', date ranges, or plain keywords."),
				limit: z.number().int().positive().max(50).default(20).optional(),
			},
			async ({ query, limit = 20 }) => {
				const result = await graphRequest(
					`/me/messages?$search="${encodeURIComponent(query)}"&$top=${limit}&$select=id,subject,from,toRecipients,receivedDateTime,isRead,bodyPreview`
				);
				const messages = (result.value || []).map((m: any) => ({
					id: m.id,
					subject: m.subject,
					from: m.from?.emailAddress,
					to: m.toRecipients?.map((r: any) => r.emailAddress),
					received: m.receivedDateTime,
					is_read: m.isRead,
					preview: m.bodyPreview,
				}));
				return jsonResponse(ok({ messages, count: messages.length }));
			}
		);

		this.server.tool(
			"read_email",
			"Read the full content of a single email by its ID.",
			{
				message_id: z.string().min(1),
			},
			async ({ message_id }) => {
				const m = await graphRequest(
					`/me/messages/${message_id}?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,body,hasAttachments,conversationId`
				);
				return jsonResponse(ok({
					id: m.id,
					conversation_id: m.conversationId,
					subject: m.subject,
					from: m.from?.emailAddress,
					to: m.toRecipients?.map((r: any) => r.emailAddress),
					cc: m.ccRecipients?.map((r: any) => r.emailAddress),
					received: m.receivedDateTime,
					has_attachments: m.hasAttachments,
					body_type: m.body?.contentType,
					body: m.body?.content,
				}));
			}
		);

		this.server.tool(
			"create_email_draft",
			"Create a draft email in Outlook. Does not send — Becca reviews and sends manually from Outlook.",
			{
				to: z.string().email(),
				to_name: z.string().optional(),
				subject: z.string().min(1),
				body_html: z.string().min(1).describe("Email body as HTML"),
				cc: z.array(z.string().email()).optional(),
			},
			async ({ to, to_name, subject, body_html, cc }) => {
				const message: Record<string, unknown> = {
					subject,
					body: { contentType: "HTML", content: body_html },
					toRecipients: [{ emailAddress: { address: to, ...(to_name ? { name: to_name } : {}) } }],
				};
				if (cc?.length) {
					message.ccRecipients = cc.map((addr) => ({ emailAddress: { address: addr } }));
				}
				const result = await graphRequest("/me/messages", {
					method: "POST",
					body: JSON.stringify(message),
				});
				return jsonResponse(ok({
					draft_created: true,
					message_id: result.id,
					subject: result.subject,
					web_link: result.webLink || null,
				}));
			}
		);

		this.server.tool(
			"send_email",
			"Send an email immediately from Becca's Outlook account. Use create_email_draft if she wants to review first.",
			{
				to: z.string().email(),
				to_name: z.string().optional(),
				subject: z.string().min(1),
				body_html: z.string().min(1).describe("Email body as HTML"),
				cc: z.array(z.string().email()).optional(),
			},
			async ({ to, to_name, subject, body_html, cc }) => {
				const message: Record<string, unknown> = {
					subject,
					body: { contentType: "HTML", content: body_html },
					toRecipients: [{ emailAddress: { address: to, ...(to_name ? { name: to_name } : {}) } }],
				};
				if (cc?.length) {
					message.ccRecipients = cc.map((addr) => ({ emailAddress: { address: addr } }));
				}
				await graphRequest("/me/sendMail", {
					method: "POST",
					body: JSON.stringify({ message, saveToSentItems: true }),
				});
				return jsonResponse(ok({ sent: true, to, subject }));
			}
		);

		this.server.tool(
			"reply_to_email",
			"Reply to an existing email thread.",
			{
				message_id: z.string().min(1),
				body_html: z.string().min(1).describe("Reply body as HTML"),
				reply_all: z.boolean().default(false).optional().describe("Reply to all recipients. Default: false"),
			},
			async ({ message_id, body_html, reply_all = false }) => {
				const endpoint = reply_all
					? `/me/messages/${message_id}/replyAll`
					: `/me/messages/${message_id}/reply`;
				await graphRequest(endpoint, {
					method: "POST",
					body: JSON.stringify({
						message: { body: { contentType: "HTML", content: body_html } },
					}),
				});
				return jsonResponse(ok({ replied: true, reply_all }));
			}
		);
	}
}

// ─── OAuth-wrapped Worker entry ──────────────────────────────────────────────
// Microsoft OAuth gates the /mcp endpoint. The authenticated user's Microsoft
// tokens are stored in this.props and used for delegated Graph API calls.

export default new OAuthProvider({
	apiHandler: CeoToolsMCP.serve("/mcp") as any,
	apiRoute: "/mcp",
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: MicrosoftHandler as any,
	tokenEndpoint: "/token",
});
