import type {
	ContinuityConfidence,
	ContinuityEvidence,
	ContinuityFinding,
	ContinuityFindingRecord,
	ContinuityFindingStatus,
	ContinuityFindingType,
	ContinuityScanMode,
	ContinuityScanState,
	CreateContinuityFindingInput,
} from "@/types/continuity";
import type { SqlParam } from "@/types/utils";
import { BaseDAOClass } from "./base-dao";
import { D1_IN_LIST_CHUNK_SIZE } from "./d1-limits";

export interface ListContinuityFindingsOptions {
	status?: ContinuityFindingStatus | ContinuityFindingStatus[];
	types?: ContinuityFindingType[];
	scanId?: string;
	limit?: number;
	offset?: number;
}

interface ScanStateRecord {
	campaign_id: string;
	last_scanned_session: number | null;
	last_scan_id: string | null;
	last_scan_mode: string | null;
	last_scan_at: string | null;
}

export class ContinuityFindingDAO extends BaseDAOClass {
	/**
	 * Insert a finding, ignoring the row when an identical fingerprint already
	 * exists for the campaign. This is how a dismissed finding stays dismissed:
	 * re-detection produces the same fingerprint and the insert is a no-op.
	 *
	 * @returns true when a new row was written.
	 */
	async createFinding(input: CreateContinuityFindingInput): Promise<boolean> {
		const sql = `
      INSERT OR IGNORE INTO continuity_findings (
        id,
        campaign_id,
        fingerprint,
        finding_type,
        confidence,
        question,
        detail,
        evidence,
        subject_entity_id,
        subject_name,
        status,
        scan_id,
        detected_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;

		const changes = await this.executeReturningChanges(sql, [
			input.id,
			input.campaignId,
			input.fingerprint,
			input.findingType,
			input.confidence,
			input.question,
			input.detail ?? null,
			JSON.stringify(input.evidence),
			input.subjectEntityId ?? null,
			input.subjectName ?? null,
			input.scanId ?? null,
		]);

		return changes > 0;
	}

	async getFindingById(findingId: string): Promise<ContinuityFinding | null> {
		const record = await this.queryFirst<ContinuityFindingRecord>(
			"SELECT * FROM continuity_findings WHERE id = ?",
			[findingId]
		);
		return record ? this.mapRecord(record) : null;
	}

	async listFindingsForCampaign(
		campaignId: string,
		options: ListContinuityFindingsOptions = {}
	): Promise<ContinuityFinding[]> {
		const conditions: string[] = ["campaign_id = ?"];
		const params: SqlParam[] = [campaignId];

		const statuses = options.status
			? Array.isArray(options.status)
				? options.status
				: [options.status]
			: [];
		if (statuses.length > 0) {
			conditions.push(`status IN (${statuses.map(() => "?").join(", ")})`);
			params.push(...statuses);
		}

		if (options.types?.length) {
			conditions.push(
				`finding_type IN (${options.types.map(() => "?").join(", ")})`
			);
			params.push(...options.types);
		}

		if (options.scanId) {
			conditions.push("scan_id = ?");
			params.push(options.scanId);
		}

		let sql = `
      SELECT * FROM continuity_findings
      WHERE ${conditions.join(" AND ")}
      ORDER BY
        CASE confidence WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
        detected_at DESC
    `;

		if (typeof options.limit === "number") {
			sql += " LIMIT ?";
			params.push(options.limit);
		}
		if (typeof options.offset === "number") {
			sql += " OFFSET ?";
			params.push(options.offset);
		}

		const records = await this.queryAll<ContinuityFindingRecord>(sql, params);
		return records.map((record) => this.mapRecord(record));
	}

	/**
	 * Fingerprints already recorded for a campaign, whatever their status.
	 * The scanner subtracts these before spending a single model token.
	 */
	async getKnownFingerprints(campaignId: string): Promise<Set<string>> {
		const records = await this.queryAll<{ fingerprint: string }>(
			"SELECT fingerprint FROM continuity_findings WHERE campaign_id = ?",
			[campaignId]
		);
		return new Set(records.map((record) => record.fingerprint));
	}

	async countOpenFindings(campaignId: string): Promise<number> {
		const record = await this.queryFirst<{ count: number }>(
			"SELECT COUNT(*) as count FROM continuity_findings WHERE campaign_id = ? AND status = 'open'",
			[campaignId]
		);
		return record?.count ?? 0;
	}

	async updateFindingStatus(
		findingId: string,
		status: ContinuityFindingStatus,
		options: { resolutionNote?: string | null; resolvedBy?: string | null } = {}
	): Promise<void> {
		await this.execute(
			`UPDATE continuity_findings
       SET status = ?,
           resolution_note = ?,
           resolved_by = ?,
           resolved_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
			[
				status,
				options.resolutionNote ?? null,
				options.resolvedBy ?? null,
				findingId,
			]
		);
	}

	async deleteFindingsForCampaign(campaignId: string): Promise<void> {
		await this.execute(
			"DELETE FROM continuity_findings WHERE campaign_id = ?",
			[campaignId]
		);
	}

	async deleteFindings(findingIds: string[]): Promise<void> {
		if (!findingIds.length) return;
		for (let i = 0; i < findingIds.length; i += D1_IN_LIST_CHUNK_SIZE) {
			const chunk = findingIds.slice(i, i + D1_IN_LIST_CHUNK_SIZE);
			const placeholders = chunk.map(() => "?").join(", ");
			await this.execute(
				`DELETE FROM continuity_findings WHERE id IN (${placeholders})`,
				chunk
			);
		}
	}

	async getScanState(campaignId: string): Promise<ContinuityScanState | null> {
		const record = await this.queryFirst<ScanStateRecord>(
			"SELECT * FROM continuity_scan_state WHERE campaign_id = ?",
			[campaignId]
		);
		if (!record) return null;
		return {
			campaignId: record.campaign_id,
			lastScannedSession: record.last_scanned_session,
			lastScanId: record.last_scan_id,
			lastScanMode: (record.last_scan_mode as ContinuityScanMode) ?? null,
			lastScanAt: record.last_scan_at,
		};
	}

	async recordScan(input: {
		campaignId: string;
		scanId: string;
		mode: ContinuityScanMode;
		lastScannedSession: number | null;
	}): Promise<void> {
		await this.execute(
			`INSERT INTO continuity_scan_state (
         campaign_id, last_scanned_session, last_scan_id, last_scan_mode, last_scan_at
       ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(campaign_id) DO UPDATE SET
         last_scanned_session = MAX(
           COALESCE(excluded.last_scanned_session, -1),
           COALESCE(continuity_scan_state.last_scanned_session, -1)
         ),
         last_scan_id = excluded.last_scan_id,
         last_scan_mode = excluded.last_scan_mode,
         last_scan_at = CURRENT_TIMESTAMP`,
			[input.campaignId, input.lastScannedSession, input.scanId, input.mode]
		);
	}

	private mapRecord(record: ContinuityFindingRecord): ContinuityFinding {
		let evidence: ContinuityEvidence[] = [];
		try {
			const parsed = JSON.parse(record.evidence);
			if (Array.isArray(parsed)) evidence = parsed as ContinuityEvidence[];
		} catch (_error) {
			evidence = [];
		}

		return {
			id: record.id,
			campaignId: record.campaign_id,
			fingerprint: record.fingerprint,
			findingType: record.finding_type as ContinuityFindingType,
			confidence: record.confidence as ContinuityConfidence,
			question: record.question,
			detail: record.detail,
			evidence,
			subjectEntityId: record.subject_entity_id,
			subjectName: record.subject_name,
			status: record.status as ContinuityFindingStatus,
			resolutionNote: record.resolution_note,
			resolvedBy: record.resolved_by,
			resolvedAt: record.resolved_at,
			scanId: record.scan_id,
			detectedAt: record.detected_at,
			updatedAt: record.updated_at,
		};
	}
}
