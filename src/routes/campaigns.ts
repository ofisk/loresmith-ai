import type { Context } from "hono";
import { getDAOFactory } from "../dao/dao-factory";
import { getLibraryAutoRAGService } from "../lib/service-factory";
import { parseSnippetCandidates } from "../lib/snippet-parser";
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

          const structuredExtractionPrompt = `You are extracting Dungeon Master prep data from RPG text.

TASK
From the provided text, identify and synthesize ALL relevant game-ready "primitives" and output a SINGLE JSON object that strictly follows the schema in the SPEC below. Return ONLY valid JSON (no comments, no markdown). If a field is unknown, omit it. Prefer concise, prep-usable summaries over flavor text.

CONTEXT & HINTS
- Typical cues:
  - Monsters/Creatures: "Armor Class", "Hit Points", STR/DEX/CON/INT/WIS/CHA line, "Challenge".
  - Spells: "1st-level <school>", casting time, range, components, duration, "At Higher Levels".
  - Magic Items: rarity, type, "requires attunement".
  - Traps/Hazards: Trigger/Effect/DCs/Countermeasures.
  - Scenes/Rooms: numbered keys (e.g., "Area 12"), read-aloud boxed text, GM notes.
  - Hooks/Quests: imperative requests with stakes and links to NPCs/locations.
  - Tables: a dice column (d20/d100), range → result rows.
- Keep "rejected" campaign content out of results if the snippet indicates rejection (e.g., metadata flags).
- Normalize names (title case), keep dice notation and DCs.
- Include lightweight relationships in \`relations[]\` to connect items (e.g., a scene that contains a monster).

OUTPUT RULES
- Output one JSON object with the top-level keys exactly as in SPEC.
- Each array can be empty, but must exist.
- Do not invent rules outside the text; summarize faithfully.
- Keep \`summary\` and \`one_line\` short (≤ 240 chars each).
- Output plain JSON without any markdown formatting.

INPUT VARIABLES
- campaignId: ${campaignId}
- source: { "doc": "${resource.resource_name || resource.id}", "pages": "", "anchor": "" }

SPEC (fields not listed under a type are optional; always include common fields if known)
COMMON FIELDS (for every primitive):
- id: stable slug (lowercase kebab). If absent, slugify name + short hash.
- type: one of the defined types.
- name (or title for scenes): string.
- one_line: ultra-brief pitch.
- summary: 1–3 sentence DM-usable summary.
- tags: array of short tags.
- source: { doc, pages?, anchor? }
- relations: array of { rel, target_id }.

TYPES & REQUIRED MINIMUM FIELDS
- monsters[]: { id, type:"monster", name, summary, cr?, ac?, hp?, abilities?: {str, dex, con, int, wis, cha}, actions?, traits?, spellcasting?, tags?, source, relations? }
- npcs[]: { id, type:"npc", name, role?, goals?, secrets?, quirks?, relationships?, statblock_ref?, summary, tags?, source, relations? }
- spells[]: { id, type:"spell", name, level, school, casting_time, range, components, duration, classes?, text, tags?, source }
- items[]: { id, type:"item", name, rarity?, item_type?, attunement?, properties?, charges?, curse?, text, tags?, source }
- traps[]: { id, type:"trap", name, trigger, effect, dcs?, detect_disarm?, reset?, tags?, source }
- hazards[]: { id, type:"hazard", name, effect, dcs?, countermeasures?, tags?, source }
- conditions[]: { id, type:"condition", name, effects, cure?, tags?, source }
- vehicles[]: { id, type:"vehicle", name, stats?: {ac?, hp?, speed?, capacity?}, crew?, actions?, traits?, tags?, source }
- env_effects[]: { id, type:"env_effect", name, triggers?, effects, duration?, counters?, tags?, source }
- hooks[]: { id, type:"hook", name, text, leads_to?: string[], stakes?, tags?, source, relations? }
- plot_lines[]: { id, type:"plot_line", title, premise, beats?: string[], dependencies?: string[], resolutions?: string[], tags?, source, relations? }
- quests[]: { id, type:"quest", title, objective, steps?: string[], rewards?, xp_or_milestone?, involved?: string[], prerequisites?: string[], tags?, source, relations? }
- scenes[]: { id, type:"scene", title, scene_type?: "combat"|"social"|"exploration"|"skill", setup, goal?, participants?: string[], map_ref?, tactics?, scaling?, outcomes?, treasure?, next_scenes?: string[], read_aloud?, tags?, source, relations? }
- locations[]: { id, type:"location", name, kind?: "room"|"site"|"region"|"city"|"dungeon_level", overview, keyed_areas?: string[], inhabitants?: string[], features?: string[], hazards?: string[], treasure?, map_refs?, travel?, tags?, source, relations? }
- lairs[]: { id, type:"lair", owner, features?: string[], lair_actions?: string[], regional_effects?: string[], treasure?, tags?, source, relations? }
- factions[]: { id, type:"faction", name, purpose, assets?, notable_npcs?: string[], ranks?, secrets?, relationships?, tags?, source, relations? }
- deities[]: { id, type:"deity", name, domains?, tenets?, boons?, edicts?, anathema?, rites?, favored_items?, symbol?, tags?, source }
- backgrounds[]: { id, type:"background", name, proficiencies?, tools?, languages?, equipment?, feature?, suggested_traits?, tags?, source }
- feats[]: { id, type:"feat", name, prerequisites?, effect, scaling?, tags?, source }
- subclasses[]: { id, type:"subclass", name, parent_class, level_features: { [level:number]: string }, spell_list_adds?, restrictions?, tags?, source }
- rules[]: { id, type:"rule", name, modifies?, text, examples?, safety_notes?, tags?, source }
- downtime[]: { id, type:"downtime", name, requirements?, procedure, checks?, time_cost?, outcomes?, complications?, tags?, source }
- tables[]: { id, type:"table", title, dice, rows: [{range:string, result:string}], usage_notes?, tags?, source }
- encounter_tables[]: { id, type:"encounter_table", environment?, level_band?, dice, rows:[{range:string, result:string}], notes?, tags?, source }
- treasure_tables[]: { id, type:"treasure_table", tier_or_cr?, rows:[{range:string, result:string}], notes?, tags?, source }
- maps[]: { id, type:"map", title, scale?, grid?, keyed?: string[], player_version?: boolean?, file_refs?: string[], tags?, source }
- handouts[]: { id, type:"handout", title, delivery?, text_or_art_ref, when_to_reveal?, redactions?, tags?, source }
- puzzles[]: { id, type:"puzzle", prompt, solution, hints?: string[], failure_stakes?, bypass_methods?, tags?, source }
- timelines[]: { id, type:"timeline", title, phases?: string[], triggers?: string[], consequences?: string[], reset_rules?, tags?, source }
- travel[]: { id, type:"travel", route, distance?, time?, encounters_table_ref?, costs?, checkpoints?, tags?, source }

TOP-LEVEL RETURN SHAPE (all keys required, arrays may be empty)
{
  "meta": { "campaignId": string, "source": { "doc": string, "pages"?: string, "anchor"?: string } },
  "monsters": [], "npcs": [], "spells": [], "items": [],
  "traps": [], "hazards": [], "conditions": [], "vehicles": [], "env_effects": [],
  "hooks": [], "plot_lines": [], "quests": [], "scenes": [],
  "locations": [], "lairs": [], "factions": [], "deities": [],
  "backgrounds": [], "feats": [], "subclasses": [], "rules": [], "downtime": [],
  "tables": [], "encounter_tables": [], "treasure_tables": [],
  "maps": [], "handouts": [], "puzzles": [],
  "timelines": [], "travel": []
}

RETURN ONLY JSON.`;

          console.log(
            `[Server] Extracting structured content from ${resource.id}`
          );

          // Call AutoRAG AI Search with the detailed prompt
          const aiSearchResult = await libraryAutoRAG.aiSearch(
            structuredExtractionPrompt,
            {
              max_results: 20,
              rewrite_query: false,
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
            const parsedContent = JSON.parse(aiResponse);

            console.log(`[Server] Parsed AI Search response structure:`, {
              keys: Object.keys(parsedContent),
              hasMeta: !!parsedContent.meta,
              contentTypes: Object.keys(parsedContent).filter(
                (key) => key !== "meta" && Array.isArray(parsedContent[key])
              ),
            });

            if (parsedContent && typeof parsedContent === "object") {
              // Convert the structured content to snippet candidates
              const snippetCandidates = parseSnippetCandidates(
                parsedContent,
                resource,
                campaignId
              );

              if (snippetCandidates.length > 0) {
                console.log(
                  `[Server] Generated ${snippetCandidates.length} snippet candidates for ${resource.id}:`
                );
                snippetCandidates.forEach((snippet, index) => {
                  console.log(`[Server] Snippet ${index + 1} structure:`, {
                    id: snippet.id,
                    hasText: !!snippet.text,
                    textType: typeof snippet.text,
                    textLength: snippet.text
                      ? snippet.text.length
                      : "undefined",
                    entityType: snippet.metadata?.entityType,
                    confidence: snippet.metadata?.confidence,
                  });

                  if (snippet.text) {
                    console.log(`[Server] Snippet ${index + 1} text preview:`, {
                      text:
                        snippet.text.substring(0, 200) +
                        (snippet.text.length > 200 ? "..." : ""),
                    });
                  } else {
                    console.warn(
                      `[Server] Snippet ${index + 1} has no text property`
                    );
                  }
                });

                const stagedSnippetsDAO = getDAOFactory(
                  c.env
                ).stagedSnippetsDAO;

                // Convert snippet candidates to D1 format
                const d1Snippets = snippetCandidates
                  .filter((snippet) => snippet.text && snippet.metadata) // Filter out invalid snippets
                  .map((snippet) => ({
                    id: snippet.id,
                    campaign_id: campaignId,
                    resource_id: resource.id,
                    snippet_type: snippet.metadata.entityType,
                    content: snippet.text,
                    metadata: JSON.stringify(snippet.metadata),
                  }));

                await stagedSnippetsDAO.createStagedSnippets(d1Snippets);

                console.log(
                  `[Server] Successfully stored ${snippetCandidates.length} snippets in database for ${resource.id}`
                );
              } else {
                console.warn(
                  `[Server] No snippet candidates generated for ${resource.id}`
                );
              }
            } else {
              console.warn(
                `[Server] Invalid structured content format for ${resource.id}`
              );
            }
          } catch (parseError) {
            console.error(
              `[Server] Error parsing AI response for ${resource.id}:`,
              parseError
            );
            console.log(`[Server] Raw AI response: ${aiResponse}`);
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
