import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDaoFactory = {
	campaignDAO: {
		getCampaignByIdWithMapping: vi.fn(),
		getCampaignRole: vi.fn(),
	},
	continuityFindingDAO: {
		listFindingsForCampaign: vi.fn(),
	},
};

const scanMock = vi.fn();
const resolveFindingMock = vi.fn();

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: vi.fn(() => mockDaoFactory),
}));

vi.mock("@/services/continuity/continuity-checker-service", () => ({
	ContinuityCheckerService: class {
		scan = scanMock;
		resolveFinding = resolveFindingMock;
	},
}));

import type { ToolResult } from "@/app-constants";
import {
	checkCampaignContinuityTool,
	listContinuityFindingsTool,
	resolveContinuityFindingTool,
} from "@/tools/campaign-context/continuity-tools";
import type { ToolExecuteOptions } from "@/tools/utils";
import type { ContinuityFinding } from "@/types/continuity";

const JWT = "x.eyJ1c2VybmFtZSI6Im9maXNrIn0=.y";

function options(env: unknown = { DB: {} }): ToolExecuteOptions {
	return {
		toolCallId: "continuity-1",
		messages: [],
		env,
	} as unknown as ToolExecuteOptions;
}

function finding(
	overrides: Partial<ContinuityFinding> = {}
): ContinuityFinding {
	return {
		id: "finding-1",
		campaignId: "campaign-1",
		fingerprint: "state_contradiction:abc123",
		findingType: "state_contradiction",
		confidence: "high",
		question:
			"Session 12 recorded Vane's death; session 19 references him. Intentional?",
		detail: "Check whether the death was faked.",
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
		subjectEntityId: "campaign-1_vane",
		subjectName: "Vane",
		status: "open",
		resolutionNote: null,
		resolvedBy: null,
		resolvedAt: null,
		scanId: "scan-1",
		detectedAt: "2026-01-01T00:00:00Z",
		updatedAt: "2026-01-01T00:00:00Z",
		...overrides,
	};
}

function emptyScan(overrides: Record<string, unknown> = {}) {
	return {
		scanId: "scan-1",
		campaignId: "campaign-1",
		mode: "incremental",
		scannedFromSession: null,
		scannedToSession: 19,
		candidatesGenerated: 0,
		candidatesAlreadyKnown: 0,
		candidatesTriaged: 0,
		candidatesAdjudicated: 0,
		findingsCreated: 0,
		findings: [],
		truncated: false,
		warnings: [],
		...overrides,
	};
}

describe("continuity tools", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDaoFactory.campaignDAO.getCampaignByIdWithMapping.mockResolvedValue({
			id: "campaign-1",
			name: "Curse of Strahd",
		});
		mockDaoFactory.campaignDAO.getCampaignRole.mockResolvedValue("owner");
		mockDaoFactory.continuityFindingDAO.listFindingsForCampaign.mockResolvedValue(
			[]
		);
		scanMock.mockResolvedValue(emptyScan());
		resolveFindingMock.mockResolvedValue({
			finding: finding(),
			changelogEntryId: null,
		});
	});

	describe("checkCampaignContinuityTool", () => {
		it("reports findings with both sides cited", async () => {
			scanMock.mockResolvedValue(
				emptyScan({
					candidatesGenerated: 3,
					candidatesAlreadyKnown: 2,
					findingsCreated: 1,
					findings: [finding()],
				})
			);

			const result = (await checkCampaignContinuityTool.execute!(
				{ campaignId: "campaign-1", jwt: JWT, mode: "incremental" },
				options()
			)) as ToolResult;

			expect(result.result.success).toBe(true);
			expect(result.result.message).toContain("1 continuity question(s)");
			const data = result.result.data as {
				findings: Array<{ evidence: unknown[]; question: string }>;
				candidatesAlreadyKnown: number;
			};
			expect(data.candidatesAlreadyKnown).toBe(2);
			expect(data.findings[0].evidence).toHaveLength(2);
			expect(data.findings[0].question).toContain("Intentional?");
		});

		it("says so plainly when there is nothing new", async () => {
			const result = (await checkCampaignContinuityTool.execute!(
				{ campaignId: "campaign-1", jwt: JWT, mode: "incremental" },
				options()
			)) as ToolResult;

			expect(result.result.success).toBe(true);
			expect(result.result.message).toContain("No new continuity questions");
		});

		it("passes scan options through to the service", async () => {
			await checkCampaignContinuityTool.execute!(
				{
					campaignId: "campaign-1",
					jwt: JWT,
					mode: "full",
					types: ["state_contradiction"],
					minConfidence: "high",
					maxCandidates: 10,
				},
				options()
			);

			expect(scanMock).toHaveBeenCalledWith("campaign-1", {
				mode: "full",
				types: ["state_contradiction"],
				minConfidence: "high",
				maxCandidates: 10,
			});
		});

		it("surfaces truncation warnings rather than implying full coverage", async () => {
			scanMock.mockResolvedValue(
				emptyScan({
					truncated: true,
					warnings: ["Candidate cap of 60 reached; 4 candidate(s) unreviewed."],
				})
			);

			const result = (await checkCampaignContinuityTool.execute!(
				{ campaignId: "campaign-1", jwt: JWT },
				options()
			)) as ToolResult;

			const data = result.result.data as {
				truncated: boolean;
				warnings: string[];
			};
			expect(data.truncated).toBe(true);
			expect(data.warnings[0]).toContain("unreviewed");
		});

		it("errors when no database binding is available", async () => {
			const result = (await checkCampaignContinuityTool.execute!(
				{ campaignId: "campaign-1", jwt: JWT },
				options({})
			)) as ToolResult;

			expect(result.result.success).toBe(false);
			expect(scanMock).not.toHaveBeenCalled();
		});

		it("refuses players — continuity is a GM tool", async () => {
			mockDaoFactory.campaignDAO.getCampaignRole.mockResolvedValue(
				"editor_player"
			);

			const result = (await checkCampaignContinuityTool.execute!(
				{ campaignId: "campaign-1", jwt: JWT },
				options()
			)) as ToolResult;

			expect(result.result.success).toBe(false);
			expect(scanMock).not.toHaveBeenCalled();
		});

		it("reports a scan failure instead of throwing", async () => {
			scanMock.mockRejectedValue(new Error("provider exploded"));

			const result = (await checkCampaignContinuityTool.execute!(
				{ campaignId: "campaign-1", jwt: JWT },
				options()
			)) as ToolResult;

			expect(result.result.success).toBe(false);
			expect(result.result.message).toContain("Failed to check");
		});
	});

	describe("listContinuityFindingsTool", () => {
		it("shows only high-confidence findings by default", async () => {
			mockDaoFactory.continuityFindingDAO.listFindingsForCampaign.mockResolvedValue(
				[
					finding({ id: "high-1", confidence: "high" }),
					finding({ id: "medium-1", confidence: "medium" }),
					finding({ id: "low-1", confidence: "low" }),
				]
			);

			const result = (await listContinuityFindingsTool.execute!(
				{ campaignId: "campaign-1", jwt: JWT, status: "open", limit: 25 },
				options()
			)) as ToolResult;

			const data = result.result.data as {
				total: number;
				shown: number;
				findings: Array<{ id: string }>;
			};
			expect(data.total).toBe(3);
			expect(data.shown).toBe(1);
			expect(data.findings[0].id).toBe("high-1");
		});

		it("shows every confidence tier when asked", async () => {
			mockDaoFactory.continuityFindingDAO.listFindingsForCampaign.mockResolvedValue(
				[
					finding({ id: "high-1", confidence: "high" }),
					finding({ id: "low-1", confidence: "low" }),
				]
			);

			const result = (await listContinuityFindingsTool.execute!(
				{
					campaignId: "campaign-1",
					jwt: JWT,
					status: "open",
					highConfidenceOnly: false,
					limit: 25,
				},
				options()
			)) as ToolResult;

			expect((result.result.data as { shown: number }).shown).toBe(2);
		});

		it("reports an empty result without inventing findings", async () => {
			const result = (await listContinuityFindingsTool.execute!(
				{ campaignId: "campaign-1", jwt: JWT, status: "open", limit: 25 },
				options()
			)) as ToolResult;

			expect(result.result.success).toBe(true);
			expect(result.result.message).toContain("No open continuity findings");
		});

		it("forwards status and type filters to the DAO", async () => {
			await listContinuityFindingsTool.execute!(
				{
					campaignId: "campaign-1",
					jwt: JWT,
					status: "dismissed",
					types: ["dangling_thread"],
					limit: 5,
				},
				options()
			);

			expect(
				mockDaoFactory.continuityFindingDAO.listFindingsForCampaign
			).toHaveBeenCalledWith("campaign-1", {
				status: "dismissed",
				types: ["dangling_thread"],
				limit: 5,
			});
		});

		it("reports a listing failure instead of throwing", async () => {
			mockDaoFactory.continuityFindingDAO.listFindingsForCampaign.mockRejectedValue(
				new Error("d1 unavailable")
			);

			const result = (await listContinuityFindingsTool.execute!(
				{ campaignId: "campaign-1", jwt: JWT, status: "open", limit: 25 },
				options()
			)) as ToolResult;

			expect(result.result.success).toBe(false);
			expect(result.result.message).toContain("Failed to list");
		});
	});

	describe("resolveContinuityFindingTool", () => {
		it("dismisses a finding and attributes it to the caller", async () => {
			resolveFindingMock.mockResolvedValue({
				finding: finding({ status: "dismissed" }),
				changelogEntryId: null,
			});

			const result = (await resolveContinuityFindingTool.execute!(
				{
					campaignId: "campaign-1",
					jwt: JWT,
					findingId: "finding-1",
					action: "dismiss",
					note: "Vane faked his death on purpose.",
				},
				options()
			)) as ToolResult;

			expect(result.result.success).toBe(true);
			expect(result.result.message).toContain("Dismissed");
			expect(resolveFindingMock).toHaveBeenCalledWith(
				"campaign-1",
				"finding-1",
				{
					action: "dismiss",
					note: "Vane faked his death on purpose.",
					resolvedBy: "ofisk",
					correction: {
						entityId: null,
						status: null,
						campaignSessionId: null,
					},
				}
			);
		});

		it("confirms a finding", async () => {
			const result = (await resolveContinuityFindingTool.execute!(
				{
					campaignId: "campaign-1",
					jwt: JWT,
					findingId: "finding-1",
					action: "confirm",
				},
				options()
			)) as ToolResult;

			expect(result.result.message).toContain("Confirmed");
		});

		it("returns the changelog entry a correction wrote back", async () => {
			resolveFindingMock.mockResolvedValue({
				finding: finding({ status: "corrected" }),
				changelogEntryId: "changelog-1",
			});

			const result = (await resolveContinuityFindingTool.execute!(
				{
					campaignId: "campaign-1",
					jwt: JWT,
					findingId: "finding-1",
					action: "correct",
					correctedEntityId: "campaign-1_vane",
					correctedStatus: "alive",
					campaignSessionId: 19,
				},
				options()
			)) as ToolResult;

			expect(result.result.message).toContain("Corrected");
			expect(
				(result.result.data as { changelogEntryId: string }).changelogEntryId
			).toBe("changelog-1");
			expect(resolveFindingMock).toHaveBeenCalledWith(
				"campaign-1",
				"finding-1",
				expect.objectContaining({
					correction: {
						entityId: "campaign-1_vane",
						status: "alive",
						campaignSessionId: 19,
					},
				})
			);
		});

		it("reports a resolution failure instead of throwing", async () => {
			resolveFindingMock.mockRejectedValue(
				new Error("Continuity finding not found")
			);

			const result = (await resolveContinuityFindingTool.execute!(
				{
					campaignId: "campaign-1",
					jwt: JWT,
					findingId: "missing",
					action: "confirm",
				},
				options()
			)) as ToolResult;

			expect(result.result.success).toBe(false);
			expect(result.result.message).toContain("Failed to resolve");
		});

		it("refuses players", async () => {
			mockDaoFactory.campaignDAO.getCampaignRole.mockResolvedValue(
				"readonly_player"
			);

			const result = (await resolveContinuityFindingTool.execute!(
				{
					campaignId: "campaign-1",
					jwt: JWT,
					findingId: "finding-1",
					action: "dismiss",
				},
				options()
			)) as ToolResult;

			expect(result.result.success).toBe(false);
			expect(resolveFindingMock).not.toHaveBeenCalled();
		});
	});
});
