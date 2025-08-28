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

  describe("storeOpenAIKey", () => {
    it("should store OpenAI API key successfully", async () => {
      const mockRun = vi.fn().mockResolvedValue(undefined);
      const mockBind = vi.fn().mockReturnValue({ run: mockRun });
      const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });
      mockDB.prepare = mockPrepare;

      await userDAO.storeOpenAIKey("testuser", "sk-test-key");

      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining("insert or replace")
      );
      expect(mockBind).toHaveBeenCalledWith("testuser", "sk-test-key");
      expect(mockRun).toHaveBeenCalled();
    });

    it("should handle database errors", async () => {
      const mockRun = vi.fn().mockRejectedValue(new Error("Database error"));
      const mockBind = vi.fn().mockReturnValue({ run: mockRun });
      const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });
      mockDB.prepare = mockPrepare;

      await expect(
        userDAO.storeOpenAIKey("testuser", "sk-test-key")
      ).rejects.toThrow("Database execute failed");
    });
  });

  describe("getOpenAIKey", () => {
    it("should return API key when found", async () => {
      const mockFirst = vi.fn().mockResolvedValue({ api_key: "sk-test-key" });
      const mockBind = vi.fn().mockReturnValue({ first: mockFirst });
      const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });
      mockDB.prepare = mockPrepare;

      const result = await userDAO.getOpenAIKey("testuser");

      expect(result).toBe("sk-test-key");
      expect(mockPrepare).toHaveBeenCalledWith(
        "select api_key from user_openai_keys where username = ?"
      );
      expect(mockBind).toHaveBeenCalledWith("testuser");
    });

    it("should return null when no key found", async () => {
      const mockFirst = vi.fn().mockResolvedValue(null);
      const mockBind = vi.fn().mockReturnValue({ first: mockFirst });
      const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });
      mockDB.prepare = mockPrepare;

      const result = await userDAO.getOpenAIKey("testuser");

      expect(result).toBeNull();
    });
  });

  describe("hasOpenAIKey", () => {
    it("should return true when user has key", async () => {
      const mockFirst = vi.fn().mockResolvedValue({ 1: 1 });
      const mockBind = vi.fn().mockReturnValue({ first: mockFirst });
      const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });
      mockDB.prepare = mockPrepare;

      const result = await userDAO.hasOpenAIKey("testuser");

      expect(result).toBe(true);
    });

    it("should return false when user has no key", async () => {
      const mockFirst = vi.fn().mockResolvedValue(null);
      const mockBind = vi.fn().mockReturnValue({ first: mockFirst });
      const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });
      mockDB.prepare = mockPrepare;

      const result = await userDAO.hasOpenAIKey("testuser");

      expect(result).toBe(false);
    });
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
