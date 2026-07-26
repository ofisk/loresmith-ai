import {
	type CampaignRecapSettings,
	type CreatePlayerRecapEmailInput,
	mapPlayerRecapEmailRow,
	type PlayerRecapDelivery,
	type PlayerRecapDeliveryStatus,
	type PlayerRecapEmail,
	type PlayerRecapEmailRow,
	type UpdatePlayerRecapEmailInput,
} from "@/types/player-recap";
import type { SqlParam } from "@/types/utils";
import { BaseDAOClass } from "./base-dao";

interface DeliveryRow {
	id: string;
	recap_id: string;
	username: string;
	email: string;
	status: PlayerRecapDeliveryStatus;
	error: string | null;
	created_at: string;
}

/** A campaign member who may receive recaps, joined to their account email. */
export interface RecapMemberRow {
	username: string;
	email: string | null;
	email_verified_at: string | null;
	unsubscribed_at: string | null;
}

export class PlayerRecapDAO extends BaseDAOClass {
	// --- Settings -----------------------------------------------------------

	/** Recaps are opt-in: a missing row means disabled. */
	async getSettings(campaignId: string): Promise<CampaignRecapSettings> {
		const row = await this.queryFirst<{ enabled: number }>(
			"SELECT enabled FROM campaign_recap_settings WHERE campaign_id = ?",
			[campaignId]
		);
		return { campaignId, enabled: row?.enabled === 1 };
	}

	async setSettings(
		campaignId: string,
		enabled: boolean
	): Promise<CampaignRecapSettings> {
		await this.execute(
			`INSERT INTO campaign_recap_settings (campaign_id, enabled, created_at, updated_at)
       VALUES (?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(campaign_id) DO UPDATE SET
         enabled = excluded.enabled,
         updated_at = datetime('now')`,
			[campaignId, enabled ? 1 : 0]
		);
		return { campaignId, enabled };
	}

	// --- Recap drafts -------------------------------------------------------

	async createRecap(
		input: CreatePlayerRecapEmailInput
	): Promise<PlayerRecapEmail> {
		await this.execute(
			`INSERT INTO campaign_recap_emails (
         id, campaign_id, digest_id, session_number, subject, body_markdown,
         next_session_date, status, created_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, datetime('now'), datetime('now'))`,
			[
				input.id,
				input.campaignId,
				input.digestId,
				input.sessionNumber,
				input.subject,
				input.bodyMarkdown,
				input.nextSessionDate,
				input.createdBy,
			]
		);
		const created = await this.getRecapById(input.id);
		if (!created) {
			throw new Error("Failed to retrieve created recap email");
		}
		return created;
	}

	async getRecapById(recapId: string): Promise<PlayerRecapEmail | null> {
		const row = await this.queryFirst<PlayerRecapEmailRow>(
			"SELECT * FROM campaign_recap_emails WHERE id = ?",
			[recapId]
		);
		return row ? mapPlayerRecapEmailRow(row) : null;
	}

	async getRecapByDigestId(digestId: string): Promise<PlayerRecapEmail | null> {
		const row = await this.queryFirst<PlayerRecapEmailRow>(
			"SELECT * FROM campaign_recap_emails WHERE digest_id = ?",
			[digestId]
		);
		return row ? mapPlayerRecapEmailRow(row) : null;
	}

	async listRecapsByCampaign(campaignId: string): Promise<PlayerRecapEmail[]> {
		const rows = await this.queryAll<PlayerRecapEmailRow>(
			`SELECT * FROM campaign_recap_emails
       WHERE campaign_id = ?
       ORDER BY session_number DESC, created_at DESC`,
			[campaignId]
		);
		return rows.map(mapPlayerRecapEmailRow);
	}

	/** Replace an unsent draft for a digest (regenerate). Sent recaps are immutable. */
	async deleteDraftForDigest(digestId: string): Promise<void> {
		await this.execute(
			"DELETE FROM campaign_recap_emails WHERE digest_id = ? AND status = 'draft'",
			[digestId]
		);
	}

	/**
	 * Update an editable recap. Guarded on `status = 'draft'` so an edit can
	 * never race a send and change what is already going out.
	 */
	async updateDraft(
		recapId: string,
		input: UpdatePlayerRecapEmailInput
	): Promise<number> {
		const sets: string[] = [];
		const params: SqlParam[] = [];

		if (input.subject !== undefined) {
			sets.push("subject = ?");
			params.push(input.subject);
		}
		if (input.bodyMarkdown !== undefined) {
			sets.push("body_markdown = ?");
			params.push(input.bodyMarkdown);
		}
		if (input.nextSessionDate !== undefined) {
			sets.push("next_session_date = ?");
			params.push(input.nextSessionDate);
		}
		if (sets.length === 0) return 0;

		sets.push("updated_at = datetime('now')");
		params.push(recapId);

		return this.executeReturningChanges(
			`UPDATE campaign_recap_emails SET ${sets.join(", ")} WHERE id = ? AND status = 'draft'`,
			params
		);
	}

	/**
	 * Atomically claim a draft for sending.
	 *
	 * Returns true only for the caller that flipped `draft -> sent`. Two
	 * concurrent send requests would otherwise both pass a read-then-write check
	 * and mail every player twice, which cannot be undone.
	 */
	async claimForSend(recapId: string, sentBy: string): Promise<boolean> {
		const changes = await this.executeReturningChanges(
			`UPDATE campaign_recap_emails
       SET status = 'sent', sent_by = ?, sent_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? AND status = 'draft'`,
			[sentBy, recapId]
		);
		return changes > 0;
	}

	/** Release a claim when every delivery failed, so the GM can retry. */
	async markSendFailed(recapId: string): Promise<void> {
		await this.execute(
			`UPDATE campaign_recap_emails
       SET status = 'failed', updated_at = datetime('now')
       WHERE id = ?`,
			[recapId]
		);
	}

	/** Move a failed recap back to draft so the GM can review and retry. */
	async resetToDraft(recapId: string): Promise<number> {
		return this.executeReturningChanges(
			`UPDATE campaign_recap_emails
       SET status = 'draft', sent_by = NULL, sent_at = NULL, updated_at = datetime('now')
       WHERE id = ? AND status = 'failed'`,
			[recapId]
		);
	}

	// --- Deliveries ---------------------------------------------------------

	async recordDelivery(delivery: {
		id: string;
		recapId: string;
		username: string;
		email: string;
		status: PlayerRecapDeliveryStatus;
		error: string | null;
	}): Promise<void> {
		await this.execute(
			`INSERT INTO campaign_recap_deliveries (id, recap_id, username, email, status, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
			[
				delivery.id,
				delivery.recapId,
				delivery.username,
				delivery.email,
				delivery.status,
				delivery.error,
			]
		);
	}

	async listDeliveries(recapId: string): Promise<PlayerRecapDelivery[]> {
		const rows = await this.queryAll<DeliveryRow>(
			"SELECT * FROM campaign_recap_deliveries WHERE recap_id = ? ORDER BY created_at ASC",
			[recapId]
		);
		return rows.map((row) => ({
			id: row.id,
			recapId: row.recap_id,
			username: row.username,
			email: row.email,
			status: row.status,
			error: row.error,
			createdAt: row.created_at,
		}));
	}

	// --- Recipients and subscriptions ---------------------------------------

	/**
	 * Player-role members of a campaign with their account email and
	 * unsubscribe state.
	 *
	 * GM-role members are excluded: a recap is written *for* players, and the GM
	 * already saw the session. The campaign owner is excluded for the same
	 * reason (and is not in `campaign_members` at all).
	 */
	async listPlayerMembers(campaignId: string): Promise<RecapMemberRow[]> {
		if (!(await this.hasTable("campaign_members"))) return [];

		return this.queryAll<RecapMemberRow>(
			`SELECT
         cm.username           AS username,
         u.email               AS email,
         u.email_verified_at   AS email_verified_at,
         crs.unsubscribed_at   AS unsubscribed_at
       FROM campaign_members cm
       LEFT JOIN users u ON u.username = cm.username
       LEFT JOIN campaign_recap_subscriptions crs
         ON crs.campaign_id = cm.campaign_id AND crs.username = cm.username
       WHERE cm.campaign_id = ?
         AND cm.role IN ('editor_player', 'readonly_player')
       ORDER BY cm.username ASC`,
			[campaignId]
		);
	}

	/**
	 * Get or create the player's stable unsubscribe token for a campaign.
	 *
	 * Stable so that unsubscribe links in previously sent emails keep working.
	 */
	async ensureUnsubscribeToken(
		campaignId: string,
		username: string,
		token: string
	): Promise<string> {
		await this.execute(
			`INSERT INTO campaign_recap_subscriptions (campaign_id, username, unsubscribe_token, created_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(campaign_id, username) DO NOTHING`,
			[campaignId, username, token]
		);
		const row = await this.queryFirst<{ unsubscribe_token: string }>(
			`SELECT unsubscribe_token FROM campaign_recap_subscriptions
       WHERE campaign_id = ? AND username = ?`,
			[campaignId, username]
		);
		return row?.unsubscribe_token ?? token;
	}

	/** Unsubscribe by token. Returns the campaign the token belonged to, or null. */
	async unsubscribeByToken(
		token: string
	): Promise<{ campaignId: string; username: string } | null> {
		const row = await this.queryFirst<{
			campaign_id: string;
			username: string;
		}>(
			`SELECT campaign_id, username FROM campaign_recap_subscriptions WHERE unsubscribe_token = ?`,
			[token]
		);
		if (!row) return null;

		await this.execute(
			`UPDATE campaign_recap_subscriptions
       SET unsubscribed_at = datetime('now')
       WHERE unsubscribe_token = ?`,
			[token]
		);
		return { campaignId: row.campaign_id, username: row.username };
	}
}
