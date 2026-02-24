import { describe, it, expect, beforeEach, vi } from "vitest";
import { CampaignShareLinkDAO } from "@/dao/campaign-share-link-dao";
import type { D1Database } from "@cloudflare/workers-types";

function createMockStmt() {
  return {
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue({}),
    // hasTable uses queryAll; CampaignShareLinkDAO only calls all() for hasTable
    all: vi
      .fn()
      .mockResolvedValue({ results: [{ name: "campaign_share_links" }] }),
    first: vi.fn().mockResolvedValue(null),
  };
}

describe("CampaignShareLinkDAO", () => {
  let dao: CampaignShareLinkDAO;
  let mockDB: D1Database;
  let mockStmt: ReturnType<typeof createMockStmt>;

  beforeEach(() => {
    mockStmt = createMockStmt();
    mockDB = {
      prepare: vi.fn().mockReturnValue(mockStmt),
    } as unknown as D1Database;
    dao = new CampaignShareLinkDAO(mockDB);
  });

  it("createShareLink calls execute with correct params", async () => {
    await dao.createShareLink(
      "token-123",
      "camp-1",
      "readonly_player",
      "owner1",
      new Date("2025-12-31"),
      10
    );

    expect(mockDB.prepare).toHaveBeenCalledWith(
      expect.stringContaining("insert into campaign_share_links")
    );
    expect(mockStmt.run).toHaveBeenCalled();
  });

  it("getShareLink returns null when not found", async () => {
    mockStmt.first.mockResolvedValue(null);

    const result = await dao.getShareLink("bad-token");

    expect(result).toBeNull();
    expect(mockStmt.bind).toHaveBeenCalledWith("bad-token");
  });

  it("getShareLink returns link when found", async () => {
    const row = {
      token: "t1",
      campaign_id: "c1",
      role: "editor_player",
      created_by: "u1",
      expires_at: null,
      max_uses: 5,
      use_count: 2,
      created_at: "2024-01-01T00:00:00Z",
    };
    mockStmt.first.mockResolvedValue(row);

    const result = await dao.getShareLink("t1");

    expect(result).not.toBeNull();
    expect(result?.token).toBe("t1");
    expect(result?.campaign_id).toBe("c1");
    expect(result?.role).toBe("editor_player");
  });

  it("redeemShareLink returns null for expired link", async () => {
    mockStmt.first.mockResolvedValue({
      token: "t1",
      campaign_id: "c1",
      role: "readonly_player",
      expires_at: "2020-01-01T00:00:00Z",
      max_uses: null,
      use_count: 0,
    });

    const result = await dao.redeemShareLink("t1", "user1");

    expect(result).toBeNull();
  });

  it("redeemShareLink returns campaign and role when valid", async () => {
    mockStmt.first
      .mockResolvedValueOnce({
        token: "t1",
        campaign_id: "c1",
        role: "editor_player",
        expires_at: null,
        max_uses: null,
        use_count: 0,
      })
      .mockResolvedValueOnce(null);

    const result = await dao.redeemShareLink("t1", "user1");

    expect(result).toEqual({ campaignId: "c1", role: "editor_player" });
  });
});
