import type { D1Database } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockWorldStateService = {
  recordChangelog: vi.fn(),
  listChangelogs: vi.fn(),
};

vi.mock("@/dao/dao-factory", () => ({
  getDAOFactory: vi.fn(),
}));

vi.mock("@/services/graph/world-state-changelog-service", () => ({
  WorldStateChangelogService: vi
    .fn()
    .mockImplementation(() => mockWorldStateService),
}));

import { getDAOFactory } from "@/dao/dao-factory";
import {
  handleCreateWorldStateChangelog,
  handleGetWorldStateOverlay,
  handleListWorldStateChangelog,
} from "@/routes/world-state";

const mockCampaignDAO = {
  getCampaignByIdWithMapping: vi.fn(),
};

(getDAOFactory as any).mockReturnValue({
  campaignDAO: mockCampaignDAO,
});

function createContext({
  campaignId = "campaign-1",
  body = {},
  query = {},
  user = { username: "gm-user" },
}: {
  campaignId?: string;
  body?: Record<string, any>;
  query?: Record<string, string | undefined>;
  user?: { username: string };
} = {}) {
  const json = vi.fn().mockImplementation((payload) => payload);
  return {
    req: {
      param: vi
        .fn()
        .mockImplementation((key: string) =>
          key === "campaignId" ? campaignId : undefined
        ),
      json: vi.fn().mockResolvedValue(body),
      query: vi.fn().mockImplementation((key: string) => query[key]),
    },
    json,
    env: { DB: {} as D1Database },
    userAuth: user,
    get: vi.fn().mockReturnValue(user),
  } as any;
}

describe("world state routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCampaignDAO.getCampaignByIdWithMapping.mockResolvedValue({
      campaignId: "campaign-1",
    });
  });

  it("creates a changelog entry when campaign access is granted", async () => {
    mockWorldStateService.recordChangelog.mockResolvedValue({
      id: "entry-1",
    });

    const ctx = createContext({
      body: {
        campaign_session_id: 1,
        timestamp: "2025-01-01T00:00:00Z",
        entity_updates: [],
      },
    });

    const result = await handleCreateWorldStateChangelog(ctx);

    expect(mockWorldStateService.recordChangelog).toHaveBeenCalledWith(
      "campaign-1",
      expect.objectContaining({ campaign_session_id: 1 })
    );
    expect(ctx.json).toHaveBeenCalledWith({ entry: { id: "entry-1" } }, 201);
    expect(result).toEqual({ entry: { id: "entry-1" } });
  });

  it("returns 404 when the campaign is inaccessible", async () => {
    mockCampaignDAO.getCampaignByIdWithMapping.mockResolvedValue(null);
    const ctx = createContext();

    await handleCreateWorldStateChangelog(ctx);

    expect(ctx.json).toHaveBeenCalledWith({ error: "Campaign not found" }, 404);
    expect(mockWorldStateService.recordChangelog).not.toHaveBeenCalled();
  });

  it("lists changelog entries with query filters", async () => {
    mockWorldStateService.listChangelogs.mockResolvedValue([{ id: "entry-2" }]);

    const ctx = createContext({
      query: {
        campaign_session_id: "7",
        from: "2025-01-01T00:00:00Z",
        to: "2025-02-01T00:00:00Z",
        applied: "false",
        limit: "5",
        offset: "10",
      },
    });

    const result = await handleListWorldStateChangelog(ctx);

    expect(mockWorldStateService.listChangelogs).toHaveBeenCalledWith(
      "campaign-1",
      expect.objectContaining({
        campaignSessionId: 7,
        fromTimestamp: "2025-01-01T00:00:00Z",
        toTimestamp: "2025-02-01T00:00:00Z",
        appliedToGraph: false,
        limit: 5,
        offset: 10,
      })
    );
    expect(ctx.json).toHaveBeenCalledWith({ entries: [{ id: "entry-2" }] });
    expect(result).toEqual({ entries: [{ id: "entry-2" }] });
  });

  it("returns overlay data up to a timestamp", async () => {
    mockWorldStateService.listChangelogs.mockResolvedValue([{ id: "entry-3" }]);

    const ctx = createContext({
      query: { timestamp: "2025-03-01T00:00:00Z" },
    });

    const result = await handleGetWorldStateOverlay(ctx);

    expect(mockWorldStateService.listChangelogs).toHaveBeenCalledWith(
      "campaign-1",
      { toTimestamp: "2025-03-01T00:00:00Z" }
    );
    expect(ctx.json).toHaveBeenCalledWith({
      overlayTimestamp: "2025-03-01T00:00:00Z",
      changelog: [{ id: "entry-3" }],
    });
    expect(result).toEqual({
      overlayTimestamp: "2025-03-01T00:00:00Z",
      changelog: [{ id: "entry-3" }],
    });
  });
});
