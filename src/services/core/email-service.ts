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
}
