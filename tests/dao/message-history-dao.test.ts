import { describe, it, expect, beforeEach, vi } from "vitest";
import { MessageHistoryDAO } from "@/dao/message-history-dao";
import type { D1Database } from "@cloudflare/workers-types";

function createMockStmt() {
  return {
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue({}),
    all: vi.fn().mockResolvedValue({ results: [] }),
    first: vi.fn().mockResolvedValue(null),
  };
}

describe("MessageHistoryDAO", () => {
  let dao: MessageHistoryDAO;
  let mockDB: D1Database;
  let mockStmt: ReturnType<typeof createMockStmt>;

  beforeEach(() => {
    mockStmt = createMockStmt();
    mockDB = {
      prepare: vi.fn().mockReturnValue(mockStmt),
    } as unknown as D1Database;
    dao = new MessageHistoryDAO(mockDB);
  });

  describe("getSessionsForUser", () => {
    it("returns empty array when user has no sessions", async () => {
      mockStmt.all.mockResolvedValue({ results: [] });

      const result = await dao.getSessionsForUser("user1");

      expect(result).toEqual([]);
      expect(mockStmt.bind).toHaveBeenCalledWith("user1", "user1", "user1", 50);
    });

    it("returns sessions ordered by lastMessageAt desc", async () => {
      const rows = [
        {
          sessionId: "session-2",
          lastMessageAt: "2024-02-02T12:00:00Z",
          description: "Plan next session",
        },
        {
          sessionId: "session-1",
          lastMessageAt: "2024-01-01T12:00:00Z",
          description: "Recap chapter one",
        },
      ];
      mockStmt.all.mockResolvedValue({ results: rows });

      const result = await dao.getSessionsForUser("user1");

      expect(result).toHaveLength(2);
      expect(result[0].sessionId).toBe("session-2");
      expect(result[0].lastMessageAt).toBe("2024-02-02T12:00:00Z");
      expect(result[0].description).toBe("Plan next session");
      expect(result[1].sessionId).toBe("session-1");
      expect(result[1].lastMessageAt).toBe("2024-01-01T12:00:00Z");
      expect(result[1].description).toBe("Recap chapter one");
    });

    it("respects limit parameter", async () => {
      mockStmt.all.mockResolvedValue({ results: [] });

      await dao.getSessionsForUser("user1", 10);

      expect(mockStmt.bind).toHaveBeenCalledWith("user1", "user1", "user1", 10);
    });
  });
});
