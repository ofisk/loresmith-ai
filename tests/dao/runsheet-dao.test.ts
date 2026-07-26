import type { D1Database } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it, type vi } from "vitest";
import { RunsheetDAO } from "@/dao/runsheet-dao";
import type { RunsheetData } from "@/types/runsheet";
import { createMockD1, createMockStmt } from "./helpers";

const validRunsheetData: RunsheetData = {
	recap: {
		fromSessionNumber: 2,
		keyEvents: ["The bridge fell"],
		stateChanges: { factions: [], locations: [], npcs: [] },
		source: null,
	},
	plan: {
		objectives: [],
		probablePlayerGoals: [],
		beats: ["Open in the ruined chapel"],
		ifThenBranches: [],
		openTasks: [],
		todoChecklist: [],
		source: null,
	},
	cast: [],
	encounters: [],
	loot: [],
	rules: [],
	openThreads: [],
	notes: "",
	emptySections: ["cast", "encounters", "loot", "rules", "openThreads"],
};

function runsheetRow(overrides: Record<string, unknown> = {}) {
	return {
		id: "runsheet-1",
		campaign_id: "campaign-1",
		session_number: 3,
		title: "Session 3 runsheet",
		runsheet_data: JSON.stringify(validRunsheetData),
		generated_at: "2026-07-01 12:00:00",
		created_at: "2026-07-01 12:00:00",
		updated_at: "2026-07-01 12:00:00",
		...overrides,
	};
}

describe("RunsheetDAO", () => {
	let dao: RunsheetDAO;
	let mockDB: D1Database;
	let mockStmt: ReturnType<typeof createMockStmt>;

	beforeEach(() => {
		mockStmt = createMockStmt();
		mockDB = createMockD1(mockStmt);
		dao = new RunsheetDAO(mockDB);
	});

	describe("createRunsheet", () => {
		it("inserts the runsheet with serialized snapshot data", async () => {
			expect.hasAssertions();

			await dao.createRunsheet("runsheet-1", {
				campaignId: "campaign-1",
				sessionNumber: 3,
				title: "Session 3 runsheet",
				runsheetData: validRunsheetData,
			});

			expect(mockDB.prepare).toHaveBeenCalled();
			expect(mockStmt.run).toHaveBeenCalled();
			const boundArgs = mockStmt.bind.mock.calls[0];
			expect(boundArgs).toContain("runsheet-1");
			expect(boundArgs).toContain("campaign-1");
			expect(boundArgs).toContain(JSON.stringify(validRunsheetData));
		});
	});

	describe("getRunsheetById", () => {
		it("returns null when no row exists", async () => {
			expect.hasAssertions();

			mockStmt.first.mockResolvedValue(null);

			await expect(dao.getRunsheetById("missing")).resolves.toBeNull();
		});

		it("parses the snapshot body into camelCase fields", async () => {
			expect.hasAssertions();

			mockStmt.first.mockResolvedValue(runsheetRow());

			const runsheet = await dao.getRunsheetById("runsheet-1");

			expect(runsheet).not.toBeNull();
			expect(runsheet?.campaignId).toBe("campaign-1");
			expect(runsheet?.sessionNumber).toBe(3);
			expect(runsheet?.runsheetData.recap.keyEvents).toEqual([
				"The bridge fell",
			]);
		});

		// A blank page at the table is worse than a loud failure: unlike a digest,
		// there is no form the GM can re-fill a corrupt runsheet from.
		it("throws rather than returning an empty runsheet when JSON is corrupt", async () => {
			expect.hasAssertions();

			mockStmt.first.mockResolvedValue(
				runsheetRow({ runsheet_data: "{not json" })
			);

			await expect(dao.getRunsheetById("runsheet-1")).rejects.toThrow(
				/unparseable snapshot data/
			);
		});

		it("throws when the snapshot is valid JSON but the wrong shape", async () => {
			expect.hasAssertions();

			mockStmt.first.mockResolvedValue(
				runsheetRow({ runsheet_data: JSON.stringify({ recap: {} }) })
			);

			await expect(dao.getRunsheetById("runsheet-1")).rejects.toThrow(
				/invalid snapshot structure/
			);
		});
	});

	describe("listRunsheetsByCampaign", () => {
		it("returns summaries without loading the snapshot body", async () => {
			expect.hasAssertions();

			const { runsheet_data: _omitted, ...summaryRow } = runsheetRow();
			mockStmt.all.mockResolvedValue({ results: [summaryRow] });

			const runsheets = await dao.listRunsheetsByCampaign("campaign-1");

			expect(runsheets).toHaveLength(1);
			expect(runsheets[0]).toEqual({
				id: "runsheet-1",
				campaignId: "campaign-1",
				sessionNumber: 3,
				title: "Session 3 runsheet",
				generatedAt: "2026-07-01 12:00:00",
				createdAt: "2026-07-01 12:00:00",
				updatedAt: "2026-07-01 12:00:00",
			});
			const sql = (mockDB.prepare as ReturnType<typeof vi.fn>).mock
				.calls[0][0] as string;
			expect(sql).not.toContain("runsheet_data");
		});

		it("filters by session number when provided", async () => {
			expect.hasAssertions();

			mockStmt.all.mockResolvedValue({ results: [] });

			await dao.listRunsheetsByCampaign("campaign-1", { sessionNumber: 3 });

			expect(mockStmt.bind).toHaveBeenCalledWith("campaign-1", 3);
		});
	});

	describe("updateRunsheet", () => {
		it("is a no-op when there is nothing to update", async () => {
			expect.hasAssertions();

			await dao.updateRunsheet("runsheet-1", {});

			expect(mockDB.prepare).not.toHaveBeenCalled();
		});

		it("updates only the fields provided", async () => {
			expect.hasAssertions();

			await dao.updateRunsheet("runsheet-1", { title: "Renamed" });

			const sql = (mockDB.prepare as ReturnType<typeof vi.fn>).mock
				.calls[0][0] as string;
			expect(sql).toContain("title = ?");
			expect(sql).not.toContain("runsheet_data = ?");
			expect(mockStmt.bind).toHaveBeenCalledWith("Renamed", "runsheet-1");
		});
	});

	describe("deleteRunsheet", () => {
		it("deletes by id", async () => {
			expect.hasAssertions();

			await dao.deleteRunsheet("runsheet-1");

			expect(mockStmt.bind).toHaveBeenCalledWith("runsheet-1");
			expect(mockStmt.run).toHaveBeenCalled();
		});
	});
});
