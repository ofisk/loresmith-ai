import { describe, it, expect, beforeEach, vi } from "vitest";
import { EntityDAO } from "@/dao/entity-dao";
import type { D1Database } from "@cloudflare/workers-types";
import type { EntityRecord } from "@/dao/entity-dao";

function createMockStmt() {
  return {
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue({}),
    all: vi.fn().mockResolvedValue({ results: [] }),
    first: vi.fn().mockResolvedValue(null),
  };
}

describe("EntityDAO", () => {
  let dao: EntityDAO;
  let mockDB: D1Database;
  let mockStmt: ReturnType<typeof createMockStmt>;

  beforeEach(() => {
    mockStmt = createMockStmt();
    mockDB = {
      prepare: vi.fn().mockReturnValue(mockStmt),
    } as unknown as D1Database;
    dao = new EntityDAO(mockDB);
  });

  it("createEntity calls execute with correct params", async () => {
    await dao.createEntity({
      id: "e1",
      campaignId: "c1",
      entityType: "npc",
      name: "Gandalf",
      content: { description: "A wizard" },
    });

    expect(mockDB.prepare).toHaveBeenCalled();
    expect(mockStmt.bind).toHaveBeenCalledWith(
      "e1",
      "c1",
      "npc",
      "Gandalf",
      expect.any(String),
      null,
      null,
      null,
      null,
      null
    );
    expect(mockStmt.run).toHaveBeenCalled();
  });

  it("getEntityById returns null when no row", async () => {
    mockStmt.first.mockResolvedValue(null);

    const result = await dao.getEntityById("e1");

    expect(result).toBeNull();
    expect(mockStmt.bind).toHaveBeenCalledWith("e1");
  });

  it("getEntityById returns mapped entity when row exists", async () => {
    const row: EntityRecord = {
      id: "e1",
      campaign_id: "c1",
      entity_type: "npc",
      name: "Gandalf",
      content: JSON.stringify({ description: "A wizard" }),
      metadata: null,
      confidence: null,
      source_type: null,
      source_id: null,
      embedding_id: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };
    mockStmt.first.mockResolvedValue(row);

    const result = await dao.getEntityById("e1");

    expect(result).not.toBeNull();
    expect(result?.id).toBe("e1");
    expect(result?.campaignId).toBe("c1");
    expect(result?.entityType).toBe("npc");
    expect(result?.name).toBe("Gandalf");
    expect(result?.content).toEqual({ description: "A wizard" });
  });

  it("listEntitiesByCampaign uses limit and offset", async () => {
    mockStmt.all.mockResolvedValue({ results: [] });

    await dao.listEntitiesByCampaign("c1", { limit: 10, offset: 5 });

    expect(mockDB.prepare).toHaveBeenCalledWith(
      expect.stringContaining("LIMIT ?")
    );
    expect(mockStmt.bind).toHaveBeenCalledWith("c1", 10, 5);
  });

  it("listEntitiesByCampaign filters by entityType when provided", async () => {
    mockStmt.all.mockResolvedValue({ results: [] });

    await dao.listEntitiesByCampaign("c1", { entityType: "location" });

    expect(mockDB.prepare).toHaveBeenCalledWith(
      expect.stringContaining("entity_type")
    );
    expect(mockStmt.bind).toHaveBeenCalledWith("c1", "location");
  });

  it("getEntitiesByIds returns empty array for empty input", async () => {
    const result = await dao.getEntitiesByIds([]);
    expect(result).toEqual([]);
    expect(mockDB.prepare).not.toHaveBeenCalled();
  });
});
