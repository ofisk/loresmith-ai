import { describe, it, expect, vi } from "vitest";
import {
  handleGetChatHistory,
  handleGetChatSessions,
} from "@/routes/chat-history";

const createMockStmt = (allResults: unknown[] = []) => ({
  bind: vi.fn().mockReturnThis(),
  run: vi.fn().mockResolvedValue({}),
  all: vi.fn().mockResolvedValue({ results: allResults }),
  first: vi.fn().mockResolvedValue(null),
});

describe("chat-history routes", () => {
  describe("handleGetChatSessions", () => {
    it("throws when user is not authenticated", async () => {
      const c = {
        env: { DB: {} },
        json: vi.fn(),
      } as any;
      // No userAuth on context - getUserAuth throws
      await expect(handleGetChatSessions(c)).rejects.toThrow();
    });

    it("returns sessions list when authenticated", async () => {
      const sessions = [
        {
          sessionId: "session-1",
          lastMessageAt: "2024-01-01T12:00:00Z",
          description: "Recap and prep notes",
        },
      ];
      const mockStmt = createMockStmt(sessions);
      const mockDB = {
        prepare: vi.fn().mockReturnValue(mockStmt),
      };
      const json = vi.fn().mockReturnValue(new Response());
      const c = {
        env: { DB: mockDB },
        json,
        userAuth: { username: "testuser" },
      } as any;

      await handleGetChatSessions(c);

      expect(json).toHaveBeenCalledWith({ sessions });
    });

    it("returns empty array when user has no sessions", async () => {
      const mockStmt = createMockStmt([]);
      const mockDB = {
        prepare: vi.fn().mockReturnValue(mockStmt),
      };
      const json = vi.fn().mockReturnValue(new Response());
      const c = {
        env: { DB: mockDB },
        json,
        userAuth: { username: "testuser" },
      } as any;

      await handleGetChatSessions(c);

      expect(json).toHaveBeenCalledWith({ sessions: [] });
    });
  });

  describe("handleGetChatHistory", () => {
    it("returns 400 when sessionId is missing", async () => {
      const param = vi.fn().mockReturnValue(undefined);
      const json = vi.fn().mockReturnValue(new Response());
      const c = {
        req: { param },
        env: {},
        json,
        userAuth: { username: "testuser" },
      } as any;

      await handleGetChatHistory(c);

      expect(param).toHaveBeenCalledWith("sessionId");
      expect(json).toHaveBeenCalledWith({ error: "Session ID required" }, 400);
    });
  });
});
