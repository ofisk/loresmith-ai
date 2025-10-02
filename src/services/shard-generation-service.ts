// Shard generation service for campaign resources
import { ShardFactory } from "../lib/shard-factory";
import { CampaignAutoRAG } from "./campaign-autorag-service";
import {
  executeAISearchWithRetry,
  parseAIResponse,
  filterParsedContentToResource,
} from "../lib/ai-search-utils";
import {
  notifyShardGeneration,
  notifyShardParseIssue,
} from "../lib/notifications";

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
}

// Generate shards for a campaign resource
export async function generateShardsForResource(
  options: ShardGenerationOptions
): Promise<ShardGenerationResult> {
  const {
    env,
    username,
    campaignId,
    campaignName,
    resource,
    campaignRagBasePath,
  } = options;
  const r = resource as any;

  try {
    console.log(`[ShardGeneration] Starting for resource: ${r.id}`);

    // Execute AI search with retry logic
    const aiSearchResult = await executeAISearchWithRetry(
      env,
      username,
      campaignId,
      r.file_name || r.id
    );

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

    console.log(`[ShardGeneration] AI Search completed for ${r.id}`);

    // Extract AI response from the result structure
    const actualResult = aiSearchResult as any;
    let aiResponse: string;

    if (actualResult.result?.response) {
      aiResponse = actualResult.result.response;
    } else if (actualResult.response) {
      aiResponse = actualResult.response;
    } else if (actualResult.result && typeof actualResult.result === "string") {
      aiResponse = actualResult.result;
    } else {
      console.warn(
        `[ShardGeneration] AI Search result has no accessible response property`
      );
      return {
        success: false,
        shardCount: 0,
        error: "No accessible response property",
      };
    }

    console.log(
      `[ShardGeneration] AI Response: ${aiResponse.substring(0, 200)}...`
    );

    // Parse the AI response to extract structured content
    try {
      const parsedContent = parseAIResponse(aiResponse);

      // Emit hidden debug counts per type
      try {
        const counts: Record<string, number> = {};
        for (const k of Object.keys(parsedContent || {})) {
          if (k !== "meta" && Array.isArray((parsedContent as any)[k])) {
            counts[k] = (parsedContent as any)[k].length;
          }
        }
        await notifyShardParseIssue(
          env,
          username,
          campaignName,
          r.file_name || r.id,
          {
            reason: "parsed_counts",
            counts,
            triedFilters: "folder+filename|folder|none",
          }
        );
      } catch (_e) {}

      if (parsedContent && typeof parsedContent === "object") {
        // Focus parsed content to the current resource
        const {
          filtered,
          preCounts,
          postCounts,
          docsSeen,
          metaDoc,
          metaMatches,
        } = filterParsedContentToResource(
          parsedContent as any,
          r.file_name || r.id
        );

        console.log(`[ShardGeneration] Document matching debug:`, {
          resourceFileName: r.file_name,
          resourceId: r.id,
          metaDoc,
          metaMatches,
        });

        try {
          await notifyShardParseIssue(
            env,
            username,
            campaignName,
            r.file_name || r.id,
            {
              reason: "post_filter_counts",
              preCounts,
              postCounts,
              docsSeen: Array.from(docsSeen),
            }
          );
        } catch (_e) {}

        // Save shard candidates to R2 staging (per-shard files)
        try {
          const campaignAutoRAG = new CampaignAutoRAG(
            env,
            env.AUTORAG_BASE_URL,
            campaignRagBasePath
          );

          const shardCandidates = ShardFactory.parseAISearchResponse(
            filtered as any,
            resource as any,
            campaignId
          );

          // Write per-shard files for precise approvals
          await campaignAutoRAG.saveShardCandidatesPerShard(
            r.id,
            shardCandidates,
            { fileName: r.file_name }
          );

          const createdCount = shardCandidates.length;

          // Create server groups for UI hint
          const serverGroups = [
            {
              key: "focused_approval",
              sourceRef: {
                fileKey: resource.id,
                meta: {
                  fileName: resource.file_name || resource.id,
                  campaignId,
                  entityType: shardCandidates[0]?.metadata?.entityType || "",
                  chunkId: "",
                  score: 0,
                },
              },
              shards: shardCandidates,
              created_at: new Date().toISOString(),
              campaignRagBasePath,
            },
          ];

          return {
            success: true,
            shardCount: createdCount,
            shardCandidates,
            serverGroups,
          };
        } catch (e) {
          console.warn(
            "[ShardGeneration] Failed to write candidates to R2 staging:",
            e
          );
          return {
            success: false,
            shardCount: 0,
            error: "Failed to write candidates to R2 staging",
          };
        }
      } else {
        console.warn(
          `[ShardGeneration] Invalid structured content format for ${r.id}`
        );
        await notifyShardParseIssue(
          env,
          username,
          campaignName,
          r.file_name || r.id,
          {
            reason: "invalid_structured_content",
            keys: Object.keys(parsedContent || {}),
          }
        );

        return {
          success: false,
          shardCount: 0,
          error: "Invalid structured content format",
        };
      }
    } catch (parseError) {
      console.error(
        `[ShardGeneration] Error parsing AI response for ${r.id}:`,
        parseError
      );
      console.log(`[ShardGeneration] Raw AI response: ${aiResponse}`);

      await notifyShardParseIssue(
        env,
        username,
        campaignName,
        r.file_name || r.id,
        {
          reason: "parse_exception",
          error: (parseError as Error)?.message,
        }
      );

      return {
        success: false,
        shardCount: 0,
        error: "Error parsing AI response",
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
