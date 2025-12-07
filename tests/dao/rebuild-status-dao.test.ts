import { beforeEach, describe, expect, it, vi } from "vitest";
import { RebuildStatusDAO } from "@/dao/rebuild-status-dao";
import type { D1Database } from "@cloudflare/workers-types";

describe("RebuildStatusDAO", () => {
  let dao: RebuildStatusDAO;
  let mockDb: D1Database;

  beforeEach(() => {
    mockDb = {
      prepare: vi.fn().mockReturnThis(),
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true }),
      all: vi.fn().mockResolvedValue({ results: [], success: true }),
      first: vi.fn().mockResolvedValue(null),
    } as unknown as D1Database;

    dao = new RebuildStatusDAO(mockDb);
    vi.clearAllMocks();
  });

  describe("createRebuild", () => {
    it("should create a rebuild status entry", async () => {
      const mockRun = vi.fn().mockResolvedValue({ success: true });
      (mockDb.prepare as any).mockReturnValue({
        bind: vi.fn().mockReturnValue({ run: mockRun }),
      });

      await dao.createRebuild({
        id: "rebuild-123",
        campaignId: "campaign-123",
        rebuildType: "full",
        status: "pending",
      });

      expect(mockDb.prepare).toHaveBeenCalled();
      expect(mockRun).toHaveBeenCalled();
    });

    it("should handle affected entity IDs for partial rebuilds", async () => {
      const mockRun = vi.fn().mockResolvedValue({ success: true });
      (mockDb.prepare as any).mockReturnValue({
        bind: vi.fn().mockReturnValue({ run: mockRun }),
      });

      await dao.createRebuild({
        id: "rebuild-123",
        campaignId: "campaign-123",
        rebuildType: "partial",
        status: "pending",
        affectedEntityIds: ["entity-1", "entity-2"],
      });

      expect(mockDb.prepare).toHaveBeenCalled();
      expect(mockRun).toHaveBeenCalled();
    });
  });

  describe("getRebuildById", () => {
    it("should return rebuild status if found", async () => {
      const mockRecord = {
        id: "rebuild-123",
        campaign_id: "campaign-123",
        rebuild_type: "full",
        status: "pending",
        affected_entity_ids: null,
        started_at: null,
        completed_at: null,
        error_message: null,
        metadata: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      (mockDb.prepare as any).mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(mockRecord),
        }),
      });

      const result = await dao.getRebuildById("rebuild-123");

      expect(result).toBeDefined();
      expect(result?.id).toBe("rebuild-123");
      expect(result?.campaignId).toBe("campaign-123");
    });

    it("should return null if rebuild not found", async () => {
      (mockDb.prepare as any).mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
        }),
      });

      const result = await dao.getRebuildById("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("updateRebuildStatus", () => {
    it("should update rebuild status", async () => {
      const mockRun = vi.fn().mockResolvedValue({ success: true });
      (mockDb.prepare as any).mockReturnValue({
        bind: vi.fn().mockReturnValue({ run: mockRun }),
      });

      await dao.updateRebuildStatus("rebuild-123", {
        status: "in_progress",
        startedAt: new Date().toISOString(),
      });

      expect(mockDb.prepare).toHaveBeenCalled();
      expect(mockRun).toHaveBeenCalled();
    });
  });

  describe("getActiveRebuilds", () => {
    it("should return active rebuilds for a campaign", async () => {
      const mockRecords = [
        {
          id: "rebuild-123",
          campaign_id: "campaign-123",
          rebuild_type: "full",
          status: "in_progress",
          affected_entity_ids: null,
          started_at: new Date().toISOString(),
          completed_at: null,
          error_message: null,
          metadata: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      (mockDb.prepare as any).mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi
            .fn()
            .mockResolvedValue({ results: mockRecords, success: true }),
        }),
      });

      const result = await dao.getActiveRebuilds("campaign-123");

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("cancelRebuild", () => {
    it("should cancel a pending rebuild", async () => {
      const mockRun = vi.fn().mockResolvedValue({ success: true });
      (mockDb.prepare as any).mockReturnValue({
        bind: vi.fn().mockReturnValue({ run: mockRun }),
      });

      await dao.cancelRebuild("rebuild-123", "User cancelled");

      expect(mockDb.prepare).toHaveBeenCalled();
      expect(mockRun).toHaveBeenCalled();
    });
  });
});
