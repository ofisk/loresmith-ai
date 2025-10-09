import { describe, it, expect, beforeEach, vi } from "vitest";
import { CampaignContextSyncService } from "../../src/services/campaign-context-sync-service";
import { CampaignAutoRAG } from "../../src/services/campaign-autorag-service";
import type { Env } from "../../src/middleware/auth";

describe("Campaign Context Capture Flow Integration", () => {
  let syncService: CampaignContextSyncService;
  let autoRAG: CampaignAutoRAG;
  let mockEnv: Env;
  let mockR2: any;
  let mockAutoRagClient: any;

  const campaignId = "test-campaign-789";
  const campaignBasePath = `campaigns/${campaignId}`;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock R2 with in-memory store
    const r2Store: Record<string, ArrayBuffer> = {};

    mockR2 = {
      get: vi.fn(async (key: string) => {
        const data = r2Store[key];
        if (!data) return null;
        return {
          arrayBuffer: () => Promise.resolve(data),
          text: () => Promise.resolve(new TextDecoder().decode(data)),
          httpMetadata: { contentType: "application/json" },
        };
      }),
      put: vi.fn(async (key: string, content: ArrayBuffer) => {
        r2Store[key] = content;
      }),
      delete: vi.fn(async (key: string) => {
        delete r2Store[key];
      }),
      list: vi.fn(async (options: any) => {
        const prefix = options.prefix || "";
        const keys = Object.keys(r2Store).filter((k) => k.startsWith(prefix));
        return {
          objects: keys.map((key) => ({ key })),
        };
      }),
    };

    // Mock environment
    mockEnv = {
      DB: {} as any,
      AUTORAG_BASE_URL: "https://test-autorag.com",
      R2_BUCKET: mockR2 as any,
      R2: mockR2 as any,
      VECTORIZE: {} as any,
      AI: {} as any,
      Chat: {} as any,
      NOTIFICATION_HUB: {} as any,
      UPLOAD_SESSION: {} as any,
      UploadSession: {} as any,
      AUTORAG_POLLING: {} as any,
      AUTORAG_API_KEY: "test-key",
      AUTORAG_API_TOKEN: "test-token",
      OPENAI_API_KEY: "test-key",
      ASSETS: {} as any,
      FILE_PROCESSING_QUEUE: {} as any,
      FILE_PROCESSING_DLQ: {} as any,
    } as unknown as Env;

    mockAutoRagClient = {
      search: vi.fn(),
      aiSearch: vi.fn(),
    };

    syncService = new CampaignContextSyncService(mockEnv);
    autoRAG = new CampaignAutoRAG(
      mockEnv,
      "https://test-autorag.com",
      campaignBasePath
    );

    (autoRAG as any).autoRagClient = mockAutoRagClient;
  });

  it("should sync campaign creation context as pre-approved shards", async () => {
    // Campaign creation automatically syncs title and description
    await syncService.syncContextToAutoRAG(
      campaignId,
      `${campaignId}-title`,
      "campaign_info",
      "Campaign Title",
      "The Dragon Lords Arise",
      { field: "title" }
    );

    await syncService.syncContextToAutoRAG(
      campaignId,
      `${campaignId}-description`,
      "campaign_info",
      "Campaign Description",
      "A high-fantasy adventure",
      { field: "description" }
    );

    // Verify shards are in approved folder (pre-approved)
    const approvedList = await mockR2.list({
      prefix: `${campaignBasePath}/context/approved/`,
    });

    expect(approvedList.objects).toHaveLength(2);

    // Verify shards are searchable immediately
    mockAutoRagClient.search.mockResolvedValue({
      data: [
        {
          file_id: `${campaignId}-title`,
          content: [{ text: "The Dragon Lords Arise" }],
          score: 0.99,
        },
      ],
      total: 1,
    });

    const searchResults = await autoRAG.search("Dragon Lords");
    expect(searchResults.data).toHaveLength(1);
  });

  it("should handle character creation → pre-approved shard", async () => {
    const characterId = "char-123";
    const characterData = {
      backstory: "A noble knight seeking redemption",
      personality_traits: "Brave and honorable",
      goals: "Defeat the dark lord",
    };

    // Character creation triggers sync
    await syncService.syncCharacterToAutoRAG(
      campaignId,
      characterId,
      "Sir Galahad",
      characterData
    );

    // Verify shard is in approved folder (pre-approved)
    const approvedKey = `${campaignBasePath}/context/approved/${characterId}.json`;
    const approvedData = await mockR2.get(approvedKey);

    expect(approvedData).not.toBeNull();

    const shardContent = JSON.parse(await approvedData.text());
    expect(shardContent.metadata.entityType).toBe("character");
    expect(shardContent.metadata.characterName).toBe("Sir Galahad");
    expect(shardContent.text).toContain("noble knight");
  });

  it("should handle conversational context → staging → approval → searchable", async () => {
    // Step 1: AI detects context from conversation
    const { stagingKey, shard } = await syncService.createStagingShard(
      campaignId,
      "conv-note-123",
      "Village of Barovia",
      "A gloomy village trapped in mist where villagers won't let strangers leave. Similar to Doc Hollywood but darker and more horror-themed.",
      "locations",
      0.85,
      "msg-456"
    );

    // Verify shard is in staging (requires approval)
    expect(stagingKey).toContain("/conversation/staging/");

    const stagingData = await mockR2.get(stagingKey);
    expect(stagingData).not.toBeNull();

    const stagingContent = JSON.parse(await stagingData.text());
    expect(stagingContent.metadata.entityType).toBe("conversational_context");
    expect(stagingContent.metadata.sourceType).toBe("ai_detected");
    expect(stagingContent.metadata.confidence).toBe(0.85);

    // Step 2: User approves the shard
    await autoRAG.approveShards(stagingKey);

    // Verify shard moved to approved
    const approvedKey = stagingKey.replace(
      "/conversation/staging/",
      "/conversation/approved/"
    );
    const approvedData = await mockR2.get(approvedKey);
    expect(approvedData).not.toBeNull();

    // Verify staging shard was removed
    const removedStaging = await mockR2.get(stagingKey);
    expect(removedStaging).toBeNull();

    // Step 3: Verify shard is now searchable
    mockAutoRagClient.aiSearch.mockResolvedValue({
      data: [
        {
          file_id: "conv-note-123",
          content: [{ text: "A gloomy village trapped in mist" }],
          score: 0.88,
          attributes: {
            entityType: "conversational_context",
            noteType: "locations",
          },
        },
      ],
      total: 1,
    });

    const searchResults = await autoRAG.aiSearch("village");
    expect(searchResults.data).toHaveLength(1);
  });

  it("should handle explicit user context saves → staging → approval", async () => {
    // User explicitly asks to save context (still goes through staging for review)
    const { stagingKey } = await syncService.createStagingShard(
      campaignId,
      "user-note-456",
      "Campaign Theme",
      "Horror campaign with strong female leads and themes of dread",
      "theme_preference",
      0.95, // Higher confidence for explicit saves
      "msg-789"
    );

    // Verify in staging
    const stagingData = await mockR2.get(stagingKey);
    expect(stagingData).not.toBeNull();

    const stagingContent = JSON.parse(await stagingData.text());
    expect(stagingContent.metadata.confidence).toBe(0.95);

    // Approve
    await autoRAG.approveShards(stagingKey);

    // Verify moved to approved
    const approvedKey = stagingKey.replace(
      "/conversation/staging/",
      "/conversation/approved/"
    );
    const approvedData = await mockR2.get(approvedKey);
    expect(approvedData).not.toBeNull();
  });

  it("should support searching across all approved context types", async () => {
    // Sync different types of context
    await syncService.syncCharacterToAutoRAG(campaignId, "char-1", "Wizard", {
      backstory: "Ancient mage with dragon knowledge",
    });

    await syncService.syncContextToAutoRAG(
      campaignId,
      "ctx-1",
      "plot_decision",
      "Main Plot",
      "Defeat the dragon threatening the kingdom"
    );

    await syncService.syncCharacterSheetToAutoRAG(
      campaignId,
      "sheet-1",
      "Fighter",
      { class: "Fighter", level: 5 }
    );

    // Verify all are searchable
    const approvedList = await mockR2.list({
      prefix: `${campaignBasePath}/context/approved/`,
    });

    expect(approvedList.objects).toHaveLength(3);

    // Mock search returning mixed results
    mockAutoRagClient.aiSearch.mockResolvedValue({
      data: [
        {
          file_id: "char-1",
          content: [{ text: "Ancient mage with dragon knowledge" }],
          score: 0.92,
          attributes: { entityType: "character" },
        },
        {
          file_id: "ctx-1",
          content: [{ text: "Defeat the dragon threatening the kingdom" }],
          score: 0.89,
          attributes: { entityType: "context" },
        },
      ],
      total: 2,
    });

    const searchResults = await autoRAG.aiSearch("dragon");
    expect(searchResults.data).toHaveLength(2);
  });

  it("should handle context updates by replacing approved shards", async () => {
    const contextId = `${campaignId}-title`;

    // Initial sync
    await syncService.syncContextToAutoRAG(
      campaignId,
      contextId,
      "campaign_info",
      "Campaign Title",
      "Original Title"
    );

    let approvedKey = `${campaignBasePath}/context/approved/${contextId}.json`;
    let approvedData = await mockR2.get(approvedKey);
    let content = JSON.parse(await approvedData!.text());

    expect(content.text).toContain("Original Title");

    // Update (overwrites the shard)
    await syncService.syncContextToAutoRAG(
      campaignId,
      contextId,
      "campaign_info",
      "Campaign Title",
      "Updated Title"
    );

    approvedData = await mockR2.get(approvedKey);
    content = JSON.parse(await approvedData!.text());

    expect(content.text).toContain("Updated Title");
    expect(content.text).not.toContain("Original Title");
  });
});
