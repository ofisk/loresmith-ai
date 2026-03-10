import { BaseDAOClass } from "./base-dao";

export interface SessionPlanReadoutRecord {
	content: string;
	updatedAt: string;
}

export class SessionPlanReadoutDAO extends BaseDAOClass {
	async get(
		campaignId: string,
		nextSessionNumber: number
	): Promise<SessionPlanReadoutRecord | null> {
		const sql = `
			SELECT content, updated_at as updatedAt
			FROM campaign_session_plan_readouts
			WHERE campaign_id = ? AND next_session_number = ?
		`;
		return await this.queryFirst<SessionPlanReadoutRecord>(sql, [
			campaignId,
			nextSessionNumber,
		]);
	}

	async save(
		campaignId: string,
		nextSessionNumber: number,
		content: string
	): Promise<void> {
		const sql = `
			INSERT INTO campaign_session_plan_readouts (campaign_id, next_session_number, content, created_at, updated_at)
			VALUES (?, ?, ?, current_timestamp, current_timestamp)
			ON CONFLICT (campaign_id, next_session_number) DO UPDATE SET
				content = excluded.content,
				updated_at = current_timestamp
		`;
		await this.execute(sql, [campaignId, nextSessionNumber, content]);
	}

	async delete(campaignId: string, nextSessionNumber: number): Promise<void> {
		const sql = `
			DELETE FROM campaign_session_plan_readouts
			WHERE campaign_id = ? AND next_session_number = ?
		`;
		await this.execute(sql, [campaignId, nextSessionNumber]);
	}

	/**
	 * Invalidate all cached session plans for a campaign.
	 * Call when planning tasks change (complete, update, delete) so the next readout regenerates.
	 */
	async invalidateForCampaign(campaignId: string): Promise<void> {
		const sql = `DELETE FROM campaign_session_plan_readouts WHERE campaign_id = ?`;
		await this.execute(sql, [campaignId]);
	}
}
