import type { D1Database } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EntityImportanceDAO } from "@/dao/entity-importance-dao";

const mockDB = {
  prepare: vi.fn(),
} as unknown as D1Database;

describe("EntityImportanceDAO", () => {
  let dao: EntityImportanceDAO;
  let mockStatement: {
    bind: ReturnType<typeof vi.fn>;
    run: ReturnType<typeof vi.fn>;
    all: ReturnType<typeof vi.fn>;
    first: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStatement = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn(),
      all: vi.fn(),
      first: vi.fn(),
    };
    (mockDB.prepare as any).mockReturnValue(mockStatement);
    dao = new EntityImportanceDAO(mockDB);
  });

  it("upserts importance data", async () => {
    await dao.upsertImportance({
      entityId: "entity-1",
      campaignId: "campaign-123",
      pagerank: 0.5,
      betweennessCentrality: 0.3,
      hierarchyLevel: 75,
      importanceScore: 65.0,
    });

    expect(mockDB.prepare).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO entity_importance")
    );
    expect(mockStatement.bind).toHaveBeenCalledWith(
      "entity-1",
      "campaign-123",
      0.5,
      0.3,
      75,
      65.0
    );
    expect(mockStatement.run).toHaveBeenCalled();
  });

  it("gets importance for an entity", async () => {
    const record = {
      entity_id: "entity-1",
      campaign_id: "campaign-123",
      pagerank: 0.5,
      betweenness_centrality: 0.3,
      hierarchy_level: 75,
      importance_score: 65.0,
      computed_at: "2025-01-01T00:00:00Z",
    };

    mockStatement.first.mockResolvedValue(record);

    const importance = await dao.getImportance("entity-1");

    expect(mockDB.prepare).toHaveBeenCalledWith(
      expect.stringContaining("SELECT * FROM entity_importance")
    );
    expect(mockStatement.bind).toHaveBeenCalledWith("entity-1");
    expect(importance).toMatchObject({
      entityId: "entity-1",
      campaignId: "campaign-123",
      pagerank: 0.5,
      betweennessCentrality: 0.3,
      hierarchyLevel: 75,
      importanceScore: 65.0,
      computedAt: "2025-01-01T00:00:00Z",
    });
  });

  it("returns null when importance not found", async () => {
    mockStatement.first.mockResolvedValue(null);

    const importance = await dao.getImportance("entity-1");

    expect(importance).toBeNull();
  });

  it("gets importance for campaign with options", async () => {
    const records = [
      {
        entity_id: "entity-1",
        campaign_id: "campaign-123",
        pagerank: 0.8,
        betweenness_centrality: 0.6,
        hierarchy_level: 90,
        importance_score: 80.0,
        computed_at: "2025-01-01T00:00:00Z",
      },
      {
        entity_id: "entity-2",
        campaign_id: "campaign-123",
        pagerank: 0.5,
        betweenness_centrality: 0.3,
        hierarchy_level: 75,
        importance_score: 65.0,
        computed_at: "2025-01-01T00:00:00Z",
      },
    ];

    mockStatement.all.mockResolvedValue({ results: records });

    const importanceList = await dao.getImportanceForCampaign("campaign-123", {
      limit: 10,
      minScore: 60.0,
    });

    expect(mockDB.prepare).toHaveBeenCalledWith(
      expect.stringContaining("WHERE campaign_id = ?")
    );
    expect(mockStatement.bind).toHaveBeenCalledWith("campaign-123", 60.0, 10);
    expect(importanceList).toHaveLength(2);
    expect(importanceList[0].importanceScore).toBe(80.0);
    expect(importanceList[1].importanceScore).toBe(65.0);
  });

  it("gets top entities by importance", async () => {
    const records = [
      {
        entity_id: "entity-1",
        campaign_id: "campaign-123",
        pagerank: 0.8,
        betweenness_centrality: 0.6,
        hierarchy_level: 90,
        importance_score: 80.0,
        computed_at: "2025-01-01T00:00:00Z",
      },
    ];

    mockStatement.all.mockResolvedValue({ results: records });

    const topEntities = await dao.getTopEntitiesByImportance("campaign-123", 5);

    expect(mockDB.prepare).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY importance_score DESC")
    );
    expect(mockStatement.bind).toHaveBeenCalledWith("campaign-123", 5);
    expect(topEntities).toHaveLength(1);
  });

  it("deletes importance for an entity", async () => {
    await dao.deleteImportance("entity-1");

    expect(mockDB.prepare).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM entity_importance")
    );
    expect(mockStatement.bind).toHaveBeenCalledWith("entity-1");
    expect(mockStatement.run).toHaveBeenCalled();
  });

  it("deletes importance for a campaign", async () => {
    await dao.deleteImportanceForCampaign("campaign-123");

    expect(mockDB.prepare).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM entity_importance")
    );
    expect(mockStatement.bind).toHaveBeenCalledWith("campaign-123");
    expect(mockStatement.run).toHaveBeenCalled();
  });
});
