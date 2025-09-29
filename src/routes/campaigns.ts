import type { Context } from "hono";
import { ShardFactory } from "../lib/shard-factory";
import { getDAOFactory } from "../dao/dao-factory";
import {
  notifyShardGeneration,
  notifyCampaignCreated,
  notifyCampaignFileAdded,
  notifyShardParseIssue,
} from "../lib/notifications";
import { RPG_EXTRACTION_PROMPTS } from "../lib/prompts/rpg-extraction-prompts";
import { getLibraryAutoRAGService } from "../lib/service-factory";
import type { Env } from "../middleware/auth";
import { API_CONFIG } from "../shared-config";
import type { AuthPayload } from "../services/auth-service";
import { CampaignAutoRAG } from "../services/campaign-autorag-service";

// Extend the context to include userAuth
type ContextWithAuth = Context<{ Bindings: Env }> & {
  userAuth?: AuthPayload;
};

// Get all campaigns for user
export async function handleGetCampaigns(c: ContextWithAuth) {
  try {
    console.log("[Server] GET /campaigns - starting request");
    console.log("[Server] Context keys:", Object.keys(c));

    const userAuth = (c as any).userAuth;
    console.log("[Server] User auth from middleware:", userAuth);

    if (!userAuth) {
      console.error("[Server] No user auth found in context");
      return c.json({ error: "Authentication required" }, 401);
    }

    const campaignDAO = getDAOFactory(c.env).campaignDAO;
    const campaigns = await campaignDAO.getCampaignsByUserWithMapping(
      userAuth.username
    );

    console.log(
      `[Server] Found ${campaigns.length} campaigns for user ${userAuth.username}`
    );

    return c.json({ campaigns: campaigns });
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Create new campaign
export async function handleCreateCampaign(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const { name, description } = await c.req.json();

    if (!name) {
      return c.json({ error: "Campaign name is required" }, 400);
    }

    const campaignId = crypto.randomUUID();
    const campaignRagBasePath = `campaigns/${campaignId}`;
    const now = new Date().toISOString();

    // Create campaign using DAO
    const campaignDAO = getDAOFactory(c.env).campaignDAO;
    console.log(`[Server] Creating campaign in database: ${campaignId}`);
    try {
      await campaignDAO.createCampaign(
        campaignId,
        name,
        userAuth.username,
        description || "",
        campaignRagBasePath
      );
      console.log(
        `[Server] Campaign created successfully in database: ${campaignId}`
      );
    } catch (dbError) {
      console.error(
        `[Server] Database error creating campaign ${campaignId}:`,
        dbError
      );
      throw dbError;
    }

    // Initialize CampaignAutoRAG folders
    try {
      const campaignAutoRAG = new CampaignAutoRAG(
        c.env,
        c.env.AUTORAG_BASE_URL,
        campaignRagBasePath
      );
      await campaignAutoRAG.initFolders();

      console.log(
        `[Server] Initialized CampaignAutoRAG folders for campaign: ${campaignId}`
      );
    } catch (autoRagError) {
      console.error(
        `[Server] Failed to initialize CampaignAutoRAG for campaign ${campaignId}:`,
        autoRagError
      );
      // Don't fail the campaign creation if AutoRAG initialization fails
    }

    const newCampaign = {
      campaignId,
      name,
      description: description || "",
      campaignRagBasePath,
      createdAt: now,
      updatedAt: now,
    };

    console.log(
      `[Server] Created campaign: ${campaignId} for user ${userAuth.username}`
    );

    // Notify campaign creation
    try {
      await notifyCampaignCreated(c.env, userAuth.username, name, description);
    } catch (_e) {}

    return c.json({ success: true, campaign: newCampaign }, 201);
  } catch (error) {
    console.error("Error creating campaign:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Get specific campaign
export async function handleGetCampaign(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const campaignId = c.req.param("campaignId");

    const campaignDAO = getDAOFactory(c.env).campaignDAO;
    const campaign = await campaignDAO.getCampaignByIdWithMapping(
      campaignId,
      userAuth.username
    );

    if (!campaign) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    return c.json({ campaign });
  } catch (error) {
    console.error("Error fetching campaign:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Get campaign resources
export async function handleGetCampaignResources(c: ContextWithAuth) {
  try {
    const campaignId = c.req.param("campaignId");

    const campaignDAO = getDAOFactory(c.env).campaignDAO;
    const resources = await campaignDAO.getCampaignResources(campaignId);

    return c.json({ resources });
  } catch (error) {
    console.error("Error fetching campaign resources:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function handleUpdateCampaign(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const campaignId = c.req.param("campaignId");
    const body = (await c.req.json()) as {
      name?: string;
      description?: string;
    };

    console.log(`[Server] PUT /campaigns/${campaignId} - starting request`);
    console.log("[Server] User auth from middleware:", userAuth);
    console.log("[Server] Update data:", body);

    const campaignDAO = getDAOFactory(c.env).campaignDAO;

    // First, check if the campaign exists and belongs to the user
    const campaign = await campaignDAO.getCampaignById(campaignId);
    if (!campaign || campaign.username !== userAuth.username) {
      console.log(
        `[Server] Campaign ${campaignId} not found or doesn't belong to user ${userAuth.username}`
      );
      return c.json({ error: "Campaign not found" }, 404);
    }

    console.log("[Server] Found campaign:", campaign);

    // Update the campaign using DAO
    await campaignDAO.updateCampaign(campaignId, {
      name: body.name || campaign.name,
      description: body.description || "",
    });

    console.log(`[Server] Updated campaign ${campaignId}`);

    // Fetch the updated campaign
    const updatedCampaign = await campaignDAO.getCampaignByIdWithMapping(
      campaignId,
      userAuth.username
    );

    return c.json({
      success: true,
      message: "Campaign updated successfully",
      campaign: updatedCampaign,
    });
  } catch (error) {
    console.error("Error updating campaign:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function handleDeleteCampaign(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const campaignId = c.req.param("campaignId");

    console.log(`[Server] DELETE /campaigns/${campaignId} - starting request`);
    console.log("[Server] User auth from middleware:", userAuth);

    const campaignDAO = getDAOFactory(c.env).campaignDAO;

    // First, check if the campaign exists and belongs to the user
    const campaign = await campaignDAO.getCampaignById(campaignId);
    if (!campaign || campaign.username !== userAuth.username) {
      console.log(
        `[Server] Campaign ${campaignId} not found or doesn't belong to user ${userAuth.username}`
      );
      return c.json({ error: "Campaign not found" }, 404);
    }

    console.log("[Server] Found campaign:", campaign);

    // Delete the campaign (DAO handles cascading deletes)
    await campaignDAO.deleteCampaign(campaignId);

    console.log(`[Server] Deleted campaign ${campaignId}`);

    return c.json({
      success: true,
      message: "Campaign deleted successfully",
      deletedCampaign: campaign,
    });
  } catch (error) {
    console.error("Error deleting campaign:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Delete all campaigns for user
export async function handleDeleteAllCampaigns(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;

    console.log("[Server] DELETE /campaigns - starting request");
    console.log("[Server] User auth from middleware:", userAuth);

    const campaignDAO = getDAOFactory(c.env).campaignDAO;

    // Delete all campaigns for the user
    const deletedCampaigns = await campaignDAO.deleteAllCampaignsForUser(
      userAuth.username
    );

    console.log(
      `[Server] Found ${deletedCampaigns.length} campaigns to delete`
    );

    if (deletedCampaigns.length === 0) {
      return c.json({
        success: true,
        message: "No campaigns found to delete",
        deletedCount: 0,
      });
    }

    console.log(`[Server] Deleted campaigns for user ${userAuth.username}`);
    return c.json({
      success: true,
      message: "All campaigns deleted successfully",
      deletedCount: deletedCampaigns.length,
      deletedCampaigns,
    });
  } catch (error) {
    console.error("Error deleting all campaigns:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Add resource to campaign
export async function handleAddResourceToCampaign(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const campaignId = c.req.param("campaignId");
    const { type, id, name } = await c.req.json();

    console.log(
      `[Server] POST /campaigns/${campaignId}/resource - starting request`
    );
    console.log("[Server] User auth from middleware:", userAuth);
    console.log("[Server] Request body:", { type, id, name });

    if (!type || !id) {
      return c.json({ error: "Resource type and id are required" }, 400);
    }

    const campaignDAO = getDAOFactory(c.env).campaignDAO;

    // First, check if the campaign exists and belongs to the user
    const campaign = await campaignDAO.getCampaignById(campaignId);
    if (!campaign || campaign.username !== userAuth.username) {
      console.log(
        `[Server] Campaign ${campaignId} not found or doesn't belong to user ${userAuth.username}`
      );
      return c.json({ error: "Campaign not found" }, 404);
    }

    console.log("[Server] Found campaign:", campaign);

    // Check if resource already exists in this campaign
    const existingResource = await campaignDAO.getFileResourceByFileKey(
      campaignId,
      id
    );

    if (existingResource) {
      console.log(
        `[Server] Resource ${id} already exists in campaign ${campaignId}`
      );
      // Return success instead of error - this is idempotent behavior
      return c.json(
        {
          resource: {
            id: existingResource.id,
            campaignId,
            fileKey: id,
            fileName: existingResource.file_name,
            description: "",
            tags: "[]",
            status: "active",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          message: "Resource already exists in this campaign",
        },
        200
      );
    }

    // Add the resource to the campaign
    const resourceId = crypto.randomUUID();

    await campaignDAO.addFileResourceToCampaign(
      resourceId,
      campaignId,
      id,
      name || id,
      "",
      "[]",
      "active"
    );

    console.log(`[Server] Added resource ${id} to campaign ${campaignId}`);

    // Notify file added to campaign (before shard generation)
    try {
      await notifyCampaignFileAdded(
        c.env,
        userAuth.username,
        campaign.name,
        name || id
      );
    } catch (_e) {}

    // Generate shards for the newly added resource
    try {
      console.log(`[Server] Generating shards for campaign: ${campaignId}`);

      const campaignRagBasePath = await campaignDAO.getCampaignRagBasePath(
        userAuth.username,
        campaignId
      );
      if (!campaignRagBasePath) {
        console.warn(
          `[Server] Campaign AutoRAG not initialized for campaign: ${campaignId}`
        );
        // Continue without shard generation
      } else {
        // Fetch the specific resource we just created to avoid ordering issues
        const resource = await campaignDAO.getCampaignResourceById(
          resourceId,
          campaignId
        );
        if (!resource) {
          console.warn(
            `[Server] Newly added resource not found in campaign: ${campaignId} (resourceId: ${resourceId})`
          );
          return c.json({
            success: true,
            message:
              "Resource added to campaign. Shard generation deferred (resource lookup failed).",
            resource: {
              id: resourceId,
              name: name || id,
              type: "file",
            },
          });
        } else {
          const r = resource as any;
          // Local helper to send a single consistent notification about shard count
          const notifyShardCount = async (count: number) => {
            try {
              const campaignData =
                await campaignDAO.getCampaignById(campaignId);
              if (campaignData) {
                await notifyShardGeneration(
                  c.env,
                  userAuth.username,
                  campaignData.name,
                  resource.file_name || resource.id,
                  count,
                  count > 0
                    ? { campaignId, resourceId: resource.id }
                    : undefined
                );
              }
            } catch (error) {
              console.error(
                "[Server] Failed to send shard generation notification:",
                error
              );
            }
          };
          console.log(`[Server] Generating shards for resource:`, resource);

          console.log(`[Server] Getting library AutoRAG service`);
          const libraryAutoRAG = getLibraryAutoRAGService(
            c.env,
            userAuth.username
          );
          console.log(`[Server] Library AutoRAG:`, libraryAutoRAG);

          // Use the centralized RPG extraction prompt
          const structuredExtractionPrompt =
            RPG_EXTRACTION_PROMPTS.formatStructuredContentPrompt(
              campaignId,
              r.file_name || r.id
            );

          console.log(`{[Server]} Extracting structured content from ${r.id}`);

          // Call AutoRAG AI Search with the detailed prompt
          console.log(`[Server] Calling AutoRAG AI Search with filters:`, {
            filename: r.file_name,
            prompt: `${structuredExtractionPrompt.substring(0, 200)}...`,
          });

          // Retry AI search once on transient failures (e.g., 400 due to race/format)
          async function runAISearchOnce() {
            const fileKey = (r as any).file_key as string;
            const fileNameForFilter =
              r.file_name ||
              (typeof fileKey === "string"
                ? fileKey.substring(fileKey.lastIndexOf("/") + 1)
                : undefined);

            console.log("[Server] AutoRAG filter inputs:", {
              fileKey,
              fileNameForFilter,
            });

            // Use the updated prompt format that matches the working manual prompt

            // Helpers to match items to this resource's filename
            const normalizeName = (s: string) =>
              (s || "")
                .toLowerCase()
                .split("/")
                .pop()!
                .replace(/\.[a-z0-9]+$/, "")
                .replace(/[^a-z0-9]+/g, "");
            const targetDocNorm = normalizeName(r.file_name || r.id);
            const docMatches = (doc: unknown) => {
              if (typeof doc !== "string") return false;
              const d = normalizeName(doc);
              return (
                d === targetDocNorm ||
                d.includes(targetDocNorm) ||
                targetDocNorm.includes(d)
              );
            };

            // Helper for counting without throwing (returns total and matched-to-file)
            const tryCount = (raw: string) => {
              try {
                let s = (raw || "").trim();
                if (s.includes("```")) {
                  s = s.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "");
                }
                const first = s.indexOf("{");
                const last = s.lastIndexOf("}");
                if (first !== -1 && last !== -1 && last > first) {
                  s = s.slice(first, last + 1);
                }
                const parsed = JSON.parse(s) as any;
                const keys = Object.keys(parsed || {}).filter(
                  (k) => k !== "meta" && Array.isArray(parsed[k])
                );
                const counts: Record<string, number> = {};
                const matchedCounts: Record<string, number> = {};
                let total = 0;
                let matchedTotal = 0;
                for (const k of keys) {
                  const arr = (parsed[k] || []) as any[];
                  const n = arr.length;
                  counts[k] = n;
                  total += n;
                  const matched = arr.filter((it) =>
                    docMatches((it as any)?.source?.doc)
                  ).length;
                  matchedCounts[k] = matched;
                  matchedTotal += matched;
                }
                return {
                  ok: true,
                  total,
                  counts,
                  keys,
                  matchedCounts,
                  matchedTotal,
                };
              } catch {
                return {
                  ok: false,
                  total: 0,
                  counts: {},
                  keys: [] as string[],
                  matchedCounts: {},
                  matchedTotal: 0,
                };
              }
            };

            // First attempt: prompt-only (no metadata filters)
            {
              console.log(
                "[Server][AI Search][prompt-only] full prompt:\n" +
                  structuredExtractionPrompt
              );
              const res = await libraryAutoRAG.aiSearch(
                structuredExtractionPrompt,
                {
                  max_results: 50,
                  rewrite_query: false,
                  // Enforce exact document by full staging key (Solution 1)
                  filters: {
                    type: "and",
                    filters: [
                      { key: "file_key", op: "eq", value: fileKey } as any,
                    ],
                  },
                }
              );
              const preview =
                typeof res.response === "string" ? res.response : "";
              const info = tryCount(preview);
              const dataDocs = Array.isArray((res as any)?.data)
                ? Array.from(
                    new Set(
                      (res as any).data
                        .map((d: any) => d?.filename || d?.attributes?.filename)
                        .filter((x: any) => typeof x === "string")
                    )
                  )
                : [];
              console.log("[Server][AI Search][prompt-only]", {
                ...info,
                dataDocs,
              });

              // TODO(ofisk): temporary hack until indexing stabilizes.
              // If zero docs are detected, automatically trigger a re-index in the background
              // and notify the user. Remove this block once AutoRAG indexing is stable.
              if (!info.ok || (info.matchedTotal === 0 && info.total === 0)) {
                try {
                  console.log(
                    "[Server][AI Search][diagnostics] Probing document presence via metadata search"
                  );
                  const metaProbe = await libraryAutoRAG.search("", {
                    limit: 5,
                    filters: {
                      type: "and",
                      filters: [
                        { key: "file_key", value: fileKey, op: "eq" } as any,
                      ],
                    },
                  });
                  console.log(
                    "[Server][AI Search][diagnostics] Metadata probe result:",
                    metaProbe
                  );
                } catch (probeErr) {
                  console.error(
                    "[Server][AI Search][diagnostics] Metadata probe failed:",
                    probeErr
                  );
                }

                // Fire-and-forget re-index request via sync queue service route
                try {
                  const triggerUrl = `${API_CONFIG.getApiBaseUrl(c.env)}${API_CONFIG.ENDPOINTS.RAG.TRIGGER_INDEXING}`;
                  const authHeader = c.req.header("Authorization") || "";
                  const resp = await fetch(triggerUrl, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: authHeader,
                    },
                    body: JSON.stringify({ fileKey }),
                  });
                  console.log(
                    "[Server][AI Search][diagnostics] Re-index trigger response:",
                    resp.status
                  );
                } catch (reindexErr) {
                  console.error(
                    "[Server][AI Search][diagnostics] Failed to trigger re-index:",
                    reindexErr
                  );
                }

                // Surface a user-facing notification that we queued a re-index
                try {
                  await notifyShardParseIssue(
                    c.env,
                    userAuth.username,
                    campaign?.name || "unknown",
                    r.file_name || r.id,
                    {
                      reason: "reindex_triggered",
                      message:
                        "Indexing not found; a re-index has been queued automatically.",
                      hidden: false,
                    }
                  );
                } catch (_e) {}
              }
              try {
                await notifyShardParseIssue(
                  c.env,
                  userAuth.username,
                  campaign?.name || "unknown",
                  r.file_name || r.id,
                  {
                    reason: "ai_search_prompt_only",
                    prompt: structuredExtractionPrompt,
                    counts: info.counts,
                    total: info.total,
                    matchedCounts: info.matchedCounts,
                    matchedTotal: info.matchedTotal,
                    dataDocs,
                  }
                );
              } catch (_e) {}
              if (info.ok && (info.matchedTotal > 0 || info.total > 0)) {
                return res;
              }
            }
          }
          let aiSearchResult: any;
          try {
            aiSearchResult = await runAISearchOnce();
          } catch (firstErr) {
            console.warn(
              "[Server] AI Search failed once, retrying in 500ms:",
              firstErr
            );
            await new Promise((r) => setTimeout(r, 500));
            aiSearchResult = await runAISearchOnce();
          }

          console.log(`[Server] AutoRAG AI Search completed with result:`, {
            hasResponse: !!aiSearchResult.response,
            hasData: !!aiSearchResult.data,
            dataLength: aiSearchResult.data?.length || 0,
            resultKeys: Object.keys(aiSearchResult),
          });

          console.log(`[Server] AutoRAG AI Search completed for ${r.id}`);
          // Type assertion to handle the actual API response structure
          const actualResult = aiSearchResult as any;

          console.log(`[Server] AI Search result structure:`, {
            hasResponse: !!actualResult.response,
            hasResult: !!actualResult.result,
            hasSuccess: !!actualResult.success,
            responseType: typeof actualResult.response,
            resultType: typeof actualResult.result,
            resultKeys: Object.keys(actualResult),
          });

          // Handle the actual API response structure
          let aiResponse: string;
          if (actualResult.response) {
            aiResponse = actualResult.response;
          } else if (
            actualResult.result &&
            typeof actualResult.result === "string"
          ) {
            aiResponse = actualResult.result;
          } else if (actualResult.result?.response) {
            aiResponse = actualResult.result.response;
          } else {
            console.warn(
              `[Server] AI Search result has no accessible response property`
            );
            console.log(`[Server] Full AI Search result:`, actualResult);
            return; // Skip shard generation if no response
          }

          console.log(
            `[Server] AI Response: ${aiResponse.substring(0, 200)}...`
          );

          // Parse the AI response to extract structured content
          try {
            // Robust JSON extraction and cleaning
            function extractJson(text: string): string | null {
              let s = (text || "").trim();
              if (s.includes("```")) {
                s = s.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "");
              }
              const firstIdx = s.indexOf("{");
              const lastIdx = s.lastIndexOf("}");
              if (firstIdx !== -1 && lastIdx !== -1 && lastIdx > firstIdx) {
                return s.slice(firstIdx, lastIdx + 1);
              }
              return null;
            }

            const cleanResponse = aiResponse.trim();
            const jsonSlice = extractJson(cleanResponse);
            const parsedContent = JSON.parse(jsonSlice || cleanResponse);

            console.log(`[Server] Parsed AI Search response structure:`, {
              keys: Object.keys(parsedContent),
              hasMeta: !!parsedContent.meta,
              contentTypes: Object.keys(parsedContent).filter(
                (key) => key !== "meta" && Array.isArray(parsedContent[key])
              ),
            });

            // Emit hidden debug counts per type
            try {
              const counts: Record<string, number> = {};
              for (const k of Object.keys(parsedContent || {})) {
                if (k !== "meta" && Array.isArray((parsedContent as any)[k])) {
                  counts[k] = (parsedContent as any)[k].length;
                }
              }
              await notifyShardParseIssue(
                c.env,
                userAuth.username,
                campaign.name,
                r.file_name || r.id,
                {
                  reason: "parsed_counts",
                  counts,
                  triedFilters: "folder+filename|folder|none",
                }
              );
            } catch (_e) {}

            if (parsedContent && typeof parsedContent === "object") {
              // Filter parsed items to the current resource's document only
              const normalizeName = (s: string) =>
                (s || "")
                  .toLowerCase()
                  .split("/")
                  .pop()!
                  .replace(/\.[a-z0-9]+$/, "")
                  .replace(/[^a-z0-9]+/g, "");
              const targetDocNorm = normalizeName(r.file_name || r.id);
              const docMatches = (doc: unknown) => {
                if (typeof doc !== "string") return false;
                const d = normalizeName(doc);
                return (
                  d === targetDocNorm ||
                  d.includes(targetDocNorm) ||
                  targetDocNorm.includes(d)
                );
              };

              const preCounts: Record<string, number> = {};
              const postCounts: Record<string, number> = {};
              const filtered: Record<string, any> = {};
              const docsSeen = new Set<string>();
              for (const key of Object.keys(parsedContent)) {
                const val = (parsedContent as any)[key];
                if (key === "meta" || !Array.isArray(val)) {
                  filtered[key] = val;
                  continue;
                }
                preCounts[key] = val.length;
                const arr = (val as any[]).filter((it) => {
                  const d = (it as any)?.source?.doc;
                  if (typeof d === "string") docsSeen.add(d);
                  return docMatches(d);
                });
                postCounts[key] = arr.length;
                filtered[key] = arr;
              }

              try {
                await notifyShardParseIssue(
                  c.env,
                  userAuth.username,
                  campaign.name,
                  r.file_name || r.id,
                  {
                    reason: "post_filter_counts",
                    preCounts,
                    postCounts,
                    docsSeen: Array.from(docsSeen),
                  }
                );
              } catch (_e) {}
              // Save shard candidates to R2 staging first (single file for this generation)
              try {
                const campaignAutoRAG = new CampaignAutoRAG(
                  c.env,
                  c.env.AUTORAG_BASE_URL,
                  campaignRagBasePath || `campaigns/${campaignId}`
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
                if (createdCount > 0) {
                  await notifyShardCount(createdCount);
                }

                // Return an immediate UI hint using the generated candidates
                const serverGroups = [
                  {
                    key: "focused_approval",
                    sourceRef: {
                      fileKey: resource.id,
                      meta: {
                        fileName: resource.file_name || resource.id,
                        campaignId,
                        entityType:
                          shardCandidates[0]?.metadata?.entityType || "",
                        chunkId: "",
                        score: 0,
                      },
                    },
                    shards: shardCandidates,
                    created_at: new Date().toISOString(),
                    campaignRagBasePath:
                      campaignRagBasePath || `campaigns/${campaignId}`,
                  },
                ];

                return c.json({
                  success: true,
                  message: `Resource added to campaign successfully. Generated ${createdCount} shards for review.`,
                  resource: {
                    id: r.id,
                    name: r.file_name || r.id,
                    type: "file",
                  },
                  shards: {
                    count: createdCount,
                    campaignId,
                    resourceId: r.id,
                    groups: serverGroups,
                    message: `Generated ${createdCount} shards from "${r.file_name || r.id}".`,
                  },
                  ui_hint: {
                    type: "shards_ready",
                    data: {
                      campaignId,
                      resourceId: r.id,
                      groups: serverGroups,
                    },
                  },
                });
              } catch (e) {
                console.warn(
                  "[Server] Failed to write candidates to R2 staging:",
                  e
                );
              }
              // If we reach here without returning, treat as zero created for safety
              await notifyShardCount(0);
              return c.json({
                success: true,
                message:
                  "Resource added to campaign successfully. Shards were saved for review.",
                resource: { id: r.id, name: r.file_name || r.id, type: "file" },
              });
            } else {
              console.warn(
                `[Server] Invalid structured content format for ${r.id}`
              );
              await notifyShardCount(0);
              await notifyShardParseIssue(
                c.env,
                userAuth.username,
                campaign.name,
                r.file_name || r.id,
                {
                  reason: "invalid_structured_content",
                  keys: Object.keys(parsedContent || {}),
                }
              );

              return c.json({
                success: true,
                message:
                  "Resource added to campaign successfully. Could not generate shards from this resource.",
                resource: {
                  id: r.id,
                  name: r.file_name || r.id,
                  type: "file",
                },
              });
            }
          } catch (parseError) {
            console.error(
              `[Server] Error parsing AI response for ${r.id}:`,
              parseError
            );
            console.log(`[Server] Raw AI response: ${aiResponse}`);
            await notifyShardCount(0);
            await notifyShardParseIssue(
              c.env,
              userAuth.username,
              campaign.name,
              r.file_name || r.id,
              {
                reason: "parse_exception",
                error: (parseError as Error)?.message,
              }
            );

            return c.json({
              success: true,
              message:
                "Resource added to campaign successfully. Error occurred while generating shards.",
              resource: {
                id: r.id,
                name: r.file_name || r.id,
                type: "file",
              },
              error: "Shard generation failed",
            });
          }
        }
      }
    } catch (shardError) {
      console.error(`[Server] Error generating shards:`, shardError);
      // Still notify user with zero shards when generation fails
      try {
        // reuse local helper if available
        // If helper is not in scope (type narrowing), send directly
        const campaignData = await campaignDAO.getCampaignById(campaignId);
        if (campaignData) {
          await notifyShardGeneration(
            c.env,
            userAuth.username,
            campaignData.name,
            name || id,
            0
          );
        }
      } catch (notifyErr) {
        console.error(
          "[Server] Failed to send zero-shard notification after error:",
          notifyErr
        );
      }
      // Don't fail the resource addition if shard generation fails
    }

    const newResource = {
      id: resourceId,
      campaignId,
      fileKey: id,
      fileName: name || id,
      description: "",
      tags: "[]",
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return c.json({ resource: newResource }, 201);
  } catch (error) {
    console.error("Error adding resource to campaign:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Remove resource from campaign
export async function handleRemoveResourceFromCampaign(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const campaignId = c.req.param("campaignId");
    const resourceId = c.req.param("resourceId");

    console.log(
      `[Server] DELETE /campaigns/${campaignId}/resource/${resourceId} - starting request`
    );
    console.log("[Server] User auth from middleware:", userAuth);

    const campaignDAO = getDAOFactory(c.env).campaignDAO;

    // First, check if the campaign exists and belongs to the user
    const campaign = await campaignDAO.getCampaignById(campaignId);
    if (!campaign || campaign.username !== userAuth.username) {
      console.log(
        `[Server] Campaign ${campaignId} not found or doesn't belong to user ${userAuth.username}`
      );
      return c.json({ error: "Campaign not found" }, 404);
    }

    console.log("[Server] Found campaign:", campaign);

    // Check if the resource exists in this campaign
    const resource = await campaignDAO.getCampaignResourceById(
      resourceId,
      campaignId
    );

    if (!resource) {
      console.log(
        `[Server] Resource ${resourceId} not found in campaign ${campaignId}`
      );
      return c.json({ error: "Resource not found in this campaign" }, 404);
    }

    console.log("[Server] Found resource:", resource);

    // Remove the resource from the campaign
    await campaignDAO.removeCampaignResource(campaignId, resourceId);

    console.log(
      `[Server] Removed resource ${resourceId} from campaign ${campaignId}`
    );

    return c.json({
      success: true,
      message: "Resource removed from campaign successfully",
      removedResource: resource,
    });
  } catch (error) {
    console.error("Error removing resource from campaign:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}
