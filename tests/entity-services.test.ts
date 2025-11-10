import { describe, expect, it, vi, beforeAll } from "vitest";
import { EntityExtractionService } from "@/services/rag/entity-extraction-service";
import { EntityDeduplicationService } from "@/services/rag/entity-deduplication-service";
import type { Entity } from "@/dao/entity-dao";
import type { EntityDAO } from "@/dao/entity-dao";
import type { EntityEmbeddingService } from "@/services/vectorize/entity-embedding-service";

beforeAll(() => {
  if (
    !globalThis.crypto ||
    typeof globalThis.crypto.randomUUID !== "function"
  ) {
    (globalThis as any).crypto = {
      ...(globalThis.crypto || {}),
      randomUUID: () => "00000000-0000-0000-0000-000000000000",
    };
  }
});

describe("EntityExtractionService", () => {
  it("parses structured content into extracted entities", async () => {
    const mockResponse = JSON.stringify({
      meta: {},
      npcs: [
        {
          id: "npc-1",
          name: "Aria Fenwick",
          summary: "A keen-eyed scout.",
          relations: [{ rel: "ally", target_id: "npc-2" }],
        },
      ],
      custom: [],
    });

    const env = {
      AI: {
        run: vi.fn().mockResolvedValue(mockResponse),
      },
    };

    const service = new EntityExtractionService(env);
    const results = await service.extractEntities({
      campaignId: "campaign-123",
      sourceId: "context-1",
      sourceType: "campaign_context",
      sourceName: "Chapter 1",
      content: "Aria Fenwick the scout is introduced.",
    });

    expect(results).toHaveLength(1);
    const entity = results[0];
    expect(entity.id).toBe("npc-1");
    expect(entity.entityType).toBe("npcs");
    expect(entity.name).toBe("Aria Fenwick");
    expect(entity.metadata.sourceType).toBe("campaign_context");
    expect(entity.relations[0]).toEqual({
      relationshipType: "ally",
      targetId: "npc-2",
      metadata: undefined,
    });
  });
});

describe("EntityDeduplicationService", () => {
  it("identifies high-confidence duplicates and queues medium-confidence entries", async () => {
    const mockEntity = (id: string): Entity => ({
      id,
      campaignId: "campaign-123",
      entityType: "npcs",
      name: `Entity ${id}`,
      content: { id },
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const entityDAO = {
      getEntityById: vi
        .fn()
        .mockImplementation(async (id: string) => mockEntity(id)),
      createDeduplicationEntry: vi.fn().mockResolvedValue(undefined),
      listDeduplicationEntries: vi.fn().mockResolvedValue([]),
      updateDeduplicationEntry: vi.fn().mockResolvedValue(undefined),
    } as unknown as EntityDAO;

    const embeddingService = {
      findSimilarByEntityId: vi.fn().mockResolvedValue([
        {
          entityId: "duplicate-high",
          score: 0.95,
          metadata: { campaignId: "campaign-123", entityType: "npcs" },
        },
        {
          entityId: "duplicate-medium",
          score: 0.82,
          metadata: { campaignId: "campaign-123", entityType: "npcs" },
        },
      ]),
    } as unknown as EntityEmbeddingService;

    const dedupeService = new EntityDeduplicationService(
      entityDAO,
      embeddingService,
      {
        highConfidenceThreshold: 0.9,
        lowConfidenceThreshold: 0.75,
      }
    );

    const result = await dedupeService.evaluateEntity(
      "campaign-123",
      "entity-new",
      "npcs"
    );

    expect(result.highConfidenceMatches).toHaveLength(1);
    expect(result.highConfidenceMatches[0].entity.id).toBe("duplicate-high");
    expect(entityDAO.createDeduplicationEntry).toHaveBeenCalledTimes(1);
    expect(result.pendingEntryId).toBeDefined();
  });
});
