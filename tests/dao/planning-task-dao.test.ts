import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanningTaskDAO } from "@/dao/planning-task-dao";

describe("PlanningTaskDAO.listCompletedForSessionReadout", () => {
	const mockDB = {
		prepare: vi.fn(),
	};

	let dao: PlanningTaskDAO;

	beforeEach(() => {
		vi.clearAllMocks();
		dao = new PlanningTaskDAO(mockDB as any);
	});

	it("queries completed tasks pinned to the session or legacy null targets", async () => {
		const all = vi.fn().mockResolvedValue({ results: [] });
		mockDB.prepare.mockReturnValue({ bind: vi.fn().mockReturnValue({ all }) });

		await dao.listCompletedForSessionReadout("campaign-1", 3);

		expect(mockDB.prepare).toHaveBeenCalledWith(
			expect.stringContaining("target_session_number = ?")
		);
		expect(mockDB.prepare).toHaveBeenCalledWith(
			expect.stringContaining("target_session_number IS NULL")
		);
		const bind = mockDB.prepare.mock.results[0].value.bind;
		expect(bind).toHaveBeenCalledWith("campaign-1", 3);
	});
});
