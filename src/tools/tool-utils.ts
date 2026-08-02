/**
 * Pure tool helpers – no I/O, no DAO. Extracted for testability.
 */

import type { ToolResult } from "@/app-constants";
import {
	containsImplementationDetail,
	sanitizeUserFacingText,
} from "@/lib/user-facing-language";

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

/**
 * Standard error response for tool execution.
 *
 * The whole `result` is handed to the chat model, so both the message and the
 * error detail are redacted when they name infrastructure (see
 * {@link sanitizeUserFacingText}). The originals go to the log, not the model.
 */
export function createToolError(
	message: string,
	error: unknown,
	code: number,
	toolCallId: string,
	_campaignId?: string | null,
	campaignName?: string | null
): ToolResult {
	const rawDetail = error instanceof Error ? error.message : String(error);

	if (
		containsImplementationDetail(message) ||
		containsImplementationDetail(rawDetail)
	) {
		console.error("[tool-error] redacted from chat:", {
			toolCallId,
			code,
			message,
			detail: rawDetail,
		});
	}

	// A redacted message is a complete sentence; appending `for campaign "X"` to
	// it reads as a fragment, so the suffix is only added to messages we kept.
	const safeMessage = sanitizeUserFacingText(message);
	const wasRedacted = safeMessage !== message;
	const formattedMessage =
		campaignName && !wasRedacted
			? formatMessageWithCampaign(safeMessage, campaignName)
			: safeMessage;

	return {
		toolCallId,
		result: {
			success: false,
			message: formattedMessage,
			data: {
				error: sanitizeUserFacingText(rawDetail),
				errorCode: code,
				...(campaignName ? { campaignName } : {}),
			},
		},
	};
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
	return typeof x === "object" && x !== null && !Array.isArray(x);
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

	const dataObj = isPlainObject(data) ? data : { data };

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
