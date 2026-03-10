import type { D1Database } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	SessionPlanReadoutDAO,
	type SessionPlanReadoutRecord,
} from "@/dao/session-plan-readout-dao";

function createMockStmt() {
	return {
		bind: vi.fn().mockReturnThis(),
		run: vi.fn().mockResolvedValue({}),
		all: vi.fn().mockResolvedValue({ results: [] }),
		first: vi.fn().mockResolvedValue(null),
	};
}

describe("SessionPlanReadoutDAO", () => {
	let dao: SessionPlanReadoutDAO;
	let mockDB: D1Database;
	let mockStmt: ReturnType<typeof createMockStmt>;

	beforeEach(() => {
		mockStmt = createMockStmt();
		mockDB = {
			prepare: vi.fn().mockReturnValue(mockStmt),
		} as unknown as D1Database;
		dao = new SessionPlanReadoutDAO(mockDB);
	});

	it("get returns null when no row", async () => {
		mockStmt.first.mockResolvedValue(null);

		const result = await dao.get("campaign-1", 1);

		expect(result).toBeNull();
		expect(mockStmt.bind).toHaveBeenCalledWith("campaign-1", 1);
	});

	it("get returns record when row exists", async () => {
		const row: SessionPlanReadoutRecord = {
			content: "Plan content",
			updatedAt: "2024-01-01T00:00:00Z",
		};
		mockStmt.first.mockResolvedValue(row);

		const result = await dao.get("campaign-1", 2);

		expect(result).toEqual(row);
	});

	it("save executes insert/upsert", async () => {
		await dao.save("campaign-1", 1, "content");

		expect(mockDB.prepare).toHaveBeenCalled();
		expect(mockStmt.bind).toHaveBeenCalledWith("campaign-1", 1, "content");
		expect(mockStmt.run).toHaveBeenCalled();
	});

	it("delete executes delete", async () => {
		await dao.delete("campaign-1", 1);

		expect(mockDB.prepare).toHaveBeenCalled();
		expect(mockStmt.bind).toHaveBeenCalledWith("campaign-1", 1);
		expect(mockStmt.run).toHaveBeenCalled();
	});

	it("invalidateForCampaign deletes all plans for campaign", async () => {
		await dao.invalidateForCampaign("campaign-1");

		expect(mockDB.prepare).toHaveBeenCalled();
		expect(mockStmt.bind).toHaveBeenCalledWith("campaign-1");
		expect(mockStmt.run).toHaveBeenCalled();
	});
});
