// Shard generation service for campaign resources
import { ShardFactory } from "@/lib/shard-factory";
import { CampaignAutoRAG } from "./campaign-autorag-service";
import {
  executeAISearchWithRetry,
  parseAIResponse,
  filterParsedContentToResource,
} from "@/lib/ai-search-utils";
import { notifyShardGeneration } from "@/lib/notifications";
import {
  normalizeResourceForShardGeneration,
  getAutoRAGSearchPath,
  validateSearchPath,
  logShardGenerationContext,
  validateShardGenerationOptions,
} from "@/lib/shard-generation-utils";

export interface ShardGenerationResult {
  success: boolean;
  shardCount: number;
  shardCandidates?: any[];
  serverGroups?: any[];
  error?: string;
}

export interface ShardGenerationOptions {
  env: any;
  username: string;
  campaignId: string;
  campaignName: string;
  resource: any;
  campaignRagBasePath: string;
  onShardsDiscovered?: (shards: any[], chunkNumber: number) => Promise<void>;
}

// Generate shards for a campaign resource
export async function generateShardsForResource(
  options: ShardGenerationOptions
): Promise<ShardGenerationResult> {
  // Validate all options upfront
  validateShardGenerationOptions(options);

  const {
    env,
    username,
    campaignId,
    campaignName,
    resource,
    campaignRagBasePath,
    onShardsDiscovered,
  } = options;

  // Normalize and validate the resource
  const normalizedResource = normalizeResourceForShardGeneration(resource);

  // Get the correct search path
  const searchPath = getAutoRAGSearchPath(normalizedResource);

  // Validate the search path
  validateSearchPath(searchPath);

  // Log context for debugging
  logShardGenerationContext(normalizedResource, searchPath, campaignId);

  try {
    console.log(
      `[ShardGeneration] Starting for resource: ${normalizedResource.id}`
    );

    // Track total shards discovered across all chunks
    let totalShardsDiscovered = 0;
    const allShardCandidates: any[] = [];

    // Create streaming callback for chunk processing
    const streamingCallback = async (chunkResult: any, chunkNumber: number) => {
      console.log(
        `[ShardGeneration] DEBUG: Streaming callback called for chunk ${chunkNumber}`
      );
      console.log(
        `[ShardGeneration] DEBUG: Chunk result structure:`,
        JSON.stringify(chunkResult, null, 2)
      );
      console.log(
        `[ShardGeneration] DEBUG: Chunk result keys:`,
        Object.keys(chunkResult || {})
      );
      console.log(
        `[ShardGeneration] DEBUG: Response type: ${typeof chunkResult?.response}, value: ${chunkResult?.response}`
      );
      console.log(
        `[ShardGeneration] DEBUG: Data type: ${typeof chunkResult?.data}, value: ${chunkResult?.data}`
      );

      // The chunk result should have 'result' with the structured content
      if (!chunkResult || !chunkResult.result) {
        console.log(
          `[ShardGeneration] DEBUG: Early return - chunkResult: ${!!chunkResult}, result: ${!!chunkResult?.result}`
        );
        return;
      }

      console.log(
        `[ShardGeneration] Processing chunk ${chunkNumber} with structured content`
      );

      try {
        // Extract AI response from chunk result
        let aiResponse: string;

        // The structured content should be in chunkResult.result
        if (chunkResult.result && typeof chunkResult.result === "string") {
          aiResponse = chunkResult.result;
        } else if (
          chunkResult.result?.response &&
          typeof chunkResult.result.response === "string"
        ) {
          aiResponse = chunkResult.result.response;
        } else {
          console.warn(
            `[ShardGeneration] Chunk ${chunkNumber} has no accessible result property`
          );
          console.warn(
            `[ShardGeneration] Chunk result structure:`,
            JSON.stringify(chunkResult, null, 2)
          );
          console.warn(
            `[ShardGeneration] Result type: ${typeof chunkResult.result}, value: ${chunkResult.result}`
          );
          return;
        }

        // Parse the AI response to extract structured content
        console.log(
          `[ShardGeneration] DEBUG: Raw AI response length: ${aiResponse.length}`
        );
        console.log(
          `[ShardGeneration] DEBUG: Raw AI response preview: ${aiResponse.substring(0, 200)}...`
        );

        const parsedContent = parseAIResponse(aiResponse);
        console.log(
          `[ShardGeneration] DEBUG: Parsed content type: ${typeof parsedContent}`
        );
        console.log(
          `[ShardGeneration] DEBUG: Parsed content keys:`,
          parsedContent ? Object.keys(parsedContent) : "null"
        );

        if (parsedContent && typeof parsedContent === "object") {
          // Focus parsed content to the current resource
          const { filtered } = filterParsedContentToResource(
            parsedContent as any,
            searchPath
          );

          // Create shard candidates from this chunk
          console.log(
            `[ShardGeneration] DEBUG: About to parse AI response for chunk ${chunkNumber}`
          );
          console.log(
            `[ShardGeneration] DEBUG: Filtered content keys:`,
            Object.keys(filtered || {})
          );
          console.log(
            `[ShardGeneration] DEBUG: Filtered content sample:`,
            JSON.stringify(filtered, null, 2).substring(0, 500)
          );

          const shardCandidates = ShardFactory.parseAISearchResponse(
            filtered as any,
            resource as any,
            campaignId
          );

          console.log(
            `[ShardGeneration] DEBUG: ShardFactory returned ${shardCandidates.length} candidates`
          );

          if (shardCandidates.length > 0) {
            console.log(
              `[ShardGeneration] Chunk ${chunkNumber} generated ${shardCandidates.length} shards`
            );

            // Track total shards
            totalShardsDiscovered += shardCandidates.length;
            allShardCandidates.push(...shardCandidates);

            // Save shard candidates to R2 staging
            const campaignAutoRAG = new CampaignAutoRAG(
              env,
              env.AUTORAG_BASE_URL,
              campaignRagBasePath
            );

            await campaignAutoRAG.saveShardCandidatesPerShard(
              normalizedResource.id,
              shardCandidates,
              { fileName: normalizedResource.file_name }
            );

            // Send streaming notification
            await notifyShardGeneration(
              env,
              username,
              campaignName,
              normalizedResource.file_name,
              shardCandidates.length,
              { campaignId, resourceId: normalizedResource.id, chunkNumber }
            );

            // Call the optional callback
            if (onShardsDiscovered) {
              await onShardsDiscovered(shardCandidates, chunkNumber);
            }
          }
        }
      } catch (chunkError) {
        console.error(
          `[ShardGeneration] Error processing chunk ${chunkNumber}:`,
          chunkError
        );
        // Don't throw - continue with other chunks
      }
    };

    // DEBUG: Make side-by-side calls to compare filtered vs unfiltered results
    console.log(
      `[ShardGeneration] DEBUG: Making side-by-side comparison calls`
    );

    // Call 1: Unfiltered search (no filters at all)
    console.log(`[ShardGeneration] DEBUG: Call 1 - UNFILTERED search`);
    const unfilteredResult = await executeAISearchWithRetry(
      env,
      username,
      campaignId,
      searchPath,
      1, // maxRetries
      undefined, // No streaming callback for debug
      true // debugUnfiltered = true
    );

    console.log(
      `[ShardGeneration] DEBUG: Unfiltered result:`,
      JSON.stringify(unfilteredResult, null, 2)
    );

    // Call 2: Filtered search (current approach)
    console.log(
      `[ShardGeneration] DEBUG: Call 2 - FILTERED search with folder filter`
    );
    const filteredResult = await executeAISearchWithRetry(
      env,
      username,
      campaignId,
      searchPath,
      1, // maxRetries
      streamingCallback,
      false // debugUnfiltered = false (use filters)
    );

    console.log(
      `[ShardGeneration] DEBUG: Filtered result:`,
      JSON.stringify(filteredResult, null, 2)
    );

    // Use the filtered result for the main flow
    const aiSearchResult = filteredResult;

    // Ensure we have a valid result object
    if (!aiSearchResult) {
      console.warn(
        "[ShardGeneration] AI Search returned undefined, using empty result"
      );
      return {
        success: false,
        shardCount: 0,
        error: "AI Search returned undefined",
      };
    }

    console.log(
      `[ShardGeneration] AI Search completed for ${normalizedResource.id}. Total shards discovered: ${totalShardsDiscovered}`
    );

    // Return aggregated results from streaming processing
    if (totalShardsDiscovered > 0) {
      // Create server groups for UI hint
      const serverGroups = [
        {
          key: "focused_approval",
          sourceRef: {
            fileKey: resource.id,
            meta: {
              fileName: resource.file_name || resource.id,
              campaignId,
              entityType: allShardCandidates[0]?.metadata?.entityType || "",
              chunkId: "",
              score: 0,
            },
          },
          shards: allShardCandidates,
          created_at: new Date().toISOString(),
          campaignRagBasePath,
        },
      ];

      // Send final summary notification
      await notifyShardGeneration(
        env,
        username,
        campaignName,
        normalizedResource.file_name,
        totalShardsDiscovered,
        { campaignId, resourceId: normalizedResource.id }
      );

      return {
        success: true,
        shardCount: totalShardsDiscovered,
        shardCandidates: allShardCandidates,
        serverGroups,
      };
    } else {
      // No shards found - send final notification
      await notifyShardGeneration(
        env,
        username,
        campaignName,
        normalizedResource.file_name,
        0,
        { campaignId, resourceId: normalizedResource.id }
      );

      return {
        success: false,
        shardCount: 0,
        error: "No shards discovered from any chunks",
      };
    }
  } catch (error) {
    console.error(`[ShardGeneration] Error generating shards:`, error);
    return {
      success: false,
      shardCount: 0,
      error: "Shard generation failed",
    };
  }
}

// Send shard generation notification
export async function notifyShardCount(
  env: any,
  username: string,
  campaignId: string,
  campaignName: string,
  resourceFileName: string,
  resourceId: string,
  count: number
) {
  try {
    await notifyShardGeneration(
      env,
      username,
      campaignName,
      resourceFileName,
      count,
      count > 0 ? { campaignId, resourceId } : undefined
    );
  } catch (error) {
    console.error(
      "[ShardGeneration] Failed to send shard generation notification:",
      error
    );
  }
}
