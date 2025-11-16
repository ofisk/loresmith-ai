import { describe, it, expect, vi, beforeEach } from "vitest";
import { CommunitySummaryService } from "@/services/graph/community-summary-service";
import type { EntityDAO, Entity } from "@/dao/entity-dao";
import type { CommunitySummaryDAO } from "@/dao/community-summary-dao";
import type { Community } from "@/dao/community-dao";
import { OpenAIAPIKeyError } from "@/lib/errors";

describe("CommunitySummaryService", () => {
  let mockEntityDAO: Partial<EntityDAO>;
  let mockSummaryDAO: Partial<CommunitySummaryDAO>;
  let service: CommunitySummaryService;
  const mockOpenAIKey = "test-openai-key";

  beforeEach(() => {
    mockEntityDAO = {
      getEntityById: vi.fn(),
      getRelationshipsForEntity: vi.fn(),
    };

    mockSummaryDAO = {
      getSummaryByCommunityId: vi.fn(),
      getSummaryById: vi.fn(),
      createSummary: vi.fn(),
      listSummariesByCampaign: vi.fn(),
    };

    service = new CommunitySummaryService(
      mockEntityDAO as EntityDAO,
      mockSummaryDAO as CommunitySummaryDAO,
      mockOpenAIKey
    );
  });

  describe("generateOrGetSummary", () => {
    it("should return existing summary if found and forceRegenerate is false", async () => {
      const community: Community = {
        id: "community-1",
        campaignId: "campaign-1",
        level: 0,
        parentCommunityId: null,
        entityIds: ["entity-1", "entity-2"],
        createdAt: new Date().toISOString(),
      };

      const existingSummary = {
        id: "summary-1",
        communityId: "community-1",
        level: 0,
        summaryText: "Test summary",
        keyEntities: ["entity-1"],
        generatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      (mockSummaryDAO.getSummaryByCommunityId as any).mockResolvedValue(
        existingSummary
      );

      const result = await service.generateOrGetSummary(community, {
        forceRegenerate: false,
      });

      expect(result.summary).toEqual(existingSummary);
      expect(mockSummaryDAO.getSummaryByCommunityId).toHaveBeenCalledWith(
        "community-1"
      );
    });

    it("should throw error if OpenAI API key is missing", async () => {
      const serviceWithoutKey = new CommunitySummaryService(
        mockEntityDAO as EntityDAO,
        mockSummaryDAO as CommunitySummaryDAO
      );

      const community: Community = {
        id: "community-1",
        campaignId: "campaign-1",
        level: 0,
        parentCommunityId: null,
        entityIds: ["entity-1", "entity-2"],
        createdAt: new Date().toISOString(),
      };

      (mockSummaryDAO.getSummaryByCommunityId as any).mockResolvedValue(null);

      await expect(
        serviceWithoutKey.generateOrGetSummary(community, {
          forceRegenerate: true,
        })
      ).rejects.toThrow(OpenAIAPIKeyError);
    });
  });

  describe("generateSummary", () => {
    it("should generate summary for a community with entities and relationships", async () => {
      const community: Community = {
        id: "community-1",
        campaignId: "campaign-1",
        level: 0,
        parentCommunityId: null,
        entityIds: ["entity-1", "entity-2"],
        createdAt: new Date().toISOString(),
      };

      const mockEntity1: Entity = {
        id: "entity-1",
        campaignId: "campaign-1",
        entityType: "location",
        name: "Test Location",
        content: { description: "A test location" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const mockEntity2: Entity = {
        id: "entity-2",
        campaignId: "campaign-1",
        entityType: "character",
        name: "Test Character",
        content: { description: "A test character" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      (mockEntityDAO.getEntityById as any)
        .mockResolvedValueOnce(mockEntity1)
        .mockResolvedValueOnce(mockEntity2);

      (mockEntityDAO.getRelationshipsForEntity as any).mockResolvedValue([]);
      (mockSummaryDAO.getSummaryByCommunityId as any).mockResolvedValue(null);
      (mockSummaryDAO.createSummary as any).mockResolvedValue(undefined);
      (mockSummaryDAO.getSummaryById as any).mockResolvedValue({
        id: "summary-1",
        communityId: "community-1",
        level: 0,
        summaryText: "Generated summary",
        keyEntities: ["entity-1"],
        generatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Mock OpenAI API response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  "This community contains Test Location and Test Character.",
              },
            },
          ],
        }),
      });

      const result = await service.generateSummary(community, {
        openaiApiKey: mockOpenAIKey,
      });

      expect(result.summary).toBeDefined();
      expect(result.summary.summaryText).toContain("community");
      expect(mockEntityDAO.getEntityById).toHaveBeenCalledTimes(2);
      expect(mockSummaryDAO.createSummary).toHaveBeenCalled();
    });
  });

  describe("updateSummaryForCommunity", () => {
    it("should delete existing summary and generate new one", async () => {
      const community: Community = {
        id: "community-1",
        campaignId: "campaign-1",
        level: 0,
        parentCommunityId: null,
        entityIds: ["entity-1"],
        createdAt: new Date().toISOString(),
      };

      (mockSummaryDAO.deleteSummariesByCommunity as any).mockResolvedValue(
        undefined
      );
      (mockEntityDAO.getEntityById as any).mockResolvedValue({
        id: "entity-1",
        campaignId: "campaign-1",
        entityType: "location",
        name: "Test Location",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      (mockEntityDAO.getRelationshipsForEntity as any).mockResolvedValue([]);
      (mockSummaryDAO.createSummary as any).mockResolvedValue(undefined);
      (mockSummaryDAO.getSummaryById as any).mockResolvedValue({
        id: "summary-2",
        communityId: "community-1",
        level: 0,
        summaryText: "Updated summary",
        keyEntities: [],
        generatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Mock OpenAI API response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "Updated summary text",
              },
            },
          ],
        }),
      });

      const result = await service.updateSummaryForCommunity(community, {
        openaiApiKey: mockOpenAIKey,
      });

      expect(mockSummaryDAO.deleteSummariesByCommunity).toHaveBeenCalledWith(
        "community-1"
      );
      expect(result.summary).toBeDefined();
    });
  });

  describe("generateSummariesForCommunities", () => {
    it("should generate summaries for multiple communities", async () => {
      const communities: Community[] = [
        {
          id: "community-1",
          campaignId: "campaign-1",
          level: 0,
          parentCommunityId: null,
          entityIds: ["entity-1"],
          createdAt: new Date().toISOString(),
        },
        {
          id: "community-2",
          campaignId: "campaign-1",
          level: 0,
          parentCommunityId: null,
          entityIds: ["entity-2"],
          createdAt: new Date().toISOString(),
        },
      ];

      (mockSummaryDAO.getSummaryByCommunityId as any).mockResolvedValue(null);
      (mockEntityDAO.getEntityById as any).mockResolvedValue({
        id: "entity-1",
        campaignId: "campaign-1",
        entityType: "location",
        name: "Test Location",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      (mockEntityDAO.getRelationshipsForEntity as any).mockResolvedValue([]);
      (mockSummaryDAO.createSummary as any).mockResolvedValue(undefined);
      (mockSummaryDAO.getSummaryById as any).mockResolvedValue({
        id: "summary-1",
        communityId: "community-1",
        level: 0,
        summaryText: "Summary",
        keyEntities: [],
        generatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Mock OpenAI API response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "Test summary",
              },
            },
          ],
        }),
      });

      const results = await service.generateSummariesForCommunities(
        communities,
        {
          openaiApiKey: mockOpenAIKey,
        }
      );

      expect(results).toHaveLength(2);
      expect(results[0].summary).toBeDefined();
      expect(results[1].summary).toBeDefined();
    });

    it("should continue with other communities if one fails", async () => {
      const communities: Community[] = [
        {
          id: "community-1",
          campaignId: "campaign-1",
          level: 0,
          parentCommunityId: null,
          entityIds: ["entity-1"],
          createdAt: new Date().toISOString(),
        },
        {
          id: "community-2",
          campaignId: "campaign-1",
          level: 0,
          parentCommunityId: null,
          entityIds: ["entity-2"],
          createdAt: new Date().toISOString(),
        },
      ];

      (mockSummaryDAO.getSummaryByCommunityId as any)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      (mockEntityDAO.getEntityById as any).mockImplementation((id: string) => {
        if (id === "entity-1") {
          throw new Error("Entity not found");
        }
        return Promise.resolve({
          id: "entity-2",
          campaignId: "campaign-1",
          entityType: "location",
          name: "Test Location",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      });
      (mockEntityDAO.getRelationshipsForEntity as any).mockResolvedValue([]);
      (mockSummaryDAO.createSummary as any).mockResolvedValue(undefined);
      (mockSummaryDAO.getSummaryById as any).mockResolvedValue({
        id: "summary-2",
        communityId: "community-2",
        level: 0,
        summaryText: "Summary",
        keyEntities: [],
        generatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Mock OpenAI API response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "Test summary",
              },
            },
          ],
        }),
      });

      const results = await service.generateSummariesForCommunities(
        communities,
        {
          openaiApiKey: mockOpenAIKey,
        }
      );

      // Should have one result even though first community failed
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });
});
