import { STRUCTURED_CONTENT_TYPES } from "./content-types";

export interface SnippetCandidate {
  id: string;
  text: string;
  metadata: {
    fileKey: string;
    fileName: string;
    source: string;
    campaignId: string;
    entityType: string;
    confidence: number;
    originalMetadata: any;
    sourceRef: {
      fileKey: string;
      meta: {
        fileName: string;
        campaignId: string;
        entityType: string;
        chunkId: string;
        score: number;
      };
    };
  };
  sourceRef: {
    fileKey: string;
    meta: {
      fileName: string;
      campaignId: string;
    };
  };
}

export interface CampaignResource {
  resource_id: string;
  resource_name?: string;
}

/**
 * Parse AI Search results from AutoRAG into snippet candidates
 * This function handles structured JSON responses from AutoRAG AI Search
 */
/**
 * Create a snippet candidate from structured content
 */
function createSnippetCandidate(
  snippet: any,
  contentType: string,
  resource: any,
  campaignId: string,
  source: string,
  confidence: number,
  chunkId: string,
  originalMetadata: any = {}
): SnippetCandidate {
  // Defensive checks for resource properties
  const resourceId = resource?.id || resource?.resource_id || "unknown";
  const resourceName =
    resource?.file_name ||
    resource?.resource_name ||
    resource?.name ||
    resourceId;

  console.log(`[Server] Creating snippet candidate:`, {
    snippetKeys: snippet ? Object.keys(snippet) : "null",
    resourceId,
    resourceName,
    contentType,
    campaignId,
  });

  return {
    id: snippet?.id || `${resourceId}_${contentType}_${Date.now()}`,
    text: JSON.stringify(snippet, null, 2),
    metadata: {
      fileKey: resourceId,
      fileName: resourceName,
      source,
      campaignId,
      entityType: contentType,
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
          chunkId,
          score: confidence,
        },
      },
    },
    sourceRef: {
      fileKey: resourceId,
      meta: {
        fileName: resourceName,
        campaignId,
      },
    },
  };
}

/**
 * Process AI Search response (structured JSON object)
 */
function processAISearchResponse(
  aiSearchResponse: any,
  resource: any,
  campaignId: string
): SnippetCandidate[] {
  const snippetCandidates: SnippetCandidate[] = [];

  console.log(`[Server] Processing AI Search response:`, {
    responseKeys: Object.keys(aiSearchResponse),
    responseType: typeof aiSearchResponse,
    resource: resource,
    resourceKeys: resource ? Object.keys(resource) : "null",
  });

  // Find all content type arrays in the response
  const foundContentTypes = Object.keys(aiSearchResponse).filter(
    (key) =>
      STRUCTURED_CONTENT_TYPES.includes(key as any) &&
      Array.isArray(aiSearchResponse[key]) &&
      aiSearchResponse[key].length > 0
  );

  console.log(
    `[Server] Found content types in AI Search response:`,
    foundContentTypes
  );

  // Process each content type
  for (const contentType of foundContentTypes) {
    const snippetArray = aiSearchResponse[contentType];

    console.log(
      `[Server] Processing ${snippetArray.length} ${contentType} items`
    );

    // Process each snippet in the content type array
    for (const snippet of snippetArray) {
      if (snippet && snippet.name) {
        const snippetCandidate = createSnippetCandidate(
          snippet,
          contentType,
          resource,
          campaignId,
          "library_autorag_ai_search",
          0.9,
          `${resource.id}_ai_${snippetCandidates.length}`,
          { aiSearchResponse: true }
        );
        snippetCandidates.push(snippetCandidate);
      }
    }

    console.log(
      `[Server] Processed ${snippetArray.length} ${contentType} snippets from AI Search response`
    );
  }

  return snippetCandidates;
}

export function parseSnippetCandidates(
  aiSearchResponse: any,
  resource: CampaignResource | any,
  campaignId: string
): SnippetCandidate[] {
  console.log(`[Server] parseSnippetCandidates called with:`, {
    aiSearchResponseType: typeof aiSearchResponse,
    aiSearchResponseKeys: aiSearchResponse
      ? Object.keys(aiSearchResponse)
      : "null",
    resourceType: typeof resource,
    resourceKeys: resource ? Object.keys(resource) : "null",
    campaignId,
  });

  if (!aiSearchResponse) {
    console.warn(`[Server] AI Search response is null/undefined`);
    return [];
  }

  if (!resource) {
    console.warn(`[Server] Resource is null/undefined`);
    return [];
  }

  return processAISearchResponse(aiSearchResponse, resource, campaignId);
}
