import type { D1Database } from "@cloudflare/workers-types";
import { vi } from "vitest";

export function createMockStmt() {
	return {
		bind: vi.fn().mockReturnThis(),
		run: vi.fn().mockResolvedValue({}),
		all: vi.fn().mockResolvedValue({ results: [] }),
		first: vi.fn().mockResolvedValue(null),
	};
}

export type MockStmt = ReturnType<typeof createMockStmt>;

export function createMockD1(prepareReturn?: MockStmt): D1Database {
	const stmt = prepareReturn ?? createMockStmt();
	return {
		prepare: vi.fn().mockReturnValue(stmt),
	} as unknown as D1Database;
}
