/**
 * Player-facing recap emails (issue #745).
 *
 * Composition, not generation: a session digest is reduced to its player-safe
 * subset, rendered into an editable markdown draft, reviewed and edited by the
 * GM, and only then sent. There is deliberately no code path from
 * "digest created" to "email delivered" that skips the GM.
 */

import type { D1Database } from "@cloudflare/workers-types";
import type { PlayerRecapDAO } from "@/dao/player-recap-dao";
import {
	flagPotentialSpoilers,
	isPlayerSafeRecapEmpty,
	type SpoilerFlag,
	toPlayerSafeRecap,
} from "@/lib/player-recap/player-safe-digest";
import {
	buildRecapDraft,
	renderRecapEmailHtml,
	renderRecapEmailText,
} from "@/lib/player-recap/recap-email-template";
import { EmailService } from "@/services/core/email-service";
import type {
	CampaignRecapSettings,
	PlayerRecapEmail,
	PlayerRecapRecipient,
	PlayerRecapSendResult,
	PlayerSafeRecap,
	UpdatePlayerRecapEmailInput,
} from "@/types/player-recap";
import type { SessionDigestWithData } from "@/types/session-digest";

export class RecapNotEnabledError extends Error {
	constructor() {
		super("Player recaps are not enabled for this campaign");
		this.name = "RecapNotEnabledError";
	}
}

export class RecapNotEditableError extends Error {
	constructor(status: string) {
		super(`Recap cannot be edited because its status is "${status}"`);
		this.name = "RecapNotEditableError";
	}
}

export class RecapAlreadySentError extends Error {
	constructor() {
		super("This recap has already been sent");
		this.name = "RecapAlreadySentError";
	}
}

export class RecapEmptyError extends Error {
	constructor() {
		super(
			"This digest has no player-safe content to send. Add key events or open threads to the digest first."
		);
		this.name = "RecapEmptyError";
	}
}

export class RecapNoRecipientsError extends Error {
	constructor() {
		super(
			"No players on this campaign have a verified email address and an active recap subscription"
		);
		this.name = "RecapNoRecipientsError";
	}
}

export interface PlayerRecapServiceDeps {
	db: D1Database;
	dao: PlayerRecapDAO;
	/** Origin used to build unsubscribe links, e.g. https://loresmith.ai */
	appOrigin: string;
	/** Absent when RESEND_API_KEY is unset; sending then fails loudly. */
	resendApiKey?: string;
	fromAddress: string;
}

export interface RecapDraftResult {
	recap: PlayerRecapEmail;
	safeRecap: PlayerSafeRecap;
	/** Advisory: lines that read like GM-only knowledge. Nothing is removed. */
	spoilerFlags: SpoilerFlag[];
}

export class PlayerRecapService {
	private readonly dao: PlayerRecapDAO;
	private readonly appOrigin: string;
	private readonly resendApiKey?: string;
	private readonly fromAddress: string;

	constructor(deps: PlayerRecapServiceDeps) {
		this.dao = deps.dao;
		this.appOrigin = deps.appOrigin.replace(/\/$/, "");
		this.resendApiKey = deps.resendApiKey;
		this.fromAddress = deps.fromAddress;
	}

	// --- Settings -----------------------------------------------------------

	getSettings(campaignId: string): Promise<CampaignRecapSettings> {
		return this.dao.getSettings(campaignId);
	}

	setSettings(
		campaignId: string,
		enabled: boolean
	): Promise<CampaignRecapSettings> {
		return this.dao.setSettings(campaignId, enabled);
	}

	// --- Drafting -----------------------------------------------------------

	/**
	 * Build (or rebuild) the draft recap for a digest.
	 *
	 * Regenerating replaces an existing *draft* only. A sent recap is immutable,
	 * so the caller gets `RecapAlreadySentError` rather than a second draft that
	 * could be sent again.
	 */
	async generateDraft(params: {
		campaignId: string;
		campaignName: string;
		digest: SessionDigestWithData;
		createdBy: string;
		nextSessionDate?: string | null;
	}): Promise<RecapDraftResult> {
		const { campaignId, campaignName, digest, createdBy } = params;

		const settings = await this.dao.getSettings(campaignId);
		if (!settings.enabled) {
			throw new RecapNotEnabledError();
		}

		const existing = await this.dao.getRecapByDigestId(digest.id);
		if (existing && existing.status === "sent") {
			throw new RecapAlreadySentError();
		}

		const safeRecap = toPlayerSafeRecap(digest.digestData);
		if (isPlayerSafeRecapEmpty(safeRecap)) {
			throw new RecapEmptyError();
		}

		const nextSessionDate =
			params.nextSessionDate ?? existing?.nextSessionDate ?? null;

		const draft = buildRecapDraft({
			campaignName,
			sessionNumber: digest.sessionNumber,
			recap: safeRecap,
			nextSessionDate,
		});

		await this.dao.deleteDraftForDigest(digest.id);

		const recap = await this.dao.createRecap({
			id: crypto.randomUUID(),
			campaignId,
			digestId: digest.id,
			sessionNumber: digest.sessionNumber,
			subject: draft.subject,
			bodyMarkdown: draft.bodyMarkdown,
			nextSessionDate,
			createdBy,
		});

		return {
			recap,
			safeRecap,
			spoilerFlags: flagPotentialSpoilers(safeRecap),
		};
	}

	getRecap(recapId: string): Promise<PlayerRecapEmail | null> {
		return this.dao.getRecapById(recapId);
	}

	getRecapForDigest(digestId: string): Promise<PlayerRecapEmail | null> {
		return this.dao.getRecapByDigestId(digestId);
	}

	listRecaps(campaignId: string): Promise<PlayerRecapEmail[]> {
		return this.dao.listRecapsByCampaign(campaignId);
	}

	/** Apply the GM's edits. Only drafts are editable. */
	async updateDraft(
		recapId: string,
		input: UpdatePlayerRecapEmailInput
	): Promise<PlayerRecapEmail> {
		const existing = await this.dao.getRecapById(recapId);
		if (!existing) {
			throw new Error("Recap not found");
		}
		if (existing.status !== "draft") {
			throw new RecapNotEditableError(existing.status);
		}

		const changed = await this.dao.updateDraft(recapId, input);
		if (changed === 0) {
			// The row moved out of 'draft' between the read and the write.
			throw new RecapNotEditableError("sent");
		}

		const updated = await this.dao.getRecapById(recapId);
		if (!updated) {
			throw new Error("Failed to retrieve updated recap");
		}
		return updated;
	}

	// --- Recipients ---------------------------------------------------------

	/**
	 * Who would receive this recap, and why anyone is excluded.
	 *
	 * Shown in the review UI before send so the GM sees the exact audience.
	 * Unverified addresses are excluded: an unverified address has not been
	 * confirmed to belong to the person who typed it, so mailing it is both a
	 * consent problem and a deliverability one.
	 */
	async getRecipients(campaignId: string): Promise<PlayerRecapRecipient[]> {
		const members = await this.dao.listPlayerMembers(campaignId);

		return members.map((member) => {
			if (!member.email) {
				return {
					username: member.username,
					email: null,
					eligible: false,
					reason: "no_email" as const,
				};
			}
			if (!member.email_verified_at) {
				return {
					username: member.username,
					email: member.email,
					eligible: false,
					reason: "email_unverified" as const,
				};
			}
			if (member.unsubscribed_at) {
				return {
					username: member.username,
					email: member.email,
					eligible: false,
					reason: "unsubscribed" as const,
				};
			}
			return {
				username: member.username,
				email: member.email,
				eligible: true,
				reason: "ok" as const,
			};
		});
	}

	// --- Sending ------------------------------------------------------------

	/**
	 * Send a reviewed draft to the campaign's eligible players.
	 *
	 * The draft is claimed atomically before the first email goes out, so a
	 * double-click or a retried request cannot mail the party twice.
	 */
	async send(params: {
		campaignId: string;
		campaignName: string;
		recapId: string;
		sentBy: string;
		/** GM's address, so player replies reach a human. */
		replyTo?: string;
	}): Promise<PlayerRecapSendResult> {
		const { campaignId, campaignName, recapId, sentBy } = params;

		const settings = await this.dao.getSettings(campaignId);
		if (!settings.enabled) {
			throw new RecapNotEnabledError();
		}

		const recap = await this.dao.getRecapById(recapId);
		if (!recap) {
			throw new Error("Recap not found");
		}
		if (recap.status === "sent") {
			throw new RecapAlreadySentError();
		}
		if (!this.resendApiKey) {
			throw new Error(
				"Email delivery is not configured (RESEND_API_KEY unset)"
			);
		}

		const recipients = await this.getRecipients(campaignId);
		const eligible = recipients.filter((r) => r.eligible && r.email);
		if (eligible.length === 0) {
			throw new RecapNoRecipientsError();
		}

		// Claim before sending: from here on, no other request can send this recap.
		const claimed = await this.dao.claimForSend(recapId, sentBy);
		if (!claimed) {
			throw new RecapAlreadySentError();
		}

		const emailService = new EmailService(this.resendApiKey);
		let sent = 0;
		let failed = 0;

		for (const recipient of eligible) {
			const email = recipient.email as string;
			const token = await this.dao.ensureUnsubscribeToken(
				campaignId,
				recipient.username,
				crypto.randomUUID()
			);
			const unsubscribeUrl = `${this.appOrigin}/recap-unsubscribe/${encodeURIComponent(token)}`;

			const renderParams = {
				campaignName,
				bodyMarkdown: recap.bodyMarkdown,
				unsubscribeUrl,
				appUrl: this.appOrigin,
			};

			let result: { ok: boolean; error?: string };
			try {
				result = await emailService.sendPlayerRecapEmail({
					to: email,
					subject: recap.subject,
					html: renderRecapEmailHtml(renderParams),
					text: renderRecapEmailText(renderParams),
					fromAddress: this.fromAddress,
					replyTo: params.replyTo,
					unsubscribeUrl,
				});
			} catch (error) {
				result = {
					ok: false,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}

			if (result.ok) {
				sent++;
			} else {
				failed++;
			}

			await this.dao.recordDelivery({
				id: crypto.randomUUID(),
				recapId,
				username: recipient.username,
				email,
				status: result.ok ? "sent" : "failed",
				error: result.ok ? null : (result.error ?? "Unknown error"),
			});
		}

		// Only a total failure is retryable. A partial success stays 'sent' so a
		// retry cannot re-mail the players who already received it.
		if (sent === 0) {
			await this.dao.markSendFailed(recapId);
		}

		const finalRecap = await this.dao.getRecapById(recapId);
		return {
			recap: finalRecap ?? recap,
			sent,
			failed,
			skipped: recipients.length - eligible.length,
			deliveries: await this.dao.listDeliveries(recapId),
		};
	}

	/** Move a fully failed send back to draft so the GM can retry. */
	async retryFailed(recapId: string): Promise<PlayerRecapEmail> {
		const changed = await this.dao.resetToDraft(recapId);
		if (changed === 0) {
			throw new RecapNotEditableError("not failed");
		}
		const recap = await this.dao.getRecapById(recapId);
		if (!recap) throw new Error("Recap not found");
		return recap;
	}

	// --- Unsubscribe --------------------------------------------------------

	unsubscribe(
		token: string
	): Promise<{ campaignId: string; username: string } | null> {
		return this.dao.unsubscribeByToken(token);
	}
}
