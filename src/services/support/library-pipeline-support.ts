import { getEnvVar } from "@/lib/env-utils";
import type { Env } from "@/middleware/auth";
import { EmailService } from "@/services/core/email-service";

/**
 * One-shot internal email when library entity discovery hits terminal failure.
 */
export async function notifyLibraryDiscoveryTerminalFailure(
	env: Env,
	input: {
		fileKey: string;
		username: string;
		error: string;
		retryCount: number;
	}
): Promise<void> {
	const resendKey = await getEnvVar(env, "RESEND_API_KEY", false);
	if (!resendKey?.trim()) {
		return;
	}
	const fromAddress =
		(await getEnvVar(env, "VERIFICATION_EMAIL_FROM", false)) ||
		"LoreSmith <noreply@loresmith.ai>";
	const email = new EmailService(resendKey.trim());
	await email.sendSupportEmail({
		subject: `[Auto] Library entity discovery failed: ${input.fileKey}`,
		body: `Terminal failure after ${input.retryCount} attempts.

File: ${input.fileKey}
User: ${input.username}

${input.error}`,
		fromAddress,
	});
}
