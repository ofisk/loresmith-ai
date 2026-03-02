import type { D1Database } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageHistoryDAO } from "../../src/dao/message-history-dao";

const mockDB = {
	prepare: vi.fn(),
} as unknown as D1Database;

describe("MessageHistoryDAO", () => {
	let dao: MessageHistoryDAO;
	let mockPreparedStatement: {
		bind: ReturnType<typeof vi.fn>;
		run: ReturnType<typeof vi.fn>;
		all: ReturnType<typeof vi.fn>;
		first: ReturnType<typeof vi.fn>;
	};

	beforeEach(() => {
		dao = new MessageHistoryDAO(mockDB);
		mockPreparedStatement = {
			bind: vi.fn().mockReturnThis(),
			run: vi.fn().mockResolvedValue({}),
			all: vi.fn().mockResolvedValue({ results: [] }),
			first: vi.fn().mockResolvedValue(null),
		};
		vi.clearAllMocks();
		(mockDB.prepare as any).mockReturnValue(mockPreparedStatement);
	});

	it("createMessage inserts and trims without a count query", async () => {
		await dao.createMessage({
			sessionId: "session-1",
			username: "alice",
			campaignId: "campaign-1",
			role: "user",
			content: "hello",
		});

		const preparedSqls = (mockDB.prepare as any).mock.calls.map(
			([sql]: [string]) => sql
		);

		expect(
			preparedSqls.some((sql: string) =>
				sql.includes("INSERT INTO message_history")
			)
		).toBe(true);
		expect(
			preparedSqls.some((sql: string) =>
				sql.includes("DELETE FROM message_history")
			)
		).toBe(true);
		expect(
			preparedSqls.some((sql: string) => sql.includes("SELECT COUNT(*)"))
		).toBe(false);
		expect(mockPreparedStatement.bind).toHaveBeenCalledWith(
			"session-1",
			"session-1",
			500
		);
	});

	it("trimSessionMessages uses bounded delete with provided keep count", async () => {
		await dao.trimSessionMessages("session-2", 25);

		const preparedSqls = (mockDB.prepare as any).mock.calls.map(
			([sql]: [string]) => sql
		);
		expect(
			preparedSqls.some((sql: string) =>
				sql.includes("DELETE FROM message_history")
			)
		).toBe(true);
		expect(
			preparedSqls.some((sql: string) => sql.includes("SELECT COUNT(*)"))
		).toBe(false);
		expect(mockPreparedStatement.bind).toHaveBeenCalledWith(
			"session-2",
			"session-2",
			25
		);
	});

	it("trimSessionMessages is a no-op when fewer rows exist than keep count", async () => {
		mockPreparedStatement.run.mockResolvedValue({ meta: { changes: 0 } });

		await expect(
			dao.trimSessionMessages("session-3", 100)
		).resolves.toBeUndefined();
		expect(mockPreparedStatement.run).toHaveBeenCalled();
	});
});
