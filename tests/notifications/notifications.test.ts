import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  notifyCampaignCreated,
  notifyError,
  notifyFileUploadComplete,
  notifyShardGeneration,
  notifySuccess,
  notifyUser,
} from "../../src/lib/notifications";

// Mock environment
const mockEnv = {
  NOTIFICATIONS: {
    idFromName: vi.fn().mockReturnValue({ toString: () => "mock-id" }),
    get: vi.fn().mockReturnValue({
      fetch: vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ success: true }), { status: 200 })
        ),
    }),
  },
} as any;

describe("Notification Helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("notifyUser", () => {
    it("should send notification with timestamp", async () => {
      const payload = {
        type: "test",
        title: "Test",
        message: "Test message",
      };

      await notifyUser(mockEnv, "test-user", payload);

      expect(mockEnv.NOTIFICATIONS.idFromName).toHaveBeenCalledWith(
        "user-test-user"
      );
      expect(mockEnv.NOTIFICATIONS.get).toHaveBeenCalled();

      const mockDO = mockEnv.NOTIFICATIONS.get();
      expect(mockDO.fetch).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    it("should handle errors gracefully", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      mockEnv.NOTIFICATIONS.get().fetch.mockRejectedValue(
        new Error("Network error")
      );

      await notifyUser(mockEnv, "test-user", {
        type: "test",
        title: "Test",
        message: "Test message",
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error sending notification to test-user"),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("notifyShardGeneration", () => {
    it("should send shard generation notification", async () => {
      await notifyShardGeneration(
        mockEnv,
        "test-user",
        "Test Campaign",
        "test-file.pdf",
        5
      );

      const mockDO = mockEnv.NOTIFICATIONS.get();
      const callArgs = mockDO.fetch.mock.calls[0][0];
      const body = JSON.parse(callArgs.body);

      expect(body.type).toBe("shards_generated");
      expect(body.title).toBe("New Shards Ready!");
      expect(body.message).toContain(
        '5 new shards generated from "test-file.pdf"'
      );
      expect(body.message).toContain("Test Campaign");
      expect(body.data).toEqual({
        campaignName: "Test Campaign",
        fileName: "test-file.pdf",
        shardCount: 5,
      });
    });
  });

  describe("notifyFileUploadComplete", () => {
    it("should send file upload notification", async () => {
      await notifyFileUploadComplete(
        mockEnv,
        "test-user",
        "test-file.pdf",
        1024
      );

      const mockDO = mockEnv.NOTIFICATIONS.get();
      const callArgs = mockDO.fetch.mock.calls[0][0];
      const body = JSON.parse(callArgs.body);

      expect(body.type).toBe("file_uploaded");
      expect(body.title).toBe("File Upload Complete");
      expect(body.message).toContain("test-file.pdf");
      expect(body.message).toContain("1 KB");
      expect(body.data).toEqual({
        fileName: "test-file.pdf",
        fileSize: 1024,
      });
    });
  });

  describe("notifyCampaignCreated", () => {
    it("should send campaign creation notification", async () => {
      await notifyCampaignCreated(mockEnv, "test-user", "New Campaign");

      const mockDO = mockEnv.NOTIFICATIONS.get();
      const callArgs = mockDO.fetch.mock.calls[0][0];
      const body = JSON.parse(callArgs.body);

      expect(body.type).toBe("campaign_created");
      expect(body.title).toBe("Campaign Created");
      expect(body.message).toContain("New Campaign");
      expect(body.data).toEqual({
        campaignName: "New Campaign",
      });
    });
  });

  describe("notifySuccess", () => {
    it("should send success notification", async () => {
      await notifySuccess(
        mockEnv,
        "test-user",
        "Success!",
        "Operation completed successfully",
        { operationId: "123" }
      );

      const mockDO = mockEnv.NOTIFICATIONS.get();
      const callArgs = mockDO.fetch.mock.calls[0][0];
      const body = JSON.parse(callArgs.body);

      expect(body.type).toBe("success");
      expect(body.title).toBe("Success!");
      expect(body.message).toBe("Operation completed successfully");
      expect(body.data).toEqual({ operationId: "123" });
    });
  });

  describe("notifyError", () => {
    it("should send error notification", async () => {
      await notifyError(
        mockEnv,
        "test-user",
        "Error!",
        "Something went wrong",
        { errorCode: "E001" }
      );

      const mockDO = mockEnv.NOTIFICATIONS.get();
      const callArgs = mockDO.fetch.mock.calls[0][0];
      const body = JSON.parse(callArgs.body);

      expect(body.type).toBe("error");
      expect(body.title).toBe("Error!");
      expect(body.message).toBe("Something went wrong");
      expect(body.data).toEqual({ errorCode: "E001" });
    });
  });
});
