/**
 * Player-facing recap email types (issue #745).
 *
 * A recap is always created as a draft, reviewed and edited by the GM, and only
 * then sent. There is no path that mails players without an explicit send.
 */

/** A recap draft is editable; once sent it is immutable. */
export type PlayerRecapStatus = "draft" | "sent" | "failed";

export type PlayerRecapDeliveryStatus = "sent" | "failed";

/**
 * The player-safe subset of a session digest.
 *
 * This is an allowlist: every field here is something that already happened at
 * the table and that the players were present for. Anything forward-looking
 * (next-session plans, encounter seeds, unrevealed clues, prepared loot) has no
 * representation in this shape at all, so it cannot leak by accident when
 * `SessionDigestData` grows new fields.
 */
export interface PlayerSafeRecap {
	/** What happened, from last_session_recap.key_events. */
	whatHappened: string[];
	/** NPCs whose state changed during the session, i.e. ones actually met. */
	notableNpcs: string[];
	/** Locations whose state changed during the session. */
	placesVisited: string[];
	/** Factions whose state changed during the session. */
	factionDevelopments: string[];
	/** Loose ends, from last_session_recap.open_threads. */
	unresolvedThreads: string[];
}

/** Database row for campaign_recap_emails. */
export interface PlayerRecapEmailRow {
	id: string;
	campaign_id: string;
	digest_id: string;
	session_number: number;
	subject: string;
	body_markdown: string;
	next_session_date: string | null;
	status: PlayerRecapStatus;
	created_by: string;
	sent_by: string | null;
	sent_at: string | null;
	created_at: string;
	updated_at: string;
}

/** Mapped recap email for API responses. */
export interface PlayerRecapEmail {
	id: string;
	campaignId: string;
	digestId: string;
	sessionNumber: number;
	subject: string;
	bodyMarkdown: string;
	nextSessionDate: string | null;
	status: PlayerRecapStatus;
	createdBy: string;
	sentBy: string | null;
	sentAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface CreatePlayerRecapEmailInput {
	id: string;
	campaignId: string;
	digestId: string;
	sessionNumber: number;
	subject: string;
	bodyMarkdown: string;
	nextSessionDate: string | null;
	createdBy: string;
}

export interface UpdatePlayerRecapEmailInput {
	subject?: string;
	bodyMarkdown?: string;
	nextSessionDate?: string | null;
}

/**
 * A player eligible to receive a recap, resolved at send time.
 *
 * `eligible` is false when the player has no verified email or has
 * unsubscribed; the reason is surfaced in the review UI so the GM knows exactly
 * who will and will not be mailed before they press send.
 */
export interface PlayerRecapRecipient {
	username: string;
	email: string | null;
	eligible: boolean;
	reason: "ok" | "no_email" | "email_unverified" | "unsubscribed";
}

export interface PlayerRecapDelivery {
	id: string;
	recapId: string;
	username: string;
	email: string;
	status: PlayerRecapDeliveryStatus;
	error: string | null;
	createdAt: string;
}

export interface PlayerRecapSendResult {
	recap: PlayerRecapEmail;
	sent: number;
	failed: number;
	skipped: number;
	deliveries: PlayerRecapDelivery[];
}

export interface CampaignRecapSettings {
	campaignId: string;
	enabled: boolean;
}

export function mapPlayerRecapEmailRow(
	row: PlayerRecapEmailRow
): PlayerRecapEmail {
	return {
		id: row.id,
		campaignId: row.campaign_id,
		digestId: row.digest_id,
		sessionNumber: row.session_number,
		subject: row.subject,
		bodyMarkdown: row.body_markdown,
		nextSessionDate: row.next_session_date,
		status: row.status,
		createdBy: row.created_by,
		sentBy: row.sent_by,
		sentAt: row.sent_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}
