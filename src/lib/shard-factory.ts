import type {
  AISearchResponse,
  CampaignResource,
  CreateShardData,
  ShardCandidate,
  ShardMetadata,
  ShardSourceRef,
} from "../types/shard";
import { STRUCTURED_CONTENT_TYPES } from "./content-types";

/**
 * Unified Shard Factory
 * Centralized shard creation and parsing logic to eliminate duplication
 * and ensure consistent shard structures across the system
 */
export class ShardFactory {
  /**
   * Create a shard candidate from structured content
   */
  static createShardCandidate(
    shard: any,
    contentType: string,
    resource: CampaignResource,
    campaignId: string,
    source: string = "library_autorag_ai_search",
    confidence: number = 0.9,
    chunkId?: string,
    originalMetadata: Record<string, any> = {}
  ): ShardCandidate {
    // Defensive checks for resource properties
    const resourceId = resource?.id || resource?.resource_id || "unknown";
    const resourceName =
      resource?.file_name ||
      resource?.resource_name ||
      resource?.name ||
      resourceId;

    console.log(`[ShardFactory] Creating shard candidate:`, {
      shardKeys: shard ? Object.keys(shard) : "null",
      resourceId,
      resourceName,
      contentType,
      campaignId,
    });

    // Validate content type
    if (!STRUCTURED_CONTENT_TYPES.includes(contentType as any)) {
      console.warn(`[ShardFactory] Invalid content type: ${contentType}`);
    }

    // Generate chunk ID if not provided
    const finalChunkId = chunkId || `${resourceId}_ai_${Date.now()}`;

    // Create shard ID - ensure uniqueness by using the generateShardId method
    const index = originalMetadata?.index;
    const shardId = ShardFactory.generateShardId(
      resourceId,
      contentType,
      index
    );

    // Create metadata
    const metadata: ShardMetadata = {
      fileKey: resourceId,
      fileName: resourceName,
      source,
      campaignId,
      entityType: contentType as any,
      confidence,
      originalMetadata: {
        structuredContent: shard,
        contentType,
        ...originalMetadata,
      },
      sourceRef: {
        fileKey: resourceId,
        meta: {
          fileName: resourceName,
          campaignId,
          entityType: contentType,
          chunkId: finalChunkId,
          score: confidence,
        },
      },
    };

    // Create source reference
    const sourceRef: ShardSourceRef = {
      fileKey: resourceId,
      meta: {
        fileName: resourceName,
        campaignId,
        entityType: contentType,
        chunkId: finalChunkId,
        score: confidence,
      },
    };

    return {
      id: shardId,
      text: JSON.stringify(shard, null, 2),
      metadata,
      sourceRef,
    };
  }

  /**
   * Parse AI Search results into shard candidates
   * Handles structured JSON responses from AutoRAG AI Search
   */
  static parseAISearchResponse(
    aiSearchResponse: AISearchResponse,
    resource: CampaignResource,
    campaignId: string
  ): ShardCandidate[] {
    const shardCandidates: ShardCandidate[] = [];

    console.log(`[ShardFactory] Processing AI Search response:`, {
      responseKeys: Object.keys(aiSearchResponse),
      responseType: typeof aiSearchResponse,
      resource: resource,
      resourceKeys: resource ? Object.keys(resource) : "null",
    });

    if (!aiSearchResponse || typeof aiSearchResponse !== "object") {
      console.warn(
        `[ShardFactory] AI Search response is null/undefined or not an object`
      );
      return [];
    }

    // Find all content type arrays in the response
    const foundContentTypes = Object.keys(aiSearchResponse).filter(
      (key) =>
        STRUCTURED_CONTENT_TYPES.includes(key as any) &&
        Array.isArray(aiSearchResponse[key]) &&
        aiSearchResponse[key].length > 0
    );

    console.log(
      `[ShardFactory] Found content types in AI Search response:`,
      foundContentTypes
    );

    // Process each content type
    for (const contentType of foundContentTypes) {
      const shardArray = aiSearchResponse[contentType];

      console.log(
        `[ShardFactory] Processing ${shardArray.length} ${contentType} items`
      );

      // Process each shard in the content type array
      for (let i = 0; i < shardArray.length; i++) {
        const shard = shardArray[i];
        if (shard?.name) {
          const shardCandidate = ShardFactory.createShardCandidate(
            shard,
            contentType,
            resource,
            campaignId,
            "library_autorag_ai_search",
            0.9,
            `${resource.id}_ai_${shardCandidates.length}`,
            { aiSearchResponse: true, index: i }
          );
          shardCandidates.push(shardCandidate);
        }
      }

      console.log(
        `[ShardFactory] Processed ${shardArray.length} ${contentType} shards from AI Search response`
      );
    }

    return shardCandidates;
  }

  /**
   * Convert shard candidates to database format
   */
  static toDatabaseFormat(
    shardCandidates: ShardCandidate[],
    campaignId: string,
    resourceId: string
  ): CreateShardData[] {
    return shardCandidates
      .filter((shard) => shard.text && shard.metadata) // Filter out invalid shards
      .map((shard) => ({
        id: shard.id,
        campaign_id: campaignId,
        resource_id: resourceId,
        shard_type: shard.metadata.entityType,
        content: shard.text,
        metadata: JSON.stringify(shard.metadata),
      }));
  }

  /**
   * Validate shard candidate structure
   */
  static validateShardCandidate(shard: any): shard is ShardCandidate {
    return (
      shard &&
      typeof shard === "object" &&
      typeof shard.id === "string" &&
      typeof shard.text === "string" &&
      shard.metadata &&
      typeof shard.metadata === "object" &&
      typeof shard.metadata.fileKey === "string" &&
      typeof shard.metadata.fileName === "string" &&
      typeof shard.metadata.campaignId === "string" &&
      typeof shard.metadata.entityType === "string" &&
      typeof shard.metadata.confidence === "number" &&
      shard.sourceRef &&
      typeof shard.sourceRef === "object"
    );
  }

  /**
   * Filter valid shards from a collection
   */
  static filterValidShards(shards: any[]): ShardCandidate[] {
    return shards.filter((shard) => ShardFactory.validateShardCandidate(shard));
  }

  /**
   * Create shard ID from resource and content type
   */
  static generateShardId(
    resourceId: string,
    contentType: string,
    index?: number
  ): string {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substr(2, 9);
    const indexSuffix = index !== undefined ? `_${index}` : "";

    return `${resourceId}_${contentType}_${timestamp}${indexSuffix}_${randomSuffix}`;
  }

  /**
   * Extract resource information consistently
   */
  static extractResourceInfo(resource: CampaignResource): {
    id: string;
    name: string;
  } {
    const resourceId = resource?.id || resource?.resource_id || "unknown";
    const resourceName =
      resource?.file_name ||
      resource?.resource_name ||
      resource?.name ||
      resourceId;

    return { id: resourceId, name: resourceName };
  }
}
