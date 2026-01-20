import { describe, expect, it, vi, beforeAll } from "vitest";
import { EntityExtractionService } from "@/services/rag/entity-extraction-service";
import { EntityDeduplicationService } from "@/services/rag/entity-deduplication-service";
import { EntityGraphService } from "@/services/graph/entity-graph-service";
import type { Entity, EntityDAO } from "@/dao/entity-dao";
import type { EntityEmbeddingService } from "@/services/vectorize/entity-embedding-service";

// Mock LLM provider factory
vi.mock("@/services/llm/llm-provider-factory", () => ({
  createLLMProvider: vi.fn().mockReturnValue({
    generateStructuredOutput: vi.fn().mockResolvedValue({
      meta: {
        source: {
          doc: "Chapter 1",
        },
      },
      npcs: [
        {
          id: "npc-1",
          name: "Aria Fenwick",
          summary: "A keen-eyed scout.",
          relations: [{ rel: "ally", target_id: "npc-2" }],
        },
      ],
      monsters: [],
      spells: [],
      items: [],
      traps: [],
      hazards: [],
      conditions: [],
      vehicles: [],
      env_effects: [],
      hooks: [],
      plot_lines: [],
      quests: [],
      scenes: [],
      locations: [],
      lairs: [],
      factions: [],
      deities: [],
      backgrounds: [],
      feats: [],
      subclasses: [],
      rules: [],
      downtime: [],
      tables: [],
      encounter_tables: [],
      treasure_tables: [],
      maps: [],
      handouts: [],
      puzzles: [],
      timelines: [],
      travel: [],
      custom: [],
    }),
  }),
}));

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
    // Entity IDs are normalized to include campaign ID prefix
    expect(entity.id).toBe("campaign-123_npc-1");
    expect(entity.entityType).toBe("npcs");
    expect(entity.name).toBe("Aria Fenwick");
    expect(entity.metadata.sourceType).toBe("campaign_context");
    expect(entity.relations[0]).toEqual({
      relationshipType: "allied_with",
      targetId: "npc-2",
      metadata: undefined,
      strength: null,
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
      getEntitiesByIds: vi
        .fn()
        .mockImplementation(async (ids: string[]) =>
          ids.map((id) => mockEntity(id))
        ),
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

describe("EntityGraphService", () => {
  const baseEntity: Entity = {
    id: "entity-1",
    campaignId: "campaign-123",
    entityType: "npcs",
    name: "Entity 1",
    content: {},
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const createMockDAO = () => {
    const entityDAO = {
      getEntityById: vi.fn().mockImplementation(async (id: string) => ({
        ...baseEntity,
        id,
        name: `Entity ${id}`,
      })),
      getEntitiesByIds: vi.fn().mockImplementation(async (ids: string[]) =>
        ids.map((id) => ({
          ...baseEntity,
          id,
          name: `Entity ${id}`,
        }))
      ),
      upsertRelationship: vi
        .fn()
        .mockImplementation(
          async (input: Parameters<EntityDAO["upsertRelationship"]>[0]) => ({
            id: `rel-${input.fromEntityId}-${input.toEntityId}`,
            campaignId: input.campaignId,
            fromEntityId: input.fromEntityId,
            toEntityId: input.toEntityId,
            relationshipType: input.relationshipType,
            strength: input.strength ?? null,
            metadata: input.metadata,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
        ),
      deleteRelationship: vi.fn().mockResolvedValue(undefined),
      deleteRelationshipByCompositeKey: vi.fn().mockResolvedValue(undefined),
      getRelationshipsForEntity: vi.fn().mockResolvedValue([
        {
          id: "rel-1",
          campaignId: "campaign-123",
          fromEntityId: "entity-1",
          toEntityId: "entity-2",
          relationshipType: "allied_with",
          strength: 0.8,
          metadata: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]),
      getRelationshipNeighborhood: vi.fn().mockResolvedValue([
        {
          entityId: "entity-2",
          depth: 1,
          relationshipType: "allied_with",
          name: "Entity entity-2",
          entityType: "npcs",
        },
      ]),
    } as unknown as EntityDAO;

    return entityDAO;
  };

  it("creates bidirectional edges for symmetric relationship types", async () => {
    const entityDAO = createMockDAO();
    const service = new EntityGraphService(entityDAO);

    const edges = await service.upsertEdge({
      campaignId: "campaign-123",
      fromEntityId: "entity-1",
      toEntityId: "entity-2",
      relationshipType: "ally",
      strength: 85,
      metadata: { context: "battle" },
    });

    expect(edges).toHaveLength(2);
    expect(entityDAO.upsertRelationship).toHaveBeenCalledTimes(2);
    expect(entityDAO.upsertRelationship).toHaveBeenCalledWith(
      expect.objectContaining({
        relationshipType: "allied_with",
        strength: 0.85,
      })
    );
    expect(edges[0].relationshipType).toBe("allied_with");
    expect(edges[1].fromEntityId).toBe("entity-2");
    expect(edges[1].toEntityId).toBe("entity-1");
  });

  it("retrieves relationships filtered by type", async () => {
    const entityDAO = createMockDAO();
    const service = new EntityGraphService(entityDAO);

    const relationships = await service.getRelationshipsForEntity(
      "campaign-123",
      "entity-1",
      { relationshipType: "ALLIED WITH" }
    );

    expect(entityDAO.getRelationshipsForEntity).toHaveBeenCalledWith(
      "entity-1",
      { relationshipType: "allied_with" }
    );
    expect(relationships).toHaveLength(1);
  });

  it("fetches neighbors with normalized relationship filters", async () => {
    const entityDAO = createMockDAO();
    const service = new EntityGraphService(entityDAO);

    const neighbors = await service.getNeighbors("campaign-123", "entity-1", {
      maxDepth: 2,
      relationshipTypes: ["ALLY"],
    });

    expect(entityDAO.getRelationshipNeighborhood).toHaveBeenCalledWith(
      "entity-1",
      {
        maxDepth: 2,
        relationshipTypes: ["allied_with"],
      }
    );
    expect(neighbors).toHaveLength(1);
    expect(neighbors[0].relationshipType).toBe("allied_with");
  });
});
