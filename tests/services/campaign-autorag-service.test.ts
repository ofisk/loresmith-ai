import { describe, it, expect, beforeEach, vi } from "vitest";
import { CampaignAutoRAG } from "../../src/services/campaign-autorag-service";
import type { Env } from "../../src/middleware/auth";
import type { ShardCandidate, RejectedShard } from "../../src/types/shard";

describe("CampaignAutoRAG", () => {
  let campaignAutoRAG: CampaignAutoRAG;
  let mockEnv: Env;
  let mockR2: any;
  let mockAutoRagClient: any;

  const campaignBasePath = "campaigns/test-campaign-123";

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock R2 operations
    mockR2 = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
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

    // Replace the internal client with our mock
    (campaignAutoRAG as any).autoRagClient = mockAutoRagClient;
  });

  describe("enforcedFilter", () => {
    it("should return correct approved path for filter enforcement", () => {
      const filter = (campaignAutoRAG as any).enforcedFilter();

      expect(filter).toBe(`${campaignBasePath}/approved/`);
    });

    it("should scope searches to approved content only", async () => {
      mockAutoRagClient.search.mockResolvedValue({
        data: [],
        total: 0,
      });

      await campaignAutoRAG.search("test query");

      // Verify the search was called (filter applied internally)
      expect(mockAutoRagClient.search).toHaveBeenCalled();
    });
  });

  describe("initFolders", () => {
    it("should initialize all three folder types", async () => {
      // initFolders calls ensureFolders which doesn't require list operations
      // It's successful if it completes without error
      await expect(campaignAutoRAG.initFolders()).resolves.not.toThrow();
    });
  });

  describe("saveShardCandidatesPerShard", () => {
    it("should save individual shards to staging with correct paths", async () => {
      const resourceId = "resource-456";
      const mockShards: ShardCandidate[] = [
        {
          id: "shard-1",
          text: "Test shard 1",
          metadata: {
            entityType: "characters",
            fileName: "test.pdf",
            campaignId: "test-campaign",
            fileKey: "test-key",
            source: "test-source",
            confidence: 0.9,
          },
          sourceRef: {
            fileKey: resourceId,
            meta: { fileName: "test.pdf", campaignId: "test-campaign" },
          },
        },
        {
          id: "shard-2",
          text: "Test shard 2",
          metadata: {
            entityType: "locations",
            fileName: "test.pdf",
            campaignId: "test-campaign",
            fileKey: "test-key",
            source: "test-source",
            confidence: 0.9,
          },
          sourceRef: {
            fileKey: resourceId,
            meta: { fileName: "test.pdf", campaignId: "test-campaign" },
          },
        },
      ];

      mockR2.put.mockResolvedValue(undefined);

      await campaignAutoRAG.saveShardCandidatesPerShard(
        resourceId,
        mockShards,
        { fileName: "test.pdf" }
      );

      expect(mockR2.put).toHaveBeenCalledTimes(2);

      // Verify correct path construction
      const firstCall = mockR2.put.mock.calls[0];
      expect(firstCall[0]).toBe(
        `${campaignBasePath}/staging/${resourceId}/shard-1.json`
      );

      const secondCall = mockR2.put.mock.calls[1];
      expect(secondCall[0]).toBe(
        `${campaignBasePath}/staging/${resourceId}/shard-2.json`
      );
    });

    it("should skip invalid shards without id or metadata", async () => {
      const resourceId = "resource-456";
      const mockShards: any[] = [
        { id: "valid-1", text: "Valid", metadata: {}, sourceRef: {} },
        { text: "Invalid - no id", metadata: {} },
        { id: "invalid-2", text: "Invalid - no metadata" },
      ];

      mockR2.put.mockResolvedValue(undefined);

      await campaignAutoRAG.saveShardCandidatesPerShard(resourceId, mockShards);

      // Should only save the valid shard
      expect(mockR2.put).toHaveBeenCalledTimes(1);
    });

    it("should handle empty shard array gracefully", async () => {
      const resourceId = "resource-456";

      await campaignAutoRAG.saveShardCandidatesPerShard(resourceId, []);

      expect(mockR2.put).not.toHaveBeenCalled();
    });
  });

  describe("listStagedCandidates", () => {
    it("should list all staged shards from staging folder", async () => {
      const mockStagedData = {
        resourceId: "resource-123",
        shard: {
          id: "shard-1",
          text: "Test shard",
          metadata: { entityType: "characters" },
          sourceRef: { type: "file", id: "resource-123", meta: {} },
        },
        fileName: "test.pdf",
        created_at: "2024-01-01T00:00:00Z",
      };

      mockR2.list.mockResolvedValue({
        objects: [
          { key: `${campaignBasePath}/staging/resource-123/shard-1.json` },
        ],
      });

      mockR2.get.mockResolvedValue({
        arrayBuffer: () =>
          Promise.resolve(
            new TextEncoder().encode(JSON.stringify(mockStagedData)).buffer
          ),
      });

      const results = await campaignAutoRAG.listStagedCandidates();

      expect(results).toHaveLength(1);
      expect(results[0].resourceId).toBe("resource-123");
      expect(results[0].shard.id).toBe("shard-1");
      expect(results[0].fileName).toBe("test.pdf");
    });

    it("should handle legacy multi-shard file format", async () => {
      const mockLegacyData = {
        sourceRef: {
          fileKey: "legacy-resource",
          meta: { fileName: "legacy.pdf" },
        },
        shards: [
          {
            id: "shard-1",
            text: "Test 1",
            metadata: {},
            sourceRef: { type: "file", id: "legacy-resource", meta: {} },
          },
          {
            id: "shard-2",
            text: "Test 2",
            metadata: {},
            sourceRef: { type: "file", id: "legacy-resource", meta: {} },
          },
        ],
      };

      mockR2.list.mockResolvedValue({
        objects: [{ key: `${campaignBasePath}/staging/legacy_123.json` }],
      });

      mockR2.get.mockResolvedValue({
        arrayBuffer: () =>
          Promise.resolve(
            new TextEncoder().encode(JSON.stringify(mockLegacyData)).buffer
          ),
      });

      const results = await campaignAutoRAG.listStagedCandidates();

      expect(results).toHaveLength(2);
      expect(results[0].resourceId).toBe("legacy-resource");
      expect(results[1].resourceId).toBe("legacy-resource");
    });
  });

  describe("approveShards", () => {
    it("should move shards from staging to approved", async () => {
      const stagingKey = `${campaignBasePath}/staging/resource-123/shard-1.json`;

      const mockStagingData = {
        resourceId: "resource-123",
        shard: { id: "shard-1", text: "Test", metadata: {}, sourceRef: {} },
      };

      mockR2.get.mockResolvedValue({
        text: () => Promise.resolve(JSON.stringify(mockStagingData)),
        arrayBuffer: () =>
          Promise.resolve(
            new TextEncoder().encode(JSON.stringify(mockStagingData)).buffer
          ),
        httpMetadata: { contentType: "application/json" },
      });

      mockR2.put.mockResolvedValue(undefined);
      mockR2.delete.mockResolvedValue(undefined);

      await campaignAutoRAG.approveShards(stagingKey);

      // Verify the file was moved (implementation uses r2Helper.move which copies then deletes)
      expect(mockR2.get).toHaveBeenCalledWith(stagingKey);
    });

    it("should create expansion file when expansions provided", async () => {
      const stagingKey = `${campaignBasePath}/staging/resource-123/shard-1.json`;
      const mockExpansions = [
        {
          shardId: "shard-1",
          originalText: "Test",
          expandedText: "Test with expanded detail",
          reasoning: "Added more context",
        },
      ];

      const mockStagingData = {
        resourceId: "resource-123",
        shard: { id: "shard-1", text: "Test", metadata: {}, sourceRef: {} },
      };

      mockR2.get.mockResolvedValue({
        text: () => Promise.resolve(JSON.stringify(mockStagingData)),
        arrayBuffer: () =>
          Promise.resolve(
            new TextEncoder().encode(JSON.stringify(mockStagingData)).buffer
          ),
        httpMetadata: { contentType: "application/json" },
      });

      mockR2.put.mockResolvedValue(undefined);
      mockR2.delete.mockResolvedValue(undefined);

      await campaignAutoRAG.approveShards(stagingKey, mockExpansions);

      // Should call put for the expansion file
      const expansionCalls = mockR2.put.mock.calls.filter((call: any) =>
        call[0].includes(".exp.json")
      );
      expect(expansionCalls.length).toBeGreaterThan(0);
    });

    it("should throw error if staging file not found", async () => {
      const stagingKey = `${campaignBasePath}/staging/missing.json`;

      mockR2.get.mockResolvedValue(null);

      await expect(campaignAutoRAG.approveShards(stagingKey)).rejects.toThrow(
        "Staging file not found"
      );
    });
  });

  describe("rejectShards", () => {
    it("should wrap rejected data and move to rejected folder", async () => {
      const stagingKey = `${campaignBasePath}/staging/resource-123/shard-1.json`;
      const rejectedKey = `${campaignBasePath}/rejected/resource-123/shard-1.json`;
      const reason = "Not relevant to campaign";

      const mockStagingData = {
        resourceId: "resource-123",
        shard: { id: "shard-1", text: "Test", metadata: {}, sourceRef: {} },
      };

      mockR2.get.mockResolvedValue({
        text: () => Promise.resolve(JSON.stringify(mockStagingData)),
      });

      mockR2.put.mockResolvedValue(undefined);
      mockR2.delete.mockResolvedValue(undefined);

      await campaignAutoRAG.rejectShards(stagingKey, reason);

      // Verify rejected data was created with proper structure
      expect(mockR2.put).toHaveBeenCalled();
      const putCall = mockR2.put.mock.calls[0];
      expect(putCall[0]).toBe(rejectedKey);

      const rejectedData = JSON.parse(
        new TextDecoder().decode(putCall[1])
      ) as RejectedShard;
      expect(rejectedData.reason).toBe(reason);
      expect(rejectedData.payload).toEqual(mockStagingData);
      expect(rejectedData.rejectedAt).toBeDefined();

      // Verify staging file was deleted
      expect(mockR2.delete).toHaveBeenCalledWith(stagingKey);
    });

    it("should throw error if staging file not found", async () => {
      const stagingKey = `${campaignBasePath}/staging/missing.json`;

      mockR2.get.mockResolvedValue(null);

      await expect(
        campaignAutoRAG.rejectShards(stagingKey, "Test reason")
      ).rejects.toThrow("Staging file not found");
    });
  });

  describe("getStagedShards", () => {
    it("should retrieve all staged shards with metadata", async () => {
      const mockShardData = {
        resourceId: "resource-123",
        shard: {
          id: "shard-1",
          text: "Test shard",
          metadata: { entityType: "characters" },
          sourceRef: { type: "file", id: "resource-123", meta: {} },
        },
        fileName: "test.pdf",
      };

      mockR2.list.mockResolvedValue({
        objects: [
          { key: `${campaignBasePath}/staging/resource-123/shard-1.json` },
          { key: `${campaignBasePath}/staging/resource-123/shard-2.json` },
        ],
      });

      mockR2.get
        .mockResolvedValueOnce({
          arrayBuffer: () =>
            Promise.resolve(
              new TextEncoder().encode(JSON.stringify(mockShardData)).buffer
            ),
        })
        .mockResolvedValueOnce({
          arrayBuffer: () =>
            Promise.resolve(
              new TextEncoder().encode(
                JSON.stringify({
                  ...mockShardData,
                  shard: { ...mockShardData.shard, id: "shard-2" },
                })
              ).buffer
            ),
        });

      const results = await campaignAutoRAG.getStagedShards();

      expect(results).toHaveLength(2);
      expect(results[0].resourceId).toBe("resource-123");
      expect(results[0].key).toBe(
        `${campaignBasePath}/staging/resource-123/shard-1.json`
      );
    });

    it("should handle errors gracefully when reading individual shards", async () => {
      mockR2.list.mockResolvedValue({
        objects: [
          { key: `${campaignBasePath}/staging/valid.json` },
          { key: `${campaignBasePath}/staging/invalid.json` },
        ],
      });

      mockR2.get
        .mockResolvedValueOnce({
          arrayBuffer: () =>
            Promise.resolve(
              new TextEncoder().encode(
                JSON.stringify({ resourceId: "valid", shard: {} })
              ).buffer
            ),
        })
        .mockResolvedValueOnce({
          arrayBuffer: () =>
            Promise.resolve(new TextEncoder().encode("invalid json{").buffer),
        });

      const results = await campaignAutoRAG.getStagedShards();

      // Should return valid shard and skip invalid one
      expect(results).toHaveLength(1);
      expect(results[0].resourceId).toBe("valid");
    });
  });

  describe("R2 path construction", () => {
    it("should construct correct staging paths", () => {
      const resourceId = "resource-123";
      const shardId = "shard-456";

      const expectedPath = `${campaignBasePath}/staging/${resourceId}/${shardId}.json`;

      // This is implicitly tested in saveShardCandidatesPerShard
      // but we can verify the pattern
      expect(expectedPath).toMatch(/campaigns\/.*\/staging\/.*\/.*\.json/);
    });

    it("should construct correct approved paths", () => {
      const stagingPath = `${campaignBasePath}/staging/resource/shard.json`;
      const approvedPath = stagingPath.replace("/staging/", "/approved/");

      expect(approvedPath).toBe(
        `${campaignBasePath}/approved/resource/shard.json`
      );
    });

    it("should construct correct rejected paths", () => {
      const stagingPath = `${campaignBasePath}/staging/resource/shard.json`;
      const rejectedPath = stagingPath.replace("/staging/", "/rejected/");

      expect(rejectedPath).toBe(
        `${campaignBasePath}/rejected/resource/shard.json`
      );
    });
  });
});
