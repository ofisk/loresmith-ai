import type {
	AudioKind,
	AudioSourceKind,
	AudioStatus,
	CampaignAudioRecord,
	CompleteCampaignAudioInput,
	CreateCampaignAudioInput,
	UpdateCampaignAudioInput,
} from "@/types/campaign-audio";
import type { SqlParam } from "@/types/utils";
import { BaseDAOClass } from "./base-dao";

interface CampaignAudioRow {
	id: string;
	campaign_id: string;
	kind: string;
	title: string;
	description: string | null;
	prompt: string;
	r2_key: string | null;
	content_type: string | null;
	duration_sec: number | null;
	size_bytes: number | null;
	provider: string | null;
	model: string | null;
	status: string;
	error_message: string | null;
	loopable: number;
	source_kind: string | null;
	source_id: string | null;
	source_label: string | null;
	created_by: string;
	created_at: string;
	updated_at: string;
}

const COLUMNS = `
      id,
      campaign_id,
      kind,
      title,
      description,
      prompt,
      r2_key,
      content_type,
      duration_sec,
      size_bytes,
      provider,
      model,
      status,
      error_message,
      loopable,
      source_kind,
      source_id,
      source_label,
      created_by,
      created_at,
      updated_at
`;

function toRecord(row: CampaignAudioRow): CampaignAudioRecord {
	return {
		id: row.id,
		campaignId: row.campaign_id,
		kind: row.kind as AudioKind,
		title: row.title,
		description: row.description,
		prompt: row.prompt,
		r2Key: row.r2_key,
		contentType: row.content_type,
		durationSec: row.duration_sec,
		sizeBytes: row.size_bytes,
		provider: row.provider,
		model: row.model,
		status: row.status as AudioStatus,
		errorMessage: row.error_message,
		loopable: row.loopable === 1,
		source: row.source_kind
			? {
					kind: row.source_kind as AudioSourceKind,
					id: row.source_id,
					label: row.source_label,
				}
			: null,
		createdBy: row.created_by,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export interface ListCampaignAudioOptions {
	kind?: AudioKind;
	status?: AudioStatus;
	sourceKind?: string;
	sourceId?: string;
	limit?: number;
}

export class CampaignAudioDAO extends BaseDAOClass {
	/**
	 * Write the row before generation starts, in `pending`.
	 *
	 * Recording intent up front is what makes async generation observable: a track
	 * that is still rendering, or one whose provider call died, is a visible row
	 * the GM can see and retry rather than a request that vanished.
	 */
	async createAudio(
		id: string,
		input: CreateCampaignAudioInput
	): Promise<void> {
		const sql = `
      INSERT INTO campaign_audio (
        id,
        campaign_id,
        kind,
        title,
        description,
        prompt,
        status,
        loopable,
        source_kind,
        source_id,
        source_label,
        created_by,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;

		await this.execute(sql, [
			id,
			input.campaignId,
			input.kind,
			input.title,
			input.description ?? null,
			input.prompt,
			input.loopable ? 1 : 0,
			input.source?.kind ?? null,
			input.source?.id ?? null,
			input.source?.label ?? null,
			input.createdBy,
		]);
	}

	/** Mark a track ready and attach its R2 key and provider metadata. */
	async completeAudio(
		id: string,
		input: CompleteCampaignAudioInput
	): Promise<void> {
		const sql = `
      UPDATE campaign_audio
      SET status = 'ready',
          r2_key = ?,
          content_type = ?,
          duration_sec = ?,
          size_bytes = ?,
          provider = ?,
          model = ?,
          error_message = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

		await this.execute(sql, [
			input.r2Key,
			input.contentType,
			input.durationSec,
			input.sizeBytes,
			input.provider,
			input.model,
			id,
		]);
	}

	async failAudio(id: string, errorMessage: string): Promise<void> {
		const sql = `
      UPDATE campaign_audio
      SET status = 'failed',
          error_message = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
		await this.execute(sql, [errorMessage.slice(0, 500), id]);
	}

	async getAudioById(id: string): Promise<CampaignAudioRecord | null> {
		const rows = await this.queryAll<CampaignAudioRow>(
			`SELECT ${COLUMNS} FROM campaign_audio WHERE id = ? LIMIT 1`,
			[id]
		);
		return rows.length > 0 ? toRecord(rows[0]) : null;
	}

	async listAudioForCampaign(
		campaignId: string,
		options: ListCampaignAudioOptions = {}
	): Promise<CampaignAudioRecord[]> {
		const conditions = ["campaign_id = ?"];
		const params: SqlParam[] = [campaignId];

		if (options.kind) {
			conditions.push("kind = ?");
			params.push(options.kind);
		}
		if (options.status) {
			conditions.push("status = ?");
			params.push(options.status);
		}
		if (options.sourceKind) {
			conditions.push("source_kind = ?");
			params.push(options.sourceKind);
		}
		if (options.sourceId) {
			conditions.push("source_id = ?");
			params.push(options.sourceId);
		}

		const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);

		const rows = await this.queryAll<CampaignAudioRow>(
			`SELECT ${COLUMNS}
         FROM campaign_audio
        WHERE ${conditions.join(" AND ")}
        ORDER BY created_at DESC
        LIMIT ${limit}`,
			params
		);

		return rows.map(toRecord);
	}

	async updateAudio(
		id: string,
		input: UpdateCampaignAudioInput
	): Promise<void> {
		const sets: string[] = [];
		const params: SqlParam[] = [];

		if (input.title !== undefined) {
			sets.push("title = ?");
			params.push(input.title);
		}
		if (input.description !== undefined) {
			sets.push("description = ?");
			params.push(input.description);
		}
		if (input.loopable !== undefined) {
			sets.push("loopable = ?");
			params.push(input.loopable ? 1 : 0);
		}

		if (sets.length === 0) return;

		sets.push("updated_at = CURRENT_TIMESTAMP");
		params.push(id);

		await this.execute(
			`UPDATE campaign_audio SET ${sets.join(", ")} WHERE id = ?`,
			params
		);
	}

	async deleteAudio(id: string): Promise<void> {
		await this.execute("DELETE FROM campaign_audio WHERE id = ?", [id]);
	}

	/**
	 * Total generated seconds for a campaign in a window, used for spend
	 * reporting. Audio is billed per second of output, so seconds — not row count
	 * — is the meaningful unit.
	 */
	async getGeneratedSecondsSince(
		campaignId: string,
		sinceIso: string
	): Promise<number> {
		const rows = await this.queryAll<{ total: number | null }>(
			`SELECT SUM(duration_sec) AS total
         FROM campaign_audio
        WHERE campaign_id = ?
          AND status = 'ready'
          AND created_at >= ?`,
			[campaignId, sinceIso]
		);
		return rows[0]?.total ?? 0;
	}
}
