/**
 * Pure tool helpers – no I/O, no DAO. Extracted for testability.
 */

import type { ToolResult } from "@/app-constants";

/** Format message with campaign context. */
export function formatMessageWithCampaign(
	message: string,
	campaignName: string | null | undefined
): string {
	if (!campaignName) {
		return message;
	}
	return `${message} for campaign "${campaignName}"`;
}

/** Extract username from JWT payload. Returns empty string on parse failure. */
export function extractUsernameFromJwt(jwt: string | null | undefined): string {
	if (!jwt) return "";

	try {
		const parts = jwt.split(".");
		if (parts.length !== 3) return "";

		let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
		const pad = base64.length % 4;
		if (pad) base64 += "=".repeat(4 - pad);

		const payload = JSON.parse(atob(base64));
		return payload.username || "";
	} catch {
		return "";
	}
}

/** Create authenticated headers for API requests. */
export function createAuthHeaders(jwt?: string | null): Record<string, string> {
	return {
		"Content-Type": "application/json",
		...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
	};
}

/** Standard error response for tool execution. */
export function createToolError(
	message: string,
	error: unknown,
	code: number,
	toolCallId: string,
	_campaignId?: string | null,
	campaignName?: string | null
): ToolResult {
	const formattedMessage = campaignName
		? formatMessageWithCampaign(message, campaignName)
		: message;

	return {
		toolCallId,
		result: {
			success: false,
			message: formattedMessage,
			data: {
				error: error instanceof Error ? error.message : String(error),
				errorCode: code,
				...(campaignName ? { campaignName } : {}),
			},
		},
	};
}

/** Standard success response for tool execution. */
export function createToolSuccess(
	message: string,
	data: unknown,
	toolCallId: string,
	_campaignId?: string | null,
	campaignName?: string | null
): ToolResult {
	const formattedMessage = campaignName
		? formatMessageWithCampaign(message, campaignName)
		: message;

	const dataObj =
		typeof data === "object" && data !== null && !Array.isArray(data)
			? (data as Record<string, unknown>)
			: { data };

	return {
		toolCallId,
		result: {
			success: true,
			message: formattedMessage,
			data: {
				...dataObj,
				...(campaignName ? { campaignName } : {}),
			},
		},
	};
}
