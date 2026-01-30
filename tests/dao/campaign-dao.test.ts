import { describe, it, expect, beforeEach, vi } from "vitest";
import { CampaignDAO } from "@/dao/campaign-dao";
import type { D1Database } from "@cloudflare/workers-types";

function createMockStmt() {
  return {
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue({}),
    all: vi.fn().mockResolvedValue({ results: [] }),
    first: vi.fn().mockResolvedValue(null),
  };
}

describe("CampaignDAO", () => {
  let dao: CampaignDAO;
  let mockDB: D1Database;
  let mockStmt: ReturnType<typeof createMockStmt>;

  beforeEach(() => {
    mockStmt = createMockStmt();
    mockDB = {
      prepare: vi.fn().mockReturnValue(mockStmt),
    } as unknown as D1Database;
    dao = new CampaignDAO(mockDB);
  });

  it("createCampaign calls execute with correct params", async () => {
    await dao.createCampaign("camp-1", "My Campaign", "user1", "A great game");

    expect(mockDB.prepare).toHaveBeenCalledWith(
      expect.stringContaining("insert into campaigns")
    );
    expect(mockStmt.bind).toHaveBeenCalledWith(
      "camp-1",
      "My Campaign",
      "user1",
      "A great game",
      undefined
    );
    expect(mockStmt.run).toHaveBeenCalled();
  });

  it("getCampaignsByUser returns empty array when no campaigns", async () => {
    mockStmt.all.mockResolvedValue({ results: [] });

    const result = await dao.getCampaignsByUser("user1");

    expect(result).toEqual([]);
    expect(mockStmt.bind).toHaveBeenCalledWith("user1");
  });

  it("getCampaignsByUser returns campaigns from results", async () => {
    const rows = [
      {
        id: "c1",
        name: "Campaign One",
        username: "user1",
        description: "First",
        campaignRagBasePath: null,
        metadata: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      },
    ];
    mockStmt.all.mockResolvedValue({ results: rows });

    const result = await dao.getCampaignsByUser("user1");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("c1");
    expect(result[0].name).toBe("Campaign One");
  });

  it("getCampaignByIdWithMapping returns null when no row", async () => {
    mockStmt.first.mockResolvedValue(null);

    const result = await dao.getCampaignByIdWithMapping("c1", "user1");

    expect(result).toBeNull();
    expect(mockStmt.bind).toHaveBeenCalledWith("c1", "user1");
  });

  it("getCampaignByIdWithMapping returns mapped campaign when found", async () => {
    const row = {
      campaignId: "c1",
      name: "My Campaign",
      description: "Desc",
      campaignRagBasePath: "/rag",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      metadata: null,
    };
    mockStmt.first.mockResolvedValue(row);

    const result = await dao.getCampaignByIdWithMapping("c1", "user1");

    expect(result).not.toBeNull();
    expect(result?.campaignId).toBe("c1");
    expect(result?.name).toBe("My Campaign");
  });
});
