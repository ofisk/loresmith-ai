import type { D1Database } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDAOFactory } from "@/dao/dao-factory";
import type { ContinuityAdjudicationService } from "@/services/continuity/continuity-adjudication-service";
import { ContinuityCheckerService } from "@/services/continuity/continuity-checker-service";
import { loadContinuityCorpus } from "@/services/continuity/continuity-corpus";
import type {
	ContinuityCandidate,
	ContinuityFinding,
} from "@/types/continuity";

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: vi.fn(),
}));

vi.mock("@/services/continuity/continuity-corpus", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@/services/continuity/continuity-corpus")
		>();
	return { ...actual, loadContinuityCorpus: vi.fn() };
});

vi.mock("@/services/graph/world-state-changelog-service", () => ({
	WorldStateChangelogService: class {
		async recordChangelog() {
			return { id: "changelog-entry-1" };
		}
	},
}));

const CAMPAIGN_ID = "camp-1";
const DB = {} as D1Database;

function emptyCorpus(maxSessionNumber: number | null = 12) {
	return {
		campaignId: CAMPAIGN_ID,
		digests: [],
		changelog: [],
		entityNames: new Map<string, string>(),
		neighbors: new Map<string, Set<string>>(),
		maxSessionNumber,
	};
}

function candidate(
	overrides: Partial<ContinuityCandidate> = {}
): ContinuityCandidate {
	return {
		fingerprint: "state_contradiction:abc123",
		type: "state_contradiction",
		subjectEntityId: `${CAMPAIGN_ID}_vane`,
		subjectName: "Vane",
		question: "Session 12 recorded Vane's death; session 19 references him.",
		rationale: "Vane was marked dead and never restored.",
		evidence: [
			{
				source: "world_state_changelog",
				label: "Session 12 world state",
				referenceId: "cl-12",
				sessionNumber: 12,
				excerpt: 'Vane recorded as "dead".',
			},
			{
				source: "session_digest",
				label: "Session 19 digest",
				referenceId: "digest-19",
				sessionNumber: 19,
				excerpt: "Vane, still scheming",
			},
		],
		earlierSession: 12,
		laterSession: 19,
		...overrides,
	};
}

function finding(
	overrides: Partial<ContinuityFinding> = {}
): ContinuityFinding {
	return {
		id: "finding-1",
		campaignId: CAMPAIGN_ID,
		fingerprint: "state_contradiction:abc123",
		findingType: "state_contradiction",
		confidence: "high",
		question: "Intentional?",
		detail: null,
		evidence: [],
		subjectEntityId: `${CAMPAIGN_ID}_vane`,
		subjectName: "Vane",
		status: "open",
		resolutionNote: null,
		resolvedBy: null,
		resolvedAt: null,
		scanId: "scan-1",
		detectedAt: "2025-01-01T00:00:00Z",
		updatedAt: "2025-01-01T00:00:00Z",
		...overrides,
	};
}

describe("ContinuityCheckerService", () => {
	let dao: {
		getScanState: ReturnType<typeof vi.fn>;
		getKnownFingerprints: ReturnType<typeof vi.fn>;
		createFinding: ReturnType<typeof vi.fn>;
		getFindingById: ReturnType<typeof vi.fn>;
		updateFindingStatus: ReturnType<typeof vi.fn>;
		recordScan: ReturnType<typeof vi.fn>;
	};
	let adjudication: {
		triage: ReturnType<typeof vi.fn>;
		adjudicate: ReturnType<typeof vi.fn>;
	};

	function buildService() {
		return new ContinuityCheckerService({
			db: DB,
			env: {},
			adjudicationService:
				adjudication as unknown as ContinuityAdjudicationService,
		});
	}

	beforeEach(() => {
		vi.clearAllMocks();
		dao = {
			getScanState: vi.fn(async () => null),
			getKnownFingerprints: vi.fn(async () => new Set<string>()),
			createFinding: vi.fn(async () => true),
			getFindingById: vi.fn(async () => finding()),
			updateFindingStatus: vi.fn(async () => undefined),
			recordScan: vi.fn(async () => undefined),
		};
		vi.mocked(getDAOFactory).mockReturnValue({
			continuityFindingDAO: dao,
			// The rules detector runs by default and reads rules through entityDAO.
			entityDAO: { listEntitiesByCampaign: vi.fn(async () => []) },
		} as never);
		vi.mocked(loadContinuityCorpus).mockResolvedValue(emptyCorpus() as never);
		adjudication = {
			triage: vi.fn(async (items: ContinuityCandidate[]) => items),
			adjudicate: vi.fn(async (items: ContinuityCandidate[]) =>
				items.map((item) => ({
					candidate: item,
					confidence: "high" as const,
					question: item.question,
					detail: "Check the session 12 recap.",
				}))
			),
		};
	});

	it("records the scan watermark so the next incremental run is bounded", async () => {
		const result = await buildService().scan(CAMPAIGN_ID);

		expect(result.mode).toBe("incremental");
		expect(dao.recordScan).toHaveBeenCalledWith({
			campaignId: CAMPAIGN_ID,
			scanId: result.scanId,
			mode: "incremental",
			lastScannedSession: 12,
		});
	});

	it("scans from the session after the watermark on an incremental run", async () => {
		dao.getScanState.mockResolvedValue({
			campaignId: CAMPAIGN_ID,
			lastScannedSession: 8,
			lastScanId: "scan-0",
			lastScanMode: "incremental",
			lastScanAt: "2025-01-01T00:00:00Z",
		});

		const result = await buildService().scan(CAMPAIGN_ID);

		expect(result.scannedFromSession).toBe(9);
	});

	it("ignores the watermark on a full scan", async () => {
		dao.getScanState.mockResolvedValue({
			campaignId: CAMPAIGN_ID,
			lastScannedSession: 8,
			lastScanId: "scan-0",
			lastScanMode: "incremental",
			lastScanAt: "2025-01-01T00:00:00Z",
		});

		const result = await buildService().scan(CAMPAIGN_ID, { mode: "full" });

		expect(result.scannedFromSession).toBeNull();
	});

	it("never re-reviews a fingerprint already on record", async () => {
		vi.mocked(loadContinuityCorpus).mockResolvedValue({
			...emptyCorpus(),
			entityNames: new Map([[`${CAMPAIGN_ID}_vane`, "Vane"]]),
			changelog: [
				{
					id: "cl-12",
					sessionNumber: 12,
					timestamp: "2025-01-12T00:00:00Z",
					payload: {
						campaign_session_id: 12,
						timestamp: "2025-01-12T00:00:00Z",
						entity_updates: [
							{ entity_id: `${CAMPAIGN_ID}_vane`, status: "dead" },
						],
						relationship_updates: [],
						new_entities: [],
					},
				},
			],
			digests: [
				{
					id: "digest-19",
					sessionNumber: 19,
					sessionDate: null,
					createdAt: "2025-01-19T00:00:00Z",
					data: {} as never,
					blocks: [{ field: "npcs_to_run", text: "Vane, still scheming" }],
				},
			],
		} as never);

		const generated = await buildService().scan(CAMPAIGN_ID);
		expect(generated.candidatesGenerated).toBe(1);

		// Re-run with the fingerprint the first pass produced marked as known —
		// this is the mechanism that keeps a dismissed finding dismissed.
		const firstFingerprint =
			adjudication.triage.mock.calls[0][0][0].fingerprint;
		dao.getKnownFingerprints.mockResolvedValue(new Set([firstFingerprint]));
		adjudication.triage.mockClear();

		const rerun = await buildService().scan(CAMPAIGN_ID, { mode: "full" });

		expect(rerun.candidatesAlreadyKnown).toBe(1);
		expect(rerun.candidatesTriaged).toBe(0);
		expect(adjudication.triage).not.toHaveBeenCalled();
	});

	it("drops findings below the requested confidence floor", async () => {
		adjudication.adjudicate.mockResolvedValue([
			{
				candidate: candidate(),
				confidence: "low",
				question: "Maybe?",
				detail: null,
			},
		]);
		adjudication.triage.mockResolvedValue([candidate()]);

		const result = await buildService().scan(CAMPAIGN_ID, {
			minConfidence: "high",
		});

		expect(dao.createFinding).not.toHaveBeenCalled();
		expect(result.findingsCreated).toBe(0);
	});

	it("warns and produces nothing when no provider key is configured", async () => {
		const service = new ContinuityCheckerService({ db: DB, env: {} });
		vi.mocked(loadContinuityCorpus).mockResolvedValue({
			...emptyCorpus(),
			entityNames: new Map([[`${CAMPAIGN_ID}_vane`, "Vane"]]),
			changelog: [
				{
					id: "cl-12",
					sessionNumber: 12,
					timestamp: "2025-01-12T00:00:00Z",
					payload: {
						campaign_session_id: 12,
						timestamp: "2025-01-12T00:00:00Z",
						entity_updates: [
							{ entity_id: `${CAMPAIGN_ID}_vane`, status: "dead" },
						],
						relationship_updates: [],
						new_entities: [],
					},
				},
			],
			digests: [
				{
					id: "digest-19",
					sessionNumber: 19,
					sessionDate: null,
					createdAt: "2025-01-19T00:00:00Z",
					data: {} as never,
					blocks: [{ field: "npcs_to_run", text: "Vane, still scheming" }],
				},
			],
		} as never);

		const result = await service.scan(CAMPAIGN_ID);

		expect(result.findingsCreated).toBe(0);
		expect(result.warnings.join(" ")).toContain("No LLM provider API key");
	});

	describe("resolveFinding", () => {
		it("marks a dismissed finding so it can never resurface", async () => {
			dao.getFindingById.mockResolvedValue(finding());

			await buildService().resolveFinding(CAMPAIGN_ID, "finding-1", {
				action: "dismiss",
				note: "Vane faked his death on purpose.",
				resolvedBy: "gm@example.com",
			});

			expect(dao.updateFindingStatus).toHaveBeenCalledWith(
				"finding-1",
				"dismissed",
				{
					resolutionNote: "Vane faked his death on purpose.",
					resolvedBy: "gm@example.com",
				}
			);
		});

		it("writes a correction back to world state", async () => {
			dao.getFindingById.mockResolvedValue(finding());

			const result = await buildService().resolveFinding(
				CAMPAIGN_ID,
				"finding-1",
				{
					action: "correct",
					correction: { status: "alive", campaignSessionId: 19 },
				}
			);

			expect(result.changelogEntryId).toBe("changelog-entry-1");
			expect(dao.updateFindingStatus).toHaveBeenCalledWith(
				"finding-1",
				"corrected",
				expect.anything()
			);
		});

		it("refuses a correction with no corrected status", async () => {
			dao.getFindingById.mockResolvedValue(finding());

			await expect(
				buildService().resolveFinding(CAMPAIGN_ID, "finding-1", {
					action: "correct",
				})
			).rejects.toThrow(/requires an entity id and a corrected status/);
		});

		it("rejects a finding belonging to another campaign", async () => {
			dao.getFindingById.mockResolvedValue(
				finding({ campaignId: "other-campaign" })
			);

			await expect(
				buildService().resolveFinding(CAMPAIGN_ID, "finding-1", {
					action: "confirm",
				})
			).rejects.toThrow(/not found/i);
		});
	});
});
