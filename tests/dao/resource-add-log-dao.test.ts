import type { D1Database } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResourceAddLogDAO } from "@/dao/resource-add-log-dao";

function createMockStmt() {
	return {
		bind: vi.fn().mockReturnThis(),
		run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
		all: vi.fn().mockResolvedValue({ results: [{ cnt: 5 }] }),
		first: vi.fn().mockResolvedValue(null),
	};
}

describe("ResourceAddLogDAO", () => {
	let dao: ResourceAddLogDAO;
	let mockDB: D1Database;
	let mockStmt: ReturnType<typeof createMockStmt>;

	beforeEach(() => {
		mockStmt = createMockStmt();
		mockDB = {
			prepare: vi.fn().mockReturnValue(mockStmt),
		} as unknown as D1Database;
		dao = new ResourceAddLogDAO(mockDB);
	});

	it("recordAdd inserts with username and campaignId", async () => {
		await dao.recordAdd("user1", "campaign-123");

		expect(mockDB.prepare).toHaveBeenCalled();
		expect(mockStmt.bind).toHaveBeenCalledWith("user1", "campaign-123");
		expect(mockStmt.run).toHaveBeenCalled();
	});

	it("getCountInLastHour returns count from query", async () => {
		mockStmt.all.mockResolvedValue({ results: [{ cnt: 3 }] });

		const count = await dao.getCountInLastHour("user1", "campaign-123");

		expect(count).toBe(3);
		expect(mockStmt.bind).toHaveBeenCalledWith("user1", "campaign-123");
	});

	it("getCountInLastHour returns 0 when no rows", async () => {
		mockStmt.all.mockResolvedValue({ results: [] });

		const count = await dao.getCountInLastHour("user1", "campaign-123");

		expect(count).toBe(0);
	});

	it("pruneOldRows returns number of deleted rows", async () => {
		mockStmt.run.mockResolvedValue({ meta: { changes: 7 } });

		const deleted = await dao.pruneOldRows();

		expect(deleted).toBe(7);
	});

	it("pruneOldRows returns 0 when no changes", async () => {
		mockStmt.run.mockResolvedValue({ meta: { changes: 0 } });

		const deleted = await dao.pruneOldRows();

		expect(deleted).toBe(0);
	});
});
