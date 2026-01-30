import type { D1Database } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/dao/dao-factory", () => ({
  getDAOFactory: vi.fn(),
}));

import { getDAOFactory } from "@/dao/dao-factory";
import { handleGetGraphVisualization } from "@/routes/graph-visualization";

const mockCampaignDAO = {
  getCampaignById: vi.fn(),
};
const mockCommunityDAO = {
  listCommunitiesByCampaign: vi.fn(),
};
const mockEntityDAO = {
  listEntitiesByCampaign: vi.fn(),
  getRelationshipsForEntities: vi.fn(),
};

(getDAOFactory as ReturnType<typeof vi.fn>).mockReturnValue({
  campaignDAO: mockCampaignDAO,
  communityDAO: mockCommunityDAO,
  entityDAO: mockEntityDAO,
  communitySummaryDAO: null,
});

function createContext(
  params: {
    campaignId?: string;
    userAuth?: { username: string } | null;
  } = {}
) {
  const { campaignId = "campaign-1", userAuth = { username: "user1" } } =
    params;
  const json = vi.fn().mockImplementation((payload: unknown) => payload);
  return {
    req: {
      param: vi
        .fn()
        .mockImplementation((key: string) =>
          key === "campaignId" ? campaignId : undefined
        ),
      query: vi.fn().mockImplementation((_key: string) => undefined),
    },
    json,
    env: { DB: {} as D1Database },
    userAuth,
  } as Parameters<typeof handleGetGraphVisualization>[0];
}

describe("graph-visualization routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCampaignDAO.getCampaignById.mockResolvedValue({
      id: "campaign-1",
      username: "user1",
    });
    mockCommunityDAO.listCommunitiesByCampaign.mockResolvedValue([]);
    mockEntityDAO.listEntitiesByCampaign.mockResolvedValue([]);
    mockEntityDAO.getRelationshipsForEntities.mockResolvedValue(new Map());
  });

  it("returns 401 when userAuth is missing", async () => {
    const c = createContext({ userAuth: null });
    await handleGetGraphVisualization(c);
    expect(c.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Authentication required" }),
      401
    );
    expect(mockCampaignDAO.getCampaignById).not.toHaveBeenCalled();
  });

  it("returns 400 when campaignId is missing", async () => {
    const c = createContext({ campaignId: "" });
    (c.req.param as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    await handleGetGraphVisualization(c);
    expect(c.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Campaign ID required" }),
      400
    );
  });

  it("returns 404 when campaign not found or access denied", async () => {
    mockCampaignDAO.getCampaignById.mockResolvedValue(null);
    const c = createContext();
    await handleGetGraphVisualization(c);
    expect(c.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Campaign not found or access denied" }),
      404
    );
  });

  it("returns nodes and edges when campaign exists and user owns it", async () => {
    mockCampaignDAO.getCampaignById.mockResolvedValue({
      id: "campaign-1",
      username: "user1",
    });
    mockCommunityDAO.listCommunitiesByCampaign.mockResolvedValue([]);
    const c = createContext();
    await handleGetGraphVisualization(c);
    expect(c.json).toHaveBeenCalledWith(
      expect.objectContaining({
        nodes: [],
        edges: [],
      })
    );
  });
});
