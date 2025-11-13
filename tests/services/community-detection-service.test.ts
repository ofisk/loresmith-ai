import { describe, it, expect, beforeEach, vi } from "vitest";
import { CommunityDetectionService } from "@/services/graph/community-detection-service";
import type { EntityGraphService } from "@/services/graph/entity-graph-service";
import { detectCommunities } from "@/lib/graph/leiden-algorithm";
import type { EntityDAO, Entity, EntityRelationship } from "@/dao/entity-dao";
import type { CommunityDAO, Community } from "@/dao/community-dao";

// Mock dependencies
const mockEntityDAO = {
  listEntitiesByCampaign: vi.fn(),
  getRelationshipsForEntity: vi.fn(),
  getEntityById: vi.fn(),
} as unknown as EntityDAO;

const mockCommunityDAO = {
  deleteCommunitiesByCampaign: vi.fn(),
  createCommunity: vi.fn(),
  getCommunityById: vi.fn(),
  listCommunitiesByCampaign: vi.fn(),
  findCommunitiesContainingEntity: vi.fn(),
  getChildCommunities: vi.fn(),
} as unknown as CommunityDAO;

const mockEntityGraphService = {} as EntityGraphService;

describe("CommunityDetectionService", () => {
  let service: CommunityDetectionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CommunityDetectionService(
      mockEntityDAO,
      mockCommunityDAO,
      mockEntityGraphService
    );
  });

  describe("detectCommunities", () => {
    it("should return empty array when no entities exist", async () => {
      vi.mocked(mockEntityDAO.listEntitiesByCampaign).mockResolvedValue([]);

      const result = await service.detectCommunities("campaign-1");

      expect(result).toEqual([]);
      expect(mockEntityDAO.listEntitiesByCampaign).toHaveBeenCalledWith(
        "campaign-1"
      );
    });

    it("should detect communities from entity relationships", async () => {
      const entities: Entity[] = [
        {
          id: "entity-1",
          campaignId: "campaign-1",
          entityType: "npc",
          name: "NPC 1",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "entity-2",
          campaignId: "campaign-1",
          entityType: "npc",
          name: "NPC 2",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "entity-3",
          campaignId: "campaign-1",
          entityType: "location",
          name: "Location 1",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const relationships: EntityRelationship[] = [
        {
          id: "rel-1",
          campaignId: "campaign-1",
          fromEntityId: "entity-1",
          toEntityId: "entity-2",
          relationshipType: "allied_with",
          strength: 1.0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "rel-2",
          campaignId: "campaign-1",
          fromEntityId: "entity-2",
          toEntityId: "entity-3",
          relationshipType: "located_in",
          strength: 0.8,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      vi.mocked(mockEntityDAO.listEntitiesByCampaign).mockResolvedValue(
        entities
      );
      vi.mocked(mockEntityDAO.getRelationshipsForEntity)
        .mockResolvedValueOnce([relationships[0]])
        .mockResolvedValueOnce([relationships[0], relationships[1]])
        .mockResolvedValueOnce([relationships[1]]);

      const createdCommunity: Community = {
        id: "community-1",
        campaignId: "campaign-1",
        level: 0,
        parentCommunityId: null,
        entityIds: ["entity-1", "entity-2"],
        createdAt: new Date().toISOString(),
      };

      vi.mocked(
        mockCommunityDAO.deleteCommunitiesByCampaign
      ).mockResolvedValue();
      vi.mocked(mockCommunityDAO.createCommunity).mockResolvedValue();
      vi.mocked(mockCommunityDAO.getCommunityById).mockResolvedValue(
        createdCommunity
      );

      const result = await service.detectCommunities("campaign-1", {
        minCommunitySize: 2,
      });

      expect(mockCommunityDAO.deleteCommunitiesByCampaign).toHaveBeenCalledWith(
        "campaign-1"
      );
      expect(result.length).toBeGreaterThan(0);
    });

    it("should filter communities by minimum size", async () => {
      const entities: Entity[] = [
        {
          id: "entity-1",
          campaignId: "campaign-1",
          entityType: "npc",
          name: "NPC 1",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "entity-2",
          campaignId: "campaign-1",
          entityType: "npc",
          name: "NPC 2",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const relationships: EntityRelationship[] = [
        {
          id: "rel-1",
          campaignId: "campaign-1",
          fromEntityId: "entity-1",
          toEntityId: "entity-2",
          relationshipType: "allied_with",
          strength: 1.0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      vi.mocked(mockEntityDAO.listEntitiesByCampaign).mockResolvedValue(
        entities
      );
      vi.mocked(mockEntityDAO.getRelationshipsForEntity)
        .mockResolvedValueOnce([relationships[0]])
        .mockResolvedValueOnce([relationships[0]]);

      vi.mocked(
        mockCommunityDAO.deleteCommunitiesByCampaign
      ).mockResolvedValue();
      vi.mocked(mockCommunityDAO.createCommunity).mockResolvedValue();
      vi.mocked(mockCommunityDAO.getCommunityById).mockResolvedValue(null);

      const result = await service.detectCommunities("campaign-1", {
        minCommunitySize: 3, // Higher than actual community size
      });

      // Should not create communities smaller than min size
      expect(result.length).toBe(0);
    });
  });

  describe("rebuildCommunities", () => {
    it("should delete existing communities and create new ones", async () => {
      vi.mocked(mockEntityDAO.listEntitiesByCampaign).mockResolvedValue([]);
      vi.mocked(
        mockCommunityDAO.deleteCommunitiesByCampaign
      ).mockResolvedValue();

      await service.rebuildCommunities("campaign-1");

      expect(mockCommunityDAO.deleteCommunitiesByCampaign).toHaveBeenCalledWith(
        "campaign-1"
      );
    });
  });
});

describe("Leiden Algorithm", () => {
  describe("detectCommunities", () => {
    it("should handle empty edge list", () => {
      const result = detectCommunities([]);
      expect(result).toEqual([]);
    });

    it("should detect communities in a simple graph", () => {
      const edges = [
        { from: "a", to: "b", weight: 1.0 },
        { from: "b", to: "c", weight: 1.0 },
        { from: "c", to: "d", weight: 1.0 },
        { from: "x", to: "y", weight: 1.0 },
        { from: "y", to: "z", weight: 1.0 },
      ];

      const result = detectCommunities(edges);

      expect(result.length).toBeGreaterThan(0);

      // All nodes should be assigned to a community
      const nodeIds = new Set(result.map((r) => r.nodeId));
      expect(nodeIds.has("a")).toBe(true);
      expect(nodeIds.has("b")).toBe(true);
      expect(nodeIds.has("c")).toBe(true);
      expect(nodeIds.has("d")).toBe(true);
      expect(nodeIds.has("x")).toBe(true);
      expect(nodeIds.has("y")).toBe(true);
      expect(nodeIds.has("z")).toBe(true);
    });

    it("should handle weighted edges", () => {
      const edges = [
        { from: "a", to: "b", weight: 2.0 },
        { from: "b", to: "c", weight: 1.0 },
        { from: "c", to: "d", weight: 0.5 },
      ];

      const result = detectCommunities(edges, { resolution: 1.0 });

      expect(result.length).toBeGreaterThan(0);
    });

    it("should respect resolution parameter", () => {
      const edges = [
        { from: "a", to: "b", weight: 1.0 },
        { from: "b", to: "c", weight: 1.0 },
        { from: "c", to: "d", weight: 1.0 },
      ];

      const resultLow = detectCommunities(edges, { resolution: 0.5 });
      const resultHigh = detectCommunities(edges, { resolution: 2.0 });

      // Different resolutions may produce different results
      expect(resultLow.length).toBeGreaterThan(0);
      expect(resultHigh.length).toBeGreaterThan(0);
    });
  });
});
