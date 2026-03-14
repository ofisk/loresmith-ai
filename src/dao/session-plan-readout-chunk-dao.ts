import type { SessionPlanReadoutStep } from "@/lib/prompts/recap-prompts";
import { BaseDAOClass } from "./base-dao";

export class SessionPlanReadoutChunkDAO extends BaseDAOClass {
	async saveChunk(
		campaignId: string,
		nextSessionNumber: number,
		chunkIndex: number,
		steps: SessionPlanReadoutStep[]
	): Promise<void> {
		const sql = `
			INSERT INTO campaign_session_plan_readout_chunks (campaign_id, next_session_number, chunk_index, steps_json)
			VALUES (?, ?, ?, ?)
			ON CONFLICT (campaign_id, next_session_number, chunk_index) DO UPDATE SET
				steps_json = excluded.steps_json,
				created_at = current_timestamp
		`;
		await this.execute(sql, [
			campaignId,
			nextSessionNumber,
			chunkIndex,
			JSON.stringify(steps),
		]);
	}

	async getChunks(
		campaignId: string,
		nextSessionNumber: number
	): Promise<SessionPlanReadoutStep[]> {
		const sql = `
			SELECT steps_json
			FROM campaign_session_plan_readout_chunks
			WHERE campaign_id = ? AND next_session_number = ?
			ORDER BY chunk_index ASC
		`;
		const rows = await this.queryAll<{ steps_json: string }>(sql, [
			campaignId,
			nextSessionNumber,
		]);
		const allSteps: SessionPlanReadoutStep[] = [];
		for (const row of rows) {
			try {
				const steps = JSON.parse(row.steps_json) as SessionPlanReadoutStep[];
				allSteps.push(...steps);
			} catch {
				// Skip malformed chunks
			}
		}
		return allSteps;
	}

	async clearChunks(
		campaignId: string,
		nextSessionNumber: number
	): Promise<void> {
		const sql = `
			DELETE FROM campaign_session_plan_readout_chunks
			WHERE campaign_id = ? AND next_session_number = ?
		`;
		await this.execute(sql, [campaignId, nextSessionNumber]);
	}
}
