import { type ToolExecutionOptions, tool } from "ai";
import { z } from "zod";
import { getEnvVar } from "@/lib/env-utils";
import { EmailService } from "@/services/core/email-service";
import { extractUsernameFromJwt } from "../utils";

const submitSupportRequestSchema = z.object({
	subject: z
		.string()
		.describe(
			"A short, clear subject line summarizing the support issue (e.g., 'Entity extraction failing for PDF upload')"
		),
	body: z
		.string()
		.describe(
			"The support request body with context from the conversation: what the user was trying to do, what went wrong, and any relevant details"
		),
	userConfirmed: z
		.boolean()
		.describe(
			"MUST be true. Only call this tool after the user has explicitly confirmed they want to submit (e.g., said 'yes', 'please do', 'go ahead', 'submit it')"
		),
	jwt: z.string().nullable().optional().describe("JWT for user attribution"),
});

const SUPPORT_EMAIL = "support@loresmith.ai";

/**
 * Tool for submitting a support request to support@loresmith.ai.
 * The agent MUST ask for user confirmation before calling this tool.
 */
export const submitSupportRequestTool = tool({
	description: `Submit a support request to ${SUPPORT_EMAIL} based on the conversation context.

**CRITICAL - Confirmation required**: You MUST ask the user for confirmation before calling this tool. Present a draft of the support request (subject and summary) and ask "Would you like me to submit this support request to our team?" Only call this tool when the user explicitly confirms (e.g., "yes", "please do", "go ahead", "submit it"). Set userConfirmed to true only when the user has confirmed.

Use this when:
- The user asks to submit a support issue, contact support, or report a problem
- The user describes an issue and wants it escalated to the support team
- The user asks you to "email support" or "send this to support"

Include relevant context from the conversation in the subject and body (what they were doing, what went wrong, error messages if any).`,
	inputSchema: submitSupportRequestSchema,
	execute: async (
		input: z.infer<typeof submitSupportRequestSchema>,
		options?: ToolExecutionOptions & { env?: unknown }
	): Promise<any> => {
		const toolCallId = options?.toolCallId ?? "unknown";

		if (!input.userConfirmed) {
			return {
				toolCallId,
				result: {
					success: false,
					message:
						"Support request not submitted. You must ask the user for confirmation first. Present the draft subject and summary, then ask 'Would you like me to submit this support request?' Only call this tool again with userConfirmed: true after the user confirms.",
					data: null,
				},
			};
		}

		const env = options?.env as Record<string, unknown> | undefined;
		if (!env) {
			return {
				toolCallId,
				result: {
					success: false,
					message: "Support request failed: environment not available.",
					data: null,
				},
			};
		}

		const resendKey = await getEnvVar(env, "RESEND_API_KEY", false);
		if (!resendKey?.trim()) {
			return {
				toolCallId,
				result: {
					success: false,
					message:
						"Support email is not configured. Please contact support directly at support@loresmith.ai.",
					data: null,
				},
			};
		}

		const fromAddress =
			(await getEnvVar(env, "VERIFICATION_EMAIL_FROM", false)) ||
			"LoreSmith <noreply@loresmith.ai>";

		const username = input.jwt ? extractUsernameFromJwt(input.jwt) : "";
		const bodyWithAttribution = username
			? `${input.body}\n\n---\nSubmitted by user: ${username}`
			: input.body;

		const emailService = new EmailService(resendKey.trim());
		const result = await emailService.sendSupportEmail({
			subject: input.subject,
			body: bodyWithAttribution,
			fromAddress,
		});

		if (!result.ok) {
			return {
				toolCallId,
				result: {
					success: false,
					message: `Failed to send support request: ${result.error}`,
					data: null,
				},
			};
		}

		return {
			toolCallId,
			result: {
				success: true,
				message: `Support request submitted successfully to ${SUPPORT_EMAIL}. Our team will review it and respond.`,
				data: { submittedTo: SUPPORT_EMAIL },
			},
		};
	},
});
