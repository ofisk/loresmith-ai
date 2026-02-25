import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserDAO } from "../../src/dao/user-dao";

// Mock D1Database
const mockDB = {
	prepare: vi.fn(),
};

describe("UserDAO", () => {
	let userDAO: UserDAO;

	beforeEach(() => {
		userDAO = new UserDAO(mockDB as any);
		vi.clearAllMocks();
	});

	describe("getStorageUsage", () => {
		it("should return storage usage for user", async () => {
			const mockFirst = vi.fn().mockResolvedValue({
				username: "testuser",
				total_size: 1024,
				file_count: 5,
			});
			const mockBind = vi.fn().mockReturnValue({ first: mockFirst });
			const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });
			mockDB.prepare = mockPrepare;

			const result = await userDAO.getStorageUsage("testuser");

			expect(result).toEqual({
				username: "testuser",
				total_size: 1024,
				file_count: 5,
			});
		});

		it("should return default values when no files found", async () => {
			const mockFirst = vi.fn().mockResolvedValue(null);
			const mockBind = vi.fn().mockReturnValue({ first: mockFirst });
			const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });
			mockDB.prepare = mockPrepare;

			const result = await userDAO.getStorageUsage("testuser");

			expect(result).toEqual({
				username: "testuser",
				total_size: 0,
				file_count: 0,
			});
		});
	});
});
