import { STRUCTURED_CONTENT_TYPES } from "./content-types";
import type {
  SnippetCandidate,
  SnippetMetadata,
  SnippetSourceRef,
  CampaignResource,
  AISearchResponse,
  CreateSnippetData,
} from "../types/snippet";

/**
 * Unified Snippet Factory
 * Centralized snippet creation and parsing logic to eliminate duplication
 * and ensure consistent snippet structures across the system
 */
export class SnippetFactory {
  /**
   * Create a snippet candidate from structured content
   */
  static createSnippetCandidate(
    snippet: any,
    contentType: string,
    resource: CampaignResource,
    campaignId: string,
    source: string = "library_autorag_ai_search",
    confidence: number = 0.9,
    chunkId?: string,
    originalMetadata: Record<string, any> = {}
  ): SnippetCandidate {
    // Defensive checks for resource properties
    const resourceId = resource?.id || resource?.resource_id || "unknown";
    const resourceName =
      resource?.file_name ||
      resource?.resource_name ||
      resource?.name ||
      resourceId;

    console.log(`[SnippetFactory] Creating snippet candidate:`, {
      snippetKeys: snippet ? Object.keys(snippet) : "null",
      resourceId,
      resourceName,
      contentType,
      campaignId,
    });

    // Validate content type
    if (!STRUCTURED_CONTENT_TYPES.includes(contentType as any)) {
      console.warn(`[SnippetFactory] Invalid content type: ${contentType}`);
    }

    // Generate chunk ID if not provided
    const finalChunkId = chunkId || `${resourceId}_ai_${Date.now()}`;

    // Create snippet ID - ensure uniqueness by using the generateSnippetId method
    const index = originalMetadata?.index;
    const snippetId = this.generateSnippetId(resourceId, contentType, index);

    // Create metadata
    const metadata: SnippetMetadata = {
      fileKey: resourceId,
      fileName: resourceName,
      source,
      campaignId,
      entityType: contentType as any,
      confidence,
      originalMetadata: {
        structuredContent: snippet,
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
    const sourceRef: SnippetSourceRef = {
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
      id: snippetId,
      text: JSON.stringify(snippet, null, 2),
      metadata,
      sourceRef,
    };
  }

  /**
   * Parse AI Search results into snippet candidates
   * Handles structured JSON responses from AutoRAG AI Search
   */
  static parseAISearchResponse(
    aiSearchResponse: AISearchResponse,
    resource: CampaignResource,
    campaignId: string
  ): SnippetCandidate[] {
    const snippetCandidates: SnippetCandidate[] = [];

    console.log(`[SnippetFactory] Processing AI Search response:`, {
      responseKeys: Object.keys(aiSearchResponse),
      responseType: typeof aiSearchResponse,
      resource: resource,
      resourceKeys: resource ? Object.keys(resource) : "null",
    });

    if (!aiSearchResponse || typeof aiSearchResponse !== "object") {
      console.warn(
        `[SnippetFactory] AI Search response is null/undefined or not an object`
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
      `[SnippetFactory] Found content types in AI Search response:`,
      foundContentTypes
    );

    // Process each content type
    for (const contentType of foundContentTypes) {
      const snippetArray = aiSearchResponse[contentType];

      console.log(
        `[SnippetFactory] Processing ${snippetArray.length} ${contentType} items`
      );

      // Process each snippet in the content type array
      for (let i = 0; i < snippetArray.length; i++) {
        const snippet = snippetArray[i];
        if (snippet && snippet.name) {
          const snippetCandidate = this.createSnippetCandidate(
            snippet,
            contentType,
            resource,
            campaignId,
            "library_autorag_ai_search",
            0.9,
            `${resource.id}_ai_${snippetCandidates.length}`,
            { aiSearchResponse: true, index: i }
          );
          snippetCandidates.push(snippetCandidate);
        }
      }

      console.log(
        `[SnippetFactory] Processed ${snippetArray.length} ${contentType} snippets from AI Search response`
      );
    }

    return snippetCandidates;
  }

  /**
   * Convert snippet candidates to database format
   */
  static toDatabaseFormat(
    snippetCandidates: SnippetCandidate[],
    campaignId: string,
    resourceId: string
  ): CreateSnippetData[] {
    return snippetCandidates
      .filter((snippet) => snippet.text && snippet.metadata) // Filter out invalid snippets
      .map((snippet) => ({
        id: snippet.id,
        campaign_id: campaignId,
        resource_id: resourceId,
        snippet_type: snippet.metadata.entityType,
        content: snippet.text,
        metadata: JSON.stringify(snippet.metadata),
      }));
  }

  /**
   * Validate snippet candidate structure
   */
  static validateSnippetCandidate(snippet: any): snippet is SnippetCandidate {
    return (
      snippet &&
      typeof snippet === "object" &&
      typeof snippet.id === "string" &&
      typeof snippet.text === "string" &&
      snippet.metadata &&
      typeof snippet.metadata === "object" &&
      typeof snippet.metadata.fileKey === "string" &&
      typeof snippet.metadata.fileName === "string" &&
      typeof snippet.metadata.campaignId === "string" &&
      typeof snippet.metadata.entityType === "string" &&
      typeof snippet.metadata.confidence === "number" &&
      snippet.sourceRef &&
      typeof snippet.sourceRef === "object"
    );
  }

  /**
   * Filter valid snippets from a collection
   */
  static filterValidSnippets(snippets: any[]): SnippetCandidate[] {
    return snippets.filter((snippet) => this.validateSnippetCandidate(snippet));
  }

  /**
   * Create snippet ID from resource and content type
   */
  static generateSnippetId(
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
