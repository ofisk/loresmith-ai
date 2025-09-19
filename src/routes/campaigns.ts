import type { Context } from "hono";
import { ShardAgent } from "../agents/shard-agent";
import { getDAOFactory } from "../dao/dao-factory";
import { notifyShardGeneration } from "../lib/notifications";
import { RPG_EXTRACTION_PROMPTS } from "../lib/prompts/rpg-extraction-prompts";
import { getLibraryAutoRAGService } from "../lib/service-factory";
import type { Env } from "../middleware/auth";
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
        const resources = await campaignDAO.getCampaignResources(campaignId);
        if (!resources || resources.length === 0) {
          console.warn(
            `[Server] No resources found in campaign: ${campaignId}`
          );
        } else {
          // Get the most recently added resource (the one that triggered this call)
          const resource = resources[resources.length - 1];

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
                  count
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
          const libraryAutoRAG = getLibraryAutoRAGService(c.env);
          console.log(`[Server] Library AutoRAG:`, libraryAutoRAG);

          // Use the centralized RPG extraction prompt
          const structuredExtractionPrompt =
            RPG_EXTRACTION_PROMPTS.formatStructuredContentPrompt(
              campaignId,
              resource.file_name || resource.id
            );

          console.log(
            `[Server] Extracting structured content from ${resource.id}`
          );

          // Call AutoRAG AI Search with the detailed prompt
          console.log(`[Server] Calling AutoRAG AI Search with filters:`, {
            filename: resource.file_name,
            prompt: `${structuredExtractionPrompt.substring(0, 200)}...`,
          });

          const aiSearchResult = await libraryAutoRAG.aiSearch(
            structuredExtractionPrompt,
            {
              max_results: 20,
              rewrite_query: false,
              filters: {
                type: "and",
                filters: [
                  {
                    type: "eq",
                    key: "filename",
                    value: resource.file_name,
                  },
                ],
              },
            }
          );

          console.log(`[Server] AutoRAG AI Search completed with result:`, {
            hasResponse: !!aiSearchResult.response,
            hasData: !!aiSearchResult.data,
            dataLength: aiSearchResult.data?.length || 0,
            resultKeys: Object.keys(aiSearchResult),
          });

          console.log(
            `[Server] AutoRAG AI Search completed for ${resource.id}`
          );
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
            // Clean the AI response by removing markdown formatting if present
            let cleanResponse = aiResponse;
            if (aiResponse.includes("```json")) {
              // Remove markdown code block formatting
              cleanResponse = aiResponse
                .replace(/```json\n?/g, "")
                .replace(/```\n?/g, "")
                .trim();
              console.log(
                `[Server] Cleaned markdown formatting from AI response`
              );
            }

            const parsedContent = JSON.parse(cleanResponse);

            console.log(`[Server] Parsed AI Search response structure:`, {
              keys: Object.keys(parsedContent),
              hasMeta: !!parsedContent.meta,
              contentTypes: Object.keys(parsedContent).filter(
                (key) => key !== "meta" && Array.isArray(parsedContent[key])
              ),
            });

            if (parsedContent && typeof parsedContent === "object") {
              // Use ShardAgent to create shards
              const shardAgent = new ShardAgent({} as any, c.env, {} as any);

              console.log(
                `[Server] Creating shards with campaignId: "${campaignId}"`
              );
              console.log(`[Server] Resource details:`, resource);

              const result = await shardAgent.createShards(
                parsedContent,
                resource,
                campaignId
              );

              if (result.created > 0) {
                console.log(
                  `[Server] Successfully created ${result.created} shards for ${resource.id}`
                );
                await notifyShardCount(result.created);

                // Return the generated shards and an instruction for the chat UI to render management UI
                return c.json({
                  success: true,
                  message: `Resource added to campaign successfully. Generated ${result.created} shards for review.`,
                  resource: {
                    id: resource.id,
                    name: resource.file_name || resource.id,
                    type: "file",
                  },
                  shards: {
                    count: result.created,
                    campaignId,
                    resourceId: resource.id,
                    message: `Generated ${result.created} shards from "${resource.file_name || resource.id}".`,
                  },
                  // Hint for the client chat to render UI immediately
                  ui: {
                    type: "render_component",
                    component: "ShardManagementUI",
                    props: {
                      campaignId,
                      action: "show_staged",
                      resourceId: resource.id,
                    },
                  },
                });
              } else {
                console.log(`[Server] No shards created for ${resource.id}`);
                await notifyShardCount(0);

                return c.json({
                  success: true,
                  message:
                    "Resource added to campaign successfully. No shards were generated from this resource.",
                  resource: {
                    id: resource.id,
                    name: resource.file_name || resource.id,
                    type: "file",
                  },
                });
              }
            } else {
              console.warn(
                `[Server] Invalid structured content format for ${resource.id}`
              );
              await notifyShardCount(0);

              return c.json({
                success: true,
                message:
                  "Resource added to campaign successfully. Could not generate shards from this resource.",
                resource: {
                  id: resource.id,
                  name: resource.file_name || resource.id,
                  type: "file",
                },
              });
            }
          } catch (parseError) {
            console.error(
              `[Server] Error parsing AI response for ${resource.id}:`,
              parseError
            );
            console.log(`[Server] Raw AI response: ${aiResponse}`);
            await notifyShardCount(0);

            return c.json({
              success: true,
              message:
                "Resource added to campaign successfully. Error occurred while generating shards.",
              resource: {
                id: resource.id,
                name: resource.file_name || resource.id,
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
