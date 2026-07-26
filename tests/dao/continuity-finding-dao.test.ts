import { beforeEach, describe, expect, it } from "vitest";
import { ContinuityFindingDAO } from "@/dao/continuity-finding-dao";
import type { ContinuityFindingRecord } from "@/types/continuity";
import { createMockD1, createMockStmt, type MockStmt } from "./helpers";

function record(
	overrides: Partial<ContinuityFindingRecord> = {}
): ContinuityFindingRecord {
	return {
		id: "finding-1",
		campaign_id: "camp-1",
		fingerprint: "state_contradiction:abc123",
		finding_type: "state_contradiction",
		confidence: "high",
		question:
			"Session 12 recorded Vane's death; session 19 references him. Intentional?",
		detail: "Check whether the death was faked.",
		evidence: JSON.stringify([
			{
				source: "world_state_changelog",
				label: "Session 12 world state",
				referenceId: "cl-12",
				sessionNumber: 12,
				excerpt: 'Vane recorded as "dead".',
			},
		]),
		subject_entity_id: "camp-1_vane",
		subject_name: "Vane",
		status: "open",
		resolution_note: null,
		resolved_by: null,
		resolved_at: null,
		scan_id: "scan-1",
		detected_at: "2025-01-01T00:00:00Z",
		updated_at: "2025-01-01T00:00:00Z",
		...overrides,
	};
}

describe("ContinuityFindingDAO", () => {
	let stmt: MockStmt;
	let dao: ContinuityFindingDAO;

	beforeEach(() => {
		stmt = createMockStmt();
		dao = new ContinuityFindingDAO(createMockD1(stmt));
	});

	it("reports true when a new finding is written", async () => {
		stmt.run.mockResolvedValue({ meta: { changes: 1 } });

		const created = await dao.createFinding({
			id: "finding-1",
			campaignId: "camp-1",
			fingerprint: "state_contradiction:abc123",
			findingType: "state_contradiction",
			confidence: "high",
			question: "Intentional?",
			evidence: [],
		});

		expect(created).toBe(true);
		expect(stmt.bind).toHaveBeenCalled();
	});

	it("reports false when the fingerprint already exists", async () => {
		// INSERT OR IGNORE reports zero changes — this is how a dismissed
		// finding is prevented from resurfacing on a later scan.
		stmt.run.mockResolvedValue({ meta: { changes: 0 } });

		const created = await dao.createFinding({
			id: "finding-2",
			campaignId: "camp-1",
			fingerprint: "state_contradiction:abc123",
			findingType: "state_contradiction",
			confidence: "high",
			question: "Intentional?",
			evidence: [],
		});

		expect(created).toBe(false);
	});

	it("uses INSERT OR IGNORE so a duplicate never overwrites a resolution", async () => {
		const db = createMockD1(stmt);
		stmt.run.mockResolvedValue({ meta: { changes: 1 } });
		await new ContinuityFindingDAO(db).createFinding({
			id: "finding-1",
			campaignId: "camp-1",
			fingerprint: "fp",
			findingType: "dangling_thread",
			confidence: "medium",
			question: "Still live?",
			evidence: [],
		});

		const sql = (db.prepare as unknown as { mock: { calls: string[][] } }).mock
			.calls[0][0];
		expect(sql).toContain("INSERT OR IGNORE INTO continuity_findings");
	});

	it("parses evidence JSON when mapping a row", async () => {
		stmt.first.mockResolvedValue(record());

		const finding = await dao.getFindingById("finding-1");

		expect(finding?.evidence).toHaveLength(1);
		expect(finding?.evidence[0].label).toBe("Session 12 world state");
		expect(finding?.subjectName).toBe("Vane");
	});

	it("survives malformed evidence JSON rather than throwing", async () => {
		stmt.first.mockResolvedValue(record({ evidence: "not json" }));

		const finding = await dao.getFindingById("finding-1");

		expect(finding?.evidence).toEqual([]);
	});

	it("returns known fingerprints as a set for cheap scan-time filtering", async () => {
		stmt.all.mockResolvedValue({
			results: [{ fingerprint: "fp-1" }, { fingerprint: "fp-2" }],
		});

		const fingerprints = await dao.getKnownFingerprints("camp-1");

		expect(fingerprints.has("fp-1")).toBe(true);
		expect(fingerprints.size).toBe(2);
	});

	it("orders findings by confidence so high-confidence questions surface first", async () => {
		const db = createMockD1(stmt);
		stmt.all.mockResolvedValue({ results: [] });

		await new ContinuityFindingDAO(db).listFindingsForCampaign("camp-1", {
			status: "open",
		});

		const sql = (db.prepare as unknown as { mock: { calls: string[][] } }).mock
			.calls[0][0];
		expect(sql).toContain("CASE confidence WHEN 'high' THEN 0");
	});

	it("records the scan watermark without ever moving it backwards", async () => {
		const db = createMockD1(stmt);

		await new ContinuityFindingDAO(db).recordScan({
			campaignId: "camp-1",
			scanId: "scan-2",
			mode: "incremental",
			lastScannedSession: 14,
		});

		const sql = (db.prepare as unknown as { mock: { calls: string[][] } }).mock
			.calls[0][0];
		expect(sql).toContain("ON CONFLICT(campaign_id) DO UPDATE");
		expect(sql).toContain("MAX(");
	});
});
