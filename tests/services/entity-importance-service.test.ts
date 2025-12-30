import { beforeEach, describe, expect, it, vi } from "vitest";
import { EntityImportanceService } from "@/services/graph/entity-importance-service";
import type { EntityDAO } from "@/dao/entity-dao";
import type { CommunityDAO } from "@/dao/community-dao";
import type { EntityImportanceDAO } from "@/dao/entity-importance-dao";

describe("EntityImportanceService", () => {
  let mockEntityDAO: Partial<EntityDAO>;
  let mockCommunityDAO: Partial<CommunityDAO>;
  let mockImportanceDAO: Partial<EntityImportanceDAO>;
  let service: EntityImportanceService;

  beforeEach(() => {
    mockEntityDAO = {
      getEntityById: vi.fn(),
      listEntitiesByCampaign: vi.fn(),
      getMinimalRelationshipsForCampaign: vi.fn().mockResolvedValue([]),
      getMinimalEntitiesForCampaign: vi.fn().mockResolvedValue([]),
      updateEntity: vi.fn(),
    };
    mockCommunityDAO = {
      findCommunitiesContainingEntity: vi.fn().mockResolvedValue([]),
      listCommunitiesByCampaign: vi.fn().mockResolvedValue([]),
    };
    mockImportanceDAO = {
      getImportance: vi.fn(),
      upsertImportance: vi.fn(),
      upsertImportanceBatch: vi.fn(),
      getImportanceForCampaign: vi.fn(),
    };
    service = new EntityImportanceService(
      mockEntityDAO as EntityDAO,
      mockCommunityDAO as CommunityDAO,
      mockImportanceDAO as EntityImportanceDAO
    );
  });

  describe("getEntityImportance", () => {
    it("reads from table when available", async () => {
      const entity = {
        id: "entity-1",
        campaignId: "campaign-123",
        entityType: "npc",
        name: "Test Entity",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        metadata: {},
      };

      const importance = {
        entityId: "entity-1",
        campaignId: "campaign-123",
        pagerank: 0.5,
        betweennessCentrality: 0.3,
        hierarchyLevel: 75,
        importanceScore: 65.0,
        computedAt: "2025-01-01T00:00:00Z",
      };

      (mockEntityDAO.getEntityById as any).mockResolvedValue(entity);
      (mockImportanceDAO.getImportance as any).mockResolvedValue(importance);

      const result = await service.getEntityImportance(
        "campaign-123",
        "entity-1"
      );

      expect(mockImportanceDAO.getImportance).toHaveBeenCalledWith("entity-1");
      expect(result).toBe(65.0);
      expect(mockEntityDAO.updateEntity).not.toHaveBeenCalled();
    });

    it("falls back to metadata when table entry not found", async () => {
      const entity = {
        id: "entity-1",
        campaignId: "campaign-123",
        entityType: "npc",
        name: "Test Entity",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        metadata: {
          importanceScore: 70.0,
        },
      };

      (mockEntityDAO.getEntityById as any).mockResolvedValue(entity);
      (mockImportanceDAO.getImportance as any).mockResolvedValue(null);

      const result = await service.getEntityImportance(
        "campaign-123",
        "entity-1"
      );

      expect(mockImportanceDAO.getImportance).toHaveBeenCalledWith("entity-1");
      expect(result).toBe(70.0);
    });

    it("calculates and stores in table when neither table nor metadata available", async () => {
      const entity = {
        id: "entity-1",
        campaignId: "campaign-123",
        entityType: "npc",
        name: "Test Entity",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        metadata: {},
      };

      (mockEntityDAO.getEntityById as any).mockResolvedValue(entity);
      (mockImportanceDAO.getImportance as any).mockResolvedValue(null);

      const result = await service.getEntityImportance(
        "campaign-123",
        "entity-1",
        true
      );

      expect(mockImportanceDAO.upsertImportance).toHaveBeenCalled();
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(100);
    });
  });

  describe("recalculateImportanceForCampaign", () => {
    it("writes to table when importanceDAO is available", async () => {
      const entities = [
        {
          id: "entity-1",
          campaignId: "campaign-123",
          entityType: "npc",
          name: "Entity 1",
          createdAt: "2025-01-01T00:00:00Z",
          updatedAt: "2025-01-01T00:00:00Z",
          metadata: {},
        },
        {
          id: "entity-2",
          campaignId: "campaign-123",
          entityType: "npc",
          name: "Entity 2",
          createdAt: "2025-01-01T00:00:00Z",
          updatedAt: "2025-01-01T00:00:00Z",
          metadata: {},
        },
      ];

      (mockEntityDAO.listEntitiesByCampaign as any).mockResolvedValue(entities);

      const results =
        await service.recalculateImportanceForCampaign("campaign-123");

      expect(mockImportanceDAO.upsertImportanceBatch).toHaveBeenCalledTimes(1);
      expect(mockImportanceDAO.upsertImportanceBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ entityId: "entity-1" }),
          expect.objectContaining({ entityId: "entity-2" }),
        ])
      );
      expect(results.size).toBe(2);
      expect(results.has("entity-1")).toBe(true);
      expect(results.has("entity-2")).toBe(true);
    });
  });

  describe("backward compatibility", () => {
    it("works without importanceDAO (metadata fallback)", async () => {
      const serviceWithoutDAO = new EntityImportanceService(
        mockEntityDAO as EntityDAO,
        mockCommunityDAO as CommunityDAO
      );

      const entity = {
        id: "entity-1",
        campaignId: "campaign-123",
        entityType: "npc",
        name: "Test Entity",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        metadata: {
          importanceScore: 70.0,
        },
      };

      (mockEntityDAO.getEntityById as any).mockResolvedValue(entity);

      const result = await serviceWithoutDAO.getEntityImportance(
        "campaign-123",
        "entity-1"
      );

      expect(result).toBe(70.0);
      expect(mockEntityDAO.updateEntity).not.toHaveBeenCalled();
    });

    it("stores in metadata when importanceDAO not available", async () => {
      const serviceWithoutDAO = new EntityImportanceService(
        mockEntityDAO as EntityDAO,
        mockCommunityDAO as CommunityDAO
      );

      const entities = [
        {
          id: "entity-1",
          campaignId: "campaign-123",
          entityType: "npc",
          name: "Entity 1",
          createdAt: "2025-01-01T00:00:00Z",
          updatedAt: "2025-01-01T00:00:00Z",
          metadata: {},
        },
      ];

      (mockEntityDAO.listEntitiesByCampaign as any).mockResolvedValue(entities);

      await serviceWithoutDAO.recalculateImportanceForCampaign("campaign-123");

      expect(mockEntityDAO.updateEntity).toHaveBeenCalled();
      expect(mockEntityDAO.updateEntity).toHaveBeenCalledWith(
        "entity-1",
        expect.objectContaining({
          metadata: expect.objectContaining({
            importanceScore: expect.any(Number),
          }),
        })
      );
    });
  });
});
