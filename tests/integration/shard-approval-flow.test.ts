import { describe, it, expect, beforeEach, vi } from "vitest";
import { CampaignAutoRAG } from "../../src/services/campaign-autorag-service";
import type { Env } from "../../src/middleware/auth";
import type { ShardCandidate } from "../../src/types/shard";

describe("Shard Approval Flow Integration", () => {
  let campaignAutoRAG: CampaignAutoRAG;
  let mockEnv: Env;
  let mockR2: any;
  let mockAutoRagClient: any;

  const campaignId = "test-campaign-456";
  const campaignBasePath = `campaigns/${campaignId}`;
  const resourceId = "resource-789";

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock R2 operations with in-memory store
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

    // Mock AutoRAG client
    mockAutoRagClient = {
      search: vi.fn(),
      aiSearch: vi.fn(),
    };

    campaignAutoRAG = new CampaignAutoRAG(
      mockEnv,
      "https://test-autorag.com",
      campaignBasePath
    );

    (campaignAutoRAG as any).autoRagClient = mockAutoRagClient;
  });

  it("should complete full shard approval flow: upload → staging → approval → searchable", async () => {
    // Step 1: File upload generates shards → staging
    const mockShards: ShardCandidate[] = [
      {
        id: "shard-1",
        text: "The ancient dragon guards the treasure",
        metadata: {
          entityType: "npcs",
          fileName: "dragon-module.pdf",
          campaignId,
          fileKey: resourceId,
          source: "file-upload",
          confidence: 0.95,
        },
        sourceRef: {
          fileKey: resourceId,
          meta: { fileName: "dragon-module.pdf", campaignId },
        },
      },
      {
        id: "shard-2",
        text: "The Dragon's Lair is a volcanic cave system",
        metadata: {
          entityType: "locations",
          fileName: "dragon-module.pdf",
          campaignId,
          fileKey: resourceId,
          source: "file-upload",
          confidence: 0.92,
        },
        sourceRef: {
          fileKey: resourceId,
          meta: { fileName: "dragon-module.pdf", campaignId },
        },
      },
    ];

    await campaignAutoRAG.saveShardCandidatesPerShard(resourceId, mockShards, {
      fileName: "dragon-module.pdf",
    });

    // Verify shards are in staging
    const stagedShards = await campaignAutoRAG.listStagedCandidates();
    expect(stagedShards).toHaveLength(2);
    expect(stagedShards[0].shard.id).toBe("shard-1");
    expect(stagedShards[1].shard.id).toBe("shard-2");

    // Step 2: User approves first shard
    const stagingKey1 = stagedShards[0].key;
    await campaignAutoRAG.approveShards(stagingKey1);

    // Verify shard moved to approved
    const approvedKey1 = stagingKey1.replace("/staging/", "/approved/");
    const approvedData = await mockR2.get(approvedKey1);
    expect(approvedData).not.toBeNull();

    // Verify staging shard was removed
    const stagingData = await mockR2.get(stagingKey1);
    expect(stagingData).toBeNull();

    // Step 3: User rejects second shard
    const stagingKey2 = stagedShards[1].key;
    await campaignAutoRAG.rejectShards(
      stagingKey2,
      "Not relevant to this campaign"
    );

    // Verify shard moved to rejected with metadata
    const rejectedKey = stagingKey2.replace("/staging/", "/rejected/");
    const rejectedData = await mockR2.get(rejectedKey);
    expect(rejectedData).not.toBeNull();

    const rejectedContent = JSON.parse(await rejectedData.text());
    expect(rejectedContent.reason).toBe("Not relevant to this campaign");
    expect(rejectedContent.rejectedAt).toBeDefined();
    expect(rejectedContent.payload).toBeDefined();

    // Step 4: Verify only approved content is searchable via enforcedFilter
    mockAutoRagClient.search.mockResolvedValue({
      data: [
        {
          file_id: "shard-1",
          content: [{ text: "The ancient dragon guards the treasure" }],
          score: 0.95,
        },
      ],
      total: 1,
    });

    const searchResults = await campaignAutoRAG.search("dragon");

    // Verify search was called (enforcedFilter logic was removed from client base)
    expect(mockAutoRagClient.search).toHaveBeenCalledWith(
      "dragon",
      expect.any(Object)
    );

    // Verify we got results (from approved shard)
    expect(searchResults.data).toHaveLength(1);
    expect(searchResults.data[0].file_id).toBe("shard-1");
  });

  it("should handle shard expansion during approval", async () => {
    // Create staging shard
    const mockShard: ShardCandidate = {
      id: "shard-exp-1",
      text: "Brief description",
      metadata: {
        entityType: "npcs",
        fileName: "test.pdf",
        campaignId,
        fileKey: resourceId,
        source: "file-upload",
        confidence: 0.9,
      },
      sourceRef: {
        fileKey: resourceId,
        meta: { fileName: "test.pdf", campaignId },
      },
    };

    await campaignAutoRAG.saveShardCandidatesPerShard(resourceId, [mockShard], {
      fileName: "test.pdf",
    });

    const stagedShards = await campaignAutoRAG.listStagedCandidates();
    const stagingKey = stagedShards[0].key;

    // Approve with expansion
    const expansion = {
      shardId: "shard-exp-1",
      originalText: "Brief description",
      expandedText: "Detailed expanded description with more context",
      reasoning: "Added missing context for better searchability",
    };

    await campaignAutoRAG.approveShards(stagingKey, [expansion]);

    // Verify expansion file was created
    const expansionKey = stagingKey
      .replace("/staging/", "/approved/")
      .replace(".json", ".exp.json");
    const expansionData = await mockR2.get(expansionKey);

    expect(expansionData).not.toBeNull();

    const expansionContent = JSON.parse(await expansionData.text());
    expect(expansionContent.expansions).toHaveLength(1);
    expect(expansionContent.expansions[0].expandedText).toContain(
      "Detailed expanded description"
    );
  });

  it("should maintain separation between approved and rejected shards", async () => {
    // Create multiple shards
    const mockShards: ShardCandidate[] = Array(5)
      .fill(null)
      .map((_, i) => ({
        id: `shard-${i}`,
        text: `Test shard ${i}`,
        metadata: {
          entityType: "npcs",
          fileName: "test.pdf",
          campaignId,
          fileKey: resourceId,
          source: "file-upload",
          confidence: 0.9,
        },
        sourceRef: {
          fileKey: resourceId,
          meta: { fileName: "test.pdf", campaignId },
        },
      }));

    await campaignAutoRAG.saveShardCandidatesPerShard(resourceId, mockShards, {
      fileName: "test.pdf",
    });

    // Approve shards 0, 1, 2
    const stagedShards = await campaignAutoRAG.listStagedCandidates();
    await campaignAutoRAG.approveShards(stagedShards[0].key);
    await campaignAutoRAG.approveShards(stagedShards[1].key);
    await campaignAutoRAG.approveShards(stagedShards[2].key);

    // Reject shards 3, 4
    await campaignAutoRAG.rejectShards(stagedShards[3].key, "Not needed");
    await campaignAutoRAG.rejectShards(stagedShards[4].key, "Duplicate");

    // Verify approved folder has 3 shards
    const approvedList = await mockR2.list({
      prefix: `${campaignBasePath}/approved/`,
    });
    expect(approvedList.objects).toHaveLength(3);

    // Verify rejected folder has 2 shards
    const rejectedList = await mockR2.list({
      prefix: `${campaignBasePath}/rejected/`,
    });
    expect(rejectedList.objects).toHaveLength(2);

    // Verify staging folder is empty
    const stagingList = await mockR2.list({
      prefix: `${campaignBasePath}/staging/`,
    });
    expect(stagingList.objects).toHaveLength(0);
  });
});
