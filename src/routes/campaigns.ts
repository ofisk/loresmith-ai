import type { Context } from "hono";
import { getDAOFactory } from "../dao/dao-factory";
import { AutoRAGClient } from "../lib/autorag";
import { getCampaignAutoRAGService } from "../lib/service-factory";
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
    await campaignDAO.createCampaign(
      campaignId,
      name,
      description || "",
      userAuth.username,
      campaignRagBasePath
    );

    // Initialize CampaignAutoRAG folders
    try {
      const campaignAutoRAG = new CampaignAutoRAG(
        c.env,
        c.env.AUTORAG_SEARCH_URL,
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

    return c.json({ campaign: newCampaign }, 201);
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
      "SELECT id, campaign_id, file_key, file_name, description, tags, status, created_at FROM campaign_resources WHERE campaign_id = ?"
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
      "SELECT id, name, username FROM campaigns WHERE id = ? AND username = ?"
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
      "DELETE FROM campaign_resources WHERE campaign_id = ?"
    )
      .bind(campaignId)
      .run();

    console.log(
      `[Server] Deleted campaign resources for campaign ${campaignId}`
    );

    // Delete the campaign
    await c.env.DB.prepare(
      "DELETE FROM campaigns WHERE id = ? AND username = ?"
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
      "SELECT id, name FROM campaigns WHERE username = ?"
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
      "DELETE FROM campaign_resources WHERE campaign_id IN (SELECT id FROM campaigns WHERE username = ?)"
    )
      .bind(userAuth.username)
      .run();

    console.log(
      `[Server] Deleted campaign resources for user ${userAuth.username}`
    );

    // Delete all campaigns for the user
    await c.env.DB.prepare("DELETE FROM campaigns WHERE username = ?")
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
      "SELECT id, name, username FROM campaigns WHERE id = ? AND username = ?"
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
      "SELECT id, file_name FROM campaign_resources WHERE campaign_id = ? AND file_key = ?"
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
      "INSERT INTO campaign_resources (id, campaign_id, file_key, file_name, description, tags, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
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

    // Generate campaign snippets in background
    setTimeout(async () => {
      try {
        // Get campaign RAG base path
        const campaignDAO = getDAOFactory(c.env).campaignDAO;
        const campaignRagBasePath = await campaignDAO.getCampaignRagBasePath(
          userAuth.username,
          campaignId
        );

        if (!campaignRagBasePath) {
          console.log(
            `[Server] Campaign AutoRAG not initialized for campaign: ${campaignId}`
          );
          return;
        }

        // Get CampaignAutoRAG service
        const campaignAutoRAG = getCampaignAutoRAGService(
          c.env,
          campaignRagBasePath
        );

        // Check if file has been processed by library RAG
        const fileDAO = getDAOFactory(c.env).fileDAO;
        const fileRecord = await fileDAO.getFileForRag(id, userAuth.username);

        if (fileRecord && fileRecord.status === "completed") {
          console.log(
            `[Server] Generating snippets for file: ${id} in campaign: ${campaignId}`
          );

          // Query LibraryAutoRAG to extract structured content from the file
          const autoRagClient = new AutoRAGClient(c.env.AUTORAG_SEARCH_URL);
          const snippets = [];

          // Define detailed prompts for each primitive type
          const primitiveQueries = [
            {
              type: "monster",
              prompt: `Find monster and creature stat blocks in ${name || id}. Look for patterns like Armor Class, Hit Points, Speed, ability scores (STR/DEX/CON/INT/WIS/CHA), Challenge Rating, traits, actions, legendary actions, and spellcasting. Extract complete stat blocks with name, type, size, alignment, AC, HP, speed, ability scores, saves/skills, senses, languages, CR, traits, actions, bonus actions, legendary actions, lair actions, reactions, and spellcasting details.`,
            },
            {
              type: "npc",
              prompt: `Find NPC descriptions and character information in ${name || id}. Look for non-statblock characters with names, roles, factions, goals, secrets, bonds, quirks, appearance descriptions, talking points, motivations, and relationships. Focus on characters that drive story or provide quest hooks.`,
            },
            {
              type: "spell",
              prompt: `Find spell descriptions in ${name || id}. Look for spell headers with level and school (e.g., "1st-level evocation"), casting time, range, components, duration, class lists, spell text, and "At Higher Levels" sections. Extract complete spell information including name, level, school, casting time, range, components, duration, classes, text, and at-higher-levels effects.`,
            },
            {
              type: "magic_item",
              prompt: `Find magic items, artifacts, and consumables in ${name || id}. Look for items marked as "Wondrous item", "Weapon", "Armor", "Potion", "Scroll", etc. with rarity indicators (Common, Uncommon, Rare, Very Rare, Legendary), attunement requirements, properties, charges, activation methods, curses, and variants. Extract complete item descriptions.`,
            },
            {
              type: "trap",
              prompt: `Find traps and hazards in ${name || id}. Look for sections with headings like "Trigger", "Effect", "Countermeasures", DC numbers, damage types, reset mechanisms, and danger ratings. Extract complete trap descriptions with trigger conditions, effects, detection/disarm methods, and countermeasures.`,
            },
            {
              type: "location",
              prompt: `Find locations, sites, rooms, buildings, dungeons, and regions in ${name || id}. Look for numbered areas (e.g., "Area 12"), boxed read-aloud text, overview descriptions, keyed areas, inhabitants, features, hazards, treasure, clues, map references, and travel information. Extract complete location descriptions.`,
            },
            {
              type: "lair",
              prompt: `Find lair descriptions in ${name || id}. Look for lair actions, regional effects, lair features, treasure hoards, encounter tables, and lair-specific mechanics. Extract complete lair information including owner, features, lair actions, regional effects, and treasure.`,
            },
            {
              type: "faction",
              prompt: `Find factions and organizations in ${name || id}. Look for groups with names, purposes, assets, notable NPCs, ranks, secrets, fronts/clocks, and relationships to other factions. Extract complete faction information including structure and goals.`,
            },
            {
              type: "deity",
              prompt: `Find deities, patrons, and divine powers in ${name || id}. Look for divine beings with domains, tenets, boons, edicts, anathema, rites, favored items/spells, and symbols. Extract complete deity information including worship practices and divine influence.`,
            },
            {
              type: "plot_hook",
              prompt: `Find plot hooks and adventure starters in ${name || id}. Look for imperative phrasing like "The party is asked to...", "A villager begs...", or "The characters discover...". Extract hooks with who/where/why, stakes, and leads to other content.`,
            },
            {
              type: "quest",
              prompt: `Find quests and side quests in ${name || id}. Look for objectives, steps/scenes, success/failure outcomes, rewards, XP/milestones, involved NPCs/locations/monsters, and prerequisites. Extract complete quest structures.`,
            },
            {
              type: "scene",
              prompt: `Find scenes and encounters in ${name || id}. Look for structured encounters with titles, types (combat/social/exploration/skill challenge), setup, goals, participants, terrain/map references, tactics, scaling notes, outcomes, treasure, and next-scenes. Extract complete scene descriptions.`,
            },
            {
              type: "clue",
              prompt: `Find clues and secrets in ${name || id}. Look for information that points to NPCs, places, or scenes, with delivery methods (handouts, skill checks, rumors) and redundancy options. Extract clues with their connections and revelation methods.`,
            },
            {
              type: "table",
              prompt: `Find random tables in ${name || id}. Look for tables with dice notation (d20, d100), column headers, and structured results. Extract complete tables including title, dice range, results, and usage notes.`,
            },
            {
              type: "background",
              prompt: `Find character backgrounds in ${name || id}. Look for backgrounds with proficiencies, languages/tools, equipment, features, and suggested characteristics. Extract complete background information.`,
            },
            {
              type: "feat",
              prompt: `Find feats in ${name || id}. Look for feats with prerequisites, effect text, scaling mechanics, and tags. Extract complete feat descriptions including requirements and benefits.`,
            },
            {
              type: "subclass",
              prompt: `Find subclasses and class options in ${name || id}. Look for subclasses with parent class/species, level features, spell list additions, restrictions, and flavor text. Extract complete subclass information.`,
            },
            {
              type: "downtime",
              prompt: `Find downtime activities and crafting rules in ${name || id}. Look for activities with requirements, procedures, checks/DCs, time/cost, outcomes, and complications. Extract complete downtime activity descriptions.`,
            },
            {
              type: "timeline",
              prompt: `Find timelines and clocks in ${name || id}. Look for structured time systems with phases/segments, trigger events, consequences per tick, and reset/advance rules. Extract complete timeline mechanics.`,
            },
            {
              type: "travel",
              prompt: `Find travel routes in ${name || id}. Look for routes with origin/destination, distance/time, encounter table links, costs, and checkpoints. Extract complete travel route information.`,
            },
          ];

          // Query LibraryAutoRAG for each primitive type
          for (const query of primitiveQueries) {
            try {
              const searchResults = await autoRagClient.search(query.prompt, {
                limit: 2,
                folder: `autorag/${userAuth.username}/${id}`,
              });

              if (searchResults.results && searchResults.results.length > 0) {
                for (const result of searchResults.results) {
                  const snippet = {
                    id: crypto.randomUUID(),
                    text: result.text,
                    metadata: {
                      fileKey: id,
                      fileName: name || id,
                      source: "library_rag",
                      campaignId: campaignId,
                      entityType: query.type,
                      confidence: result.score || 0.8,
                      sourceRef: result.metadata || {},
                      query: query.prompt,
                    },
                    sourceRef: {
                      fileKey: id,
                      meta: {
                        fileName: name || id,
                        campaignId: campaignId,
                        entityType: query.type,
                        chunkId: result.id,
                        score: result.score,
                      },
                    },
                  };

                  snippets.push(snippet);
                }
              }
            } catch (searchError) {
              console.warn(
                `[Server] Error searching for ${query.type} in file ${id}:`,
                searchError
              );
              // Continue with other entity types
            }
          }

          // If no specific entities found, try a general content extraction
          if (snippets.length === 0) {
            try {
              const generalResults = await autoRagClient.search(
                `Extract meaningful content from ${name || id} that could be useful for a D&D campaign. Look for any structured information, descriptions, rules, or narrative content.`,
                {
                  limit: 3,
                  folder: `autorag/${userAuth.username}/${id}`,
                }
              );

              if (generalResults.results && generalResults.results.length > 0) {
                for (const result of generalResults.results) {
                  const snippet = {
                    id: crypto.randomUUID(),
                    text: result.text,
                    metadata: {
                      fileKey: id,
                      fileName: name || id,
                      source: "library_rag",
                      campaignId: campaignId,
                      entityType: "general_content",
                      confidence: result.score || 0.7,
                      sourceRef: result.metadata || {},
                    },
                    sourceRef: {
                      fileKey: id,
                      meta: {
                        fileName: name || id,
                        campaignId: campaignId,
                        entityType: "general_content",
                        chunkId: result.id,
                        score: result.score,
                      },
                    },
                  };

                  snippets.push(snippet);
                }
              }
            } catch (generalError) {
              console.warn(
                `[Server] Error extracting general content from file ${id}:`,
                generalError
              );
            }
          }

          // Save snippet candidates to staging
          await campaignAutoRAG.saveSnippetCandidates(
            {
              fileKey: id,
              meta: { fileName: name || id, campaignId: campaignId },
            },
            snippets
          );

          console.log(
            `[Server] Generated ${snippets.length} snippets for campaign: ${campaignId}`
          );
        } else {
          console.log(
            `[Server] File ${id} not yet processed by library RAG, skipping snippet generation`
          );
        }
      } catch (error) {
        console.error(
          `[Server] Error generating campaign snippets for file ${id}:`,
          error
        );
        // Don't fail the resource addition if snippet generation fails
      }
    }, 1000); // Small delay to ensure resource is committed

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
      "SELECT id, name, username FROM campaigns WHERE id = ? AND username = ?"
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
      "SELECT id, file_key, file_name FROM campaign_resources WHERE id = ? AND campaign_id = ?"
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
      "DELETE FROM campaign_resources WHERE id = ? AND campaign_id = ?"
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
