import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/toolAuth", () => ({
  authenticatedFetch: vi.fn(),
  handleAuthError: vi.fn(),
}));

import {
  recordWorldEventTool,
  updateEntityWorldStateTool,
  updateRelationshipWorldStateTool,
} from "@/tools/campaign-context/world-state-tools";
import { authenticatedFetch, handleAuthError } from "@/lib/toolAuth";

const makeResponse = (data: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: vi.fn().mockResolvedValue(data),
});

describe("world state tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records a world event with combined updates", async () => {
    (authenticatedFetch as any).mockResolvedValue(
      makeResponse({ entry: { id: "entry-1" } })
    );

    const result = await recordWorldEventTool.execute(
      {
        campaignId: "campaign-1",
        campaignSessionId: 3,
        timestamp: "2025-01-01T00:00:00Z",
        entityUpdates: [{ entityId: "npc-1", status: "missing" }],
        newEntities: [{ entityId: "npc-2", name: "New Ally" }],
        jwt: "test-jwt",
      },
      { toolCallId: "call-1", messages: [] }
    );

    expect(authenticatedFetch).toHaveBeenCalledWith(
      expect.stringContaining("/world-state/changelog"),
      expect.objectContaining({
        method: "POST",
        jwt: "test-jwt",
        body: expect.stringContaining('"entity_updates"'),
      })
    );
    expect(result.result.success).toBe(true);
  });

  it("updates a single entity status", async () => {
    (authenticatedFetch as any).mockResolvedValue(
      makeResponse({ entry: { id: "entry-2" } })
    );

    const result = await updateEntityWorldStateTool.execute(
      {
        campaignId: "campaign-1",
        entityId: "npc-9",
        status: "destroyed",
        description: "The tower collapsed.",
        jwt: "jwt",
      },
      { toolCallId: "call-entity", messages: [] }
    );

    expect(authenticatedFetch).toHaveBeenCalled();
    expect(result.result.success).toBe(true);
    const payload = JSON.parse(
      (authenticatedFetch as any).mock.calls[0][1].body as string
    );
    expect(payload.entity_updates[0]).toMatchObject({
      entity_id: "npc-9",
      status: "destroyed",
    });
  });

  it("reports API authentication errors for relationship updates", async () => {
    (authenticatedFetch as any).mockResolvedValue(makeResponse({}, false, 401));
    (handleAuthError as any).mockReturnValue("Auth failed");

    const result = await updateRelationshipWorldStateTool.execute(
      {
        campaignId: "campaign-1",
        fromEntityId: "npc-1",
        toEntityId: "npc-2",
        newStatus: "hostile",
        jwt: "jwt",
      },
      { toolCallId: "call-rel", messages: [] }
    );

    expect(handleAuthError).toHaveBeenCalled();
    expect(result.result.success).toBe(false);
    expect(result.result.message).toBe("Auth failed");
  });
});
