import type {
	CreateRunsheetInput,
	RunsheetData,
	RunsheetRecord,
	RunsheetSummary,
	RunsheetWithData,
	UpdateRunsheetInput,
} from "@/types/runsheet";
import { validateRunsheetData } from "@/types/runsheet";
import type { SqlParam } from "@/types/utils";
import { BaseDAOClass } from "./base-dao";

const FULL_COLUMNS = `
      id,
      campaign_id,
      session_number,
      title,
      runsheet_data,
      generated_at,
      created_at,
      updated_at
`;

/** Listing never needs the snapshot body, which can be tens of KB per row. */
const SUMMARY_COLUMNS = `
      id,
      campaign_id,
      session_number,
      title,
      generated_at,
      created_at,
      updated_at
`;

export class RunsheetDAO extends BaseDAOClass {
	async createRunsheet(id: string, input: CreateRunsheetInput): Promise<void> {
		let runsheetDataJson: string;
		try {
			runsheetDataJson = JSON.stringify(input.runsheetData);
		} catch (error) {
			throw new Error(
				`Failed to serialize runsheet data: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}

		const sql = `
      INSERT INTO campaign_runsheets (
        id,
        campaign_id,
        session_number,
        title,
        runsheet_data,
        generated_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;

		await this.execute(sql, [
			id,
			input.campaignId,
			input.sessionNumber,
			input.title,
			runsheetDataJson,
		]);
	}

	async getRunsheetById(runsheetId: string): Promise<RunsheetWithData | null> {
		const sql = `
      SELECT ${FULL_COLUMNS}
      FROM campaign_runsheets
      WHERE id = ?
    `;

		const record = await this.queryFirst<RunsheetRecord>(sql, [runsheetId]);
		return record ? this.mapRecord(record) : null;
	}

	/** Newest session first, then newest snapshot first within a session. */
	async listRunsheetsByCampaign(
		campaignId: string,
		options: { sessionNumber?: number; limit?: number } = {}
	): Promise<RunsheetSummary[]> {
		const conditions = ["campaign_id = ?"];
		const params: SqlParam[] = [campaignId];

		if (typeof options.sessionNumber === "number") {
			conditions.push("session_number = ?");
			params.push(options.sessionNumber);
		}

		let sql = `
      SELECT ${SUMMARY_COLUMNS}
      FROM campaign_runsheets
      WHERE ${conditions.join(" AND ")}
      ORDER BY session_number DESC, generated_at DESC
    `;

		if (typeof options.limit === "number") {
			sql += " LIMIT ?";
			params.push(options.limit);
		}

		const records = await this.queryAll<Omit<RunsheetRecord, "runsheet_data">>(
			sql,
			params
		);

		return records.map((record) => ({
			id: record.id,
			campaignId: record.campaign_id,
			sessionNumber: record.session_number,
			title: record.title,
			generatedAt: record.generated_at,
			createdAt: record.created_at,
			updatedAt: record.updated_at,
		}));
	}

	async updateRunsheet(
		runsheetId: string,
		input: UpdateRunsheetInput
	): Promise<void> {
		const updates: string[] = [];
		const params: SqlParam[] = [];

		if (input.title !== undefined) {
			updates.push("title = ?");
			params.push(input.title);
		}

		if (input.runsheetData !== undefined) {
			updates.push("runsheet_data = ?");
			params.push(JSON.stringify(input.runsheetData));
		}

		if (updates.length === 0) {
			return;
		}

		updates.push("updated_at = CURRENT_TIMESTAMP");
		params.push(runsheetId);

		const sql = `
      UPDATE campaign_runsheets
      SET ${updates.join(", ")}
      WHERE id = ?
    `;

		await this.execute(sql, params);
	}

	async deleteRunsheet(runsheetId: string): Promise<void> {
		await this.execute("DELETE FROM campaign_runsheets WHERE id = ?", [
			runsheetId,
		]);
	}

	/**
	 * A runsheet whose stored JSON no longer parses is a corrupt snapshot, not an
	 * empty one. Surfacing that as an error beats silently handing the GM a blank
	 * page at the table — unlike a digest, there is no form to re-fill it from.
	 */
	private mapRecord(record: RunsheetRecord): RunsheetWithData {
		let parsed: unknown;
		try {
			parsed = JSON.parse(record.runsheet_data);
		} catch (error) {
			throw new Error(
				`Runsheet ${record.id} has unparseable snapshot data: ${
					error instanceof Error ? error.message : "Unknown error"
				}`
			);
		}

		if (!validateRunsheetData(parsed)) {
			throw new Error(
				`Runsheet ${record.id} has an invalid snapshot structure`
			);
		}

		const runsheetData: RunsheetData = parsed;

		return {
			id: record.id,
			campaignId: record.campaign_id,
			sessionNumber: record.session_number,
			title: record.title,
			runsheetData,
			generatedAt: record.generated_at,
			createdAt: record.created_at,
			updatedAt: record.updated_at,
		};
	}
}
