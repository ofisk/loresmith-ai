import type { Context } from "hono";
import { getDAOFactory } from "../dao/dao-factory";
import { getLibraryAutoRAGService } from "../lib/service-factory";
import { SnippetAgent } from "../agents/snippet-agent";
import { RPG_EXTRACTION_PROMPTS } from "../lib/prompts/rpg-extraction-prompts";
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

    // Query campaign resources directly from D1 database
    const resources = await c.env.DB.prepare(
      "select id, campaign_id, file_key, file_name, description, tags, status, created_at from campaign_resources where campaign_id = ?"
    )
      .bind(campaignId)
      .all();

    return c.json({ resources: resources.results || [] });
  } catch (error) {
    console.error("Error fetching campaign resources:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Delete specific campaign
export async function handleDeleteCampaign(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const campaignId = c.req.param("campaignId");

    console.log(`[Server] DELETE /campaigns/${campaignId} - starting request`);
    console.log("[Server] User auth from middleware:", userAuth);

    // First, check if the campaign exists and belongs to the user
    const campaign = await c.env.DB.prepare(
      "select id, name, username from campaigns where id = ? and username = ?"
    )
      .bind(campaignId, userAuth.username)
      .first<{ id: string; name: string; username: string }>();

    if (!campaign) {
      console.log(
        `[Server] Campaign ${campaignId} not found or doesn't belong to user ${userAuth.username}`
      );
      return c.json({ error: "Campaign not found" }, 404);
    }

    console.log("[Server] Found campaign:", campaign);

    // Delete campaign resources first (due to foreign key constraints)
    await c.env.DB.prepare(
      "delete from campaign_resources where campaign_id = ?"
    )
      .bind(campaignId)
      .run();

    console.log(
      `[Server] Deleted campaign resources for campaign ${campaignId}`
    );

    // Delete the campaign
    await c.env.DB.prepare(
      "delete from campaigns where id = ? and username = ?"
    )
      .bind(campaignId, userAuth.username)
      .run();

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

    // First, get all campaigns for the user
    const campaigns = await c.env.DB.prepare(
      "select id, name from campaigns where username = ?"
    )
      .bind(userAuth.username)
      .all<{ id: string; name: string }>();

    console.log(
      `[Server] Found ${campaigns.results?.length || 0} campaigns to delete`
    );

    if (!campaigns.results || campaigns.results.length === 0) {
      return c.json({
        success: true,
        message: "No campaigns found to delete",
        deletedCount: 0,
      });
    }

    // Delete campaign resources first (due to foreign key constraints)
    await c.env.DB.prepare(
      "delete from campaign_resources where campaign_id in (select id from campaigns where username = ?)"
    )
      .bind(userAuth.username)
      .run();

    console.log(
      `[Server] Deleted campaign resources for user ${userAuth.username}`
    );

    // Delete all campaigns for the user
    await c.env.DB.prepare("delete from campaigns where username = ?")
      .bind(userAuth.username)
      .run();

    console.log(`[Server] Deleted campaigns for user ${userAuth.username}`);

    return c.json({
      success: true,
      message: "All campaigns deleted successfully",
      deletedCount: campaigns.results?.length || 0,
      deletedCampaigns: campaigns.results,
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

    // First, check if the campaign exists and belongs to the user
    const campaign = await c.env.DB.prepare(
      "select id, name, username from campaigns where id = ? and username = ?"
    )
      .bind(campaignId, userAuth.username)
      .first<{ id: string; name: string; username: string }>();

    if (!campaign) {
      console.log(
        `[Server] Campaign ${campaignId} not found or doesn't belong to user ${userAuth.username}`
      );
      return c.json({ error: "Campaign not found" }, 404);
    }

    console.log("[Server] Found campaign:", campaign);

    // Check if resource already exists in this campaign
    const existingResource = await c.env.DB.prepare(
      "select id, file_name from campaign_resources where campaign_id = ? and file_key = ?"
    )
      .bind(campaignId, id)
      .first<{ id: string; file_name: string }>();

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
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      "insert into campaign_resources (id, campaign_id, file_key, file_name, description, tags, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(
        resourceId,
        campaignId,
        id,
        name || id,
        "",
        "[]",
        "active",
        now,
        now
      )
      .run();

    console.log(`[Server] Added resource ${id} to campaign ${campaignId}`);

    // Generate snippets for the newly added resource
    try {
      console.log(`[Server] Generating snippets for campaign: ${campaignId}`);

      const campaignDAO = getDAOFactory(c.env).campaignDAO;
      const campaignRagBasePath = await campaignDAO.getCampaignRagBasePath(
        userAuth.username,
        campaignId
      );
      if (!campaignRagBasePath) {
        console.warn(
          `[Server] Campaign AutoRAG not initialized for campaign: ${campaignId}`
        );
        // Continue without snippet generation
      } else {
        const resources = await campaignDAO.getCampaignResources(campaignId);
        if (!resources || resources.length === 0) {
          console.warn(
            `[Server] No resources found in campaign: ${campaignId}`
          );
        } else {
          // Get the most recently added resource (the one that triggered this call)
          const resource = resources[resources.length - 1];
          console.log(`[Server] Generating snippets for resource:`, resource);

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
          } else if (actualResult.result && actualResult.result.response) {
            aiResponse = actualResult.result.response;
          } else {
            console.warn(
              `[Server] AI Search result has no accessible response property`
            );
            console.log(`[Server] Full AI Search result:`, actualResult);
            return; // Skip snippet generation if no response
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
              // Use SnippetAgent to create snippets
              const snippetAgent = new SnippetAgent(
                {} as any,
                c.env,
                {} as any
              );

              console.log(
                `[Server] Creating snippets with campaignId: "${campaignId}"`
              );
              console.log(`[Server] Resource details:`, resource);

              const result = await snippetAgent.createSnippets(
                parsedContent,
                resource,
                campaignId
              );

              if (result.created > 0) {
                console.log(
                  `[Server] Successfully created ${result.created} snippets for ${resource.id}`
                );

                // Return the generated snippets and an instruction for the chat UI to render management UI
                return c.json({
                  success: true,
                  message: `Resource added to campaign successfully. Generated ${result.created} snippets for review.`,
                  resource: {
                    id: resource.id,
                    name: resource.file_name || resource.id,
                    type: "file",
                  },
                  snippets: {
                    count: result.created,
                    campaignId,
                    resourceId: resource.id,
                    message: `Generated ${result.created} snippets from "${resource.file_name || resource.id}".`,
                  },
                  // Hint for the client chat to render UI immediately
                  ui: {
                    type: "render_component",
                    component: "SnippetManagementUI",
                    props: {
                      campaignId,
                      action: "show_staged",
                      resourceId: resource.id,
                    },
                  },
                });
              } else {
                console.log(`[Server] No snippets created for ${resource.id}`);

                return c.json({
                  success: true,
                  message:
                    "Resource added to campaign successfully. No snippets were generated from this resource.",
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

              return c.json({
                success: true,
                message:
                  "Resource added to campaign successfully. Could not generate snippets from this resource.",
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

            return c.json({
              success: true,
              message:
                "Resource added to campaign successfully. Error occurred while generating snippets.",
              resource: {
                id: resource.id,
                name: resource.file_name || resource.id,
                type: "file",
              },
              error: "Snippet generation failed",
            });
          }
        }
      }
    } catch (snippetError) {
      console.error(`[Server] Error generating snippets:`, snippetError);
      // Don't fail the resource addition if snippet generation fails
    }

    const newResource = {
      id: resourceId,
      campaignId,
      fileKey: id,
      fileName: name || id,
      description: "",
      tags: "[]",
      status: "active",
      createdAt: now,
      updatedAt: now,
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

    // First, check if the campaign exists and belongs to the user
    const campaign = await c.env.DB.prepare(
      "select id, name, username from campaigns where id = ? and username = ?"
    )
      .bind(campaignId, userAuth.username)
      .first<{ id: string; name: string; username: string }>();

    if (!campaign) {
      console.log(
        `[Server] Campaign ${campaignId} not found or doesn't belong to user ${userAuth.username}`
      );
      return c.json({ error: "Campaign not found" }, 404);
    }

    console.log("[Server] Found campaign:", campaign);

    // Check if the resource exists in this campaign
    const resource = await c.env.DB.prepare(
      "select id, file_key, file_name from campaign_resources where id = ? and campaign_id = ?"
    )
      .bind(resourceId, campaignId)
      .first<{ id: string; file_key: string; file_name: string }>();

    if (!resource) {
      console.log(
        `[Server] Resource ${resourceId} not found in campaign ${campaignId}`
      );
      return c.json({ error: "Resource not found in this campaign" }, 404);
    }

    console.log("[Server] Found resource:", resource);

    // Remove the resource from the campaign
    await c.env.DB.prepare(
      "delete from campaign_resources where id = ? and campaign_id = ?"
    )
      .bind(resourceId, campaignId)
      .run();

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
