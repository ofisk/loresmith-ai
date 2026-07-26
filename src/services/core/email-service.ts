/**
 * Email service for transactional email via Resend.
 * Used for verification links; requires RESEND_API_KEY and optionally VERIFICATION_EMAIL_FROM in env.
 */

import { Resend } from "resend";

export interface SendVerificationEmailParams {
	to: string;
	verificationLink: string;
	fromAddress: string;
}

export interface EmailServiceResult {
	ok: boolean;
	error?: string;
}

export class EmailService {
	constructor(private apiKey: string) {}

	async sendVerificationEmail(
		params: SendVerificationEmailParams
	): Promise<EmailServiceResult> {
		const resend = new Resend(this.apiKey);

		const { error } = await resend.emails.send({
			from: params.fromAddress,
			to: [params.to],
			subject: "Verify your LoreSmith account",
			html: `
      <p>Thanks for signing up. Please verify your email by clicking the link below:</p>
      <p><a href="${params.verificationLink}">${params.verificationLink}</a></p>
      <p>This link expires in 24 hours. If you didn't create an account, you can ignore this email.</p>
    `,
		});

		if (error) {
			return {
				ok: false,
				error: typeof error === "string" ? error : JSON.stringify(error),
			};
		}

		return { ok: true };
	}

	/**
	 * Send one player-facing session recap.
	 *
	 * Unlike the transactional mail above, this is bulk-ish and player-directed,
	 * so it carries `List-Unsubscribe` headers. Gmail and Outlook surface those
	 * as a native one-click unsubscribe, which keeps recipients out of the
	 * "mark as spam" path and protects the sending domain's reputation.
	 */
	async sendPlayerRecapEmail(params: {
		to: string;
		subject: string;
		html: string;
		text: string;
		fromAddress: string;
		replyTo?: string;
		unsubscribeUrl: string;
	}): Promise<EmailServiceResult> {
		const resend = new Resend(this.apiKey);

		const { error } = await resend.emails.send({
			from: params.fromAddress,
			to: [params.to],
			replyTo: params.replyTo ? [params.replyTo] : undefined,
			subject: params.subject,
			html: params.html,
			text: params.text,
			headers: {
				"List-Unsubscribe": `<${params.unsubscribeUrl}>`,
				"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
			},
		});

		if (error) {
			return {
				ok: false,
				error: typeof error === "string" ? error : JSON.stringify(error),
			};
		}

		return { ok: true };
	}

	async sendSupportEmail(params: {
		subject: string;
		body: string;
		userEmail?: string;
		fromAddress: string;
	}): Promise<EmailServiceResult> {
		const resend = new Resend(this.apiKey);

		const replyTo = params.userEmail ? [params.userEmail] : undefined;
		const bodyWithReply = params.userEmail
			? `${params.body}\n\n---\nSubmitted by: ${params.userEmail}`
			: params.body;

		const { error } = await resend.emails.send({
			from: params.fromAddress,
			to: ["support@loresmith.ai"],
			replyTo,
			subject: params.subject,
			text: bodyWithReply,
		});

		if (error) {
			return {
				ok: false,
				error: typeof error === "string" ? error : JSON.stringify(error),
			};
		}

		return { ok: true };
	}
}
