import type {
	D1Database,
	D1PreparedStatement,
	D1Result,
} from "@cloudflare/workers-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DAOFactoryImpl } from "@/dao/dao-factory";

describe("DAOFactoryImpl", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("parallel runs all operations and returns results", async () => {
		const mockDB = {
			prepare: vi.fn(),
			batch: vi.fn(),
		} as unknown as D1Database;
		const factory = new DAOFactoryImpl(mockDB);

		const op1 = vi.fn().mockResolvedValue("first");
		const op2 = vi.fn().mockResolvedValue("second");

		const result = await factory.parallel([op1, op2]);

		expect(op1).toHaveBeenCalledOnce();
		expect(op2).toHaveBeenCalledOnce();
		expect(result).toEqual(["first", "second"]);
	});

	it("parallel rethrows operation errors", async () => {
		const mockDB = {
			prepare: vi.fn(),
			batch: vi.fn(),
		} as unknown as D1Database;
		const factory = new DAOFactoryImpl(mockDB);

		const error = new Error("boom");
		const op = vi.fn().mockRejectedValue(error);
		const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		await expect(factory.parallel([op])).rejects.toThrow("boom");
		expect(logSpy).toHaveBeenCalledWith("DAO parallel error:", error);
	});

	it("batch delegates to db.batch with prepared statements", async () => {
		const batchResult: D1Result[] = [{ success: true }] as D1Result[];
		const batch = vi.fn().mockResolvedValue(batchResult);
		const mockDB = {
			prepare: vi.fn(),
			batch,
		} as unknown as D1Database;
		const factory = new DAOFactoryImpl(mockDB);
		const statement = {} as D1PreparedStatement;

		const result = await factory.batch([statement]);

		expect(batch).toHaveBeenCalledWith([statement]);
		expect(result).toBe(batchResult);
	});
});
