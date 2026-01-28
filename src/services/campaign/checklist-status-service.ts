import type { D1Database } from "@cloudflare/workers-types";
import { getDAOFactory } from "@/dao/dao-factory";
import type {
  ChecklistStatusDAO,
  ChecklistStatusUpdate,
} from "@/dao/checklist-status-dao";
import { CHECKLIST_ITEM_KEYS } from "@/constants/checklist-items";
import type { Env } from "@/middleware/auth";
import {
  ENTITY_TYPE_FACTIONS,
  ENTITY_TYPE_NPCS,
  ENTITY_TYPE_LOCATIONS,
} from "@/lib/entity-type-constants";

/**
 * Service for maintaining campaign checklist status based on metadata and entities
 */
export class ChecklistStatusService {
  private checklistStatusDAO: ChecklistStatusDAO;

  constructor(_db: D1Database, env?: any) {
    const daoFactory = getDAOFactory(env);
    this.checklistStatusDAO = daoFactory.checklistStatusDAO;
  }

  /**
   * Update checklist status based on campaign metadata
   * Called when campaign metadata is updated
   */
  async updateFromMetadata(
    campaignId: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    const updates: Array<{
      id: string;
      checklistItemKey: string;
      update: ChecklistStatusUpdate;
    }> = [];

    // Map metadata fields to checklist items
    if (metadata.worldName) {
      updates.push({
        id: crypto.randomUUID(),
        checklistItemKey: CHECKLIST_ITEM_KEYS.WORLD_NAME,
        update: {
          status: "complete",
          summary: String(metadata.worldName),
        },
      });
    }

    if (metadata.startingLocation) {
      updates.push({
        id: crypto.randomUUID(),
        checklistItemKey: CHECKLIST_ITEM_KEYS.STARTING_LOCATION,
        update: {
          status: "complete",
          summary: String(metadata.startingLocation),
        },
      });
    }

    if (metadata.campaignTone) {
      updates.push({
        id: crypto.randomUUID(),
        checklistItemKey: CHECKLIST_ITEM_KEYS.CAMPAIGN_TONE,
        update: {
          status: "complete",
          summary: String(metadata.campaignTone),
        },
      });
    }

    if (metadata.campaignTheme || metadata.campaignThemes) {
      const themes = Array.isArray(
        metadata.campaignTheme || metadata.campaignThemes
      )
        ? ((metadata.campaignTheme || metadata.campaignThemes) as string[])
        : [String(metadata.campaignTheme || metadata.campaignThemes)];
      updates.push({
        id: crypto.randomUUID(),
        checklistItemKey: CHECKLIST_ITEM_KEYS.CORE_THEMES,
        update: {
          status: "complete",
          summary: themes.join(", "),
        },
      });
    }

    if (updates.length > 0) {
      await this.checklistStatusDAO.bulkUpdateStatus(campaignId, updates);
    }
  }

  /**
   * Analyze communities to find quality signals for checklist items
   * Uses targeted SQL queries instead of loading all communities/entities
   */
  private async analyzeCommunitySignals(
    campaignId: string,
    env?: Env
  ): Promise<{
    factionsInCommunities: number; // Number of factions that are in communities with other factions
    npcsInCommunities: number; // Number of NPCs that are in communities with other NPCs
    locationsInCommunities: number; // Number of locations that are in communities with other locations
  }> {
    const daoFactory = getDAOFactory(
      env || (this.checklistStatusDAO.db as any)
    );
    const communityDAO = daoFactory.communityDAO;

    // Count factions in communities that have at least 2 factions (single efficient query)
    const factionsInCommunities =
      await communityDAO.countEntityTypeInCommunitiesWithMinCount(
        campaignId,
        ENTITY_TYPE_FACTIONS,
        2
      );

    // Count NPCs in communities that have at least 3 NPCs (matching checklist requirement)
    const npcsInCommunities =
      await communityDAO.countEntityTypeInCommunitiesWithMinCount(
        campaignId,
        ENTITY_TYPE_NPCS,
        3
      );

    // Count locations in communities that have at least 1 location
    const locationsInCommunities =
      await communityDAO.countEntityTypeInCommunitiesWithMinCount(
        campaignId,
        ENTITY_TYPE_LOCATIONS,
        1
      );

    return { factionsInCommunities, npcsInCommunities, locationsInCommunities };
  }

  /**
   * Efficiently analyze entity counts for a campaign using SQL queries
   * This is optimized for bulk analysis and should be called asynchronously
   * Also analyzes community structure to provide quality signals
   */
  async analyzeEntityCounts(campaignId: string, env?: Env): Promise<void> {
    const daoFactory = getDAOFactory(
      env || (this.checklistStatusDAO.db as any)
    );
    const entityDAO = daoFactory.entityDAO;

    // Use efficient SQL queries to count entities by type
    const factionCount = await entityDAO.getEntityCountByCampaign(campaignId, {
      entityType: ENTITY_TYPE_FACTIONS,
    });
    const npcCount = await entityDAO.getEntityCountByCampaign(campaignId, {
      entityType: ENTITY_TYPE_NPCS,
    });
    // Note: locationCount could be used for future checklist items
    // const locationCount = await entityDAO.getEntityCountByCampaign(campaignId, {
    //   entityType: ENTITY_TYPE_LOCATIONS,
    // });

    // Analyze community structure for quality signals
    const communitySignals = await this.analyzeCommunitySignals(
      campaignId,
      env
    );

    const updates: Array<{
      id: string;
      checklistItemKey: string;
      update: ChecklistStatusUpdate;
    }> = [];

    // Update factions status - counts are preliminary signals only
    // The agent should investigate further to determine if factions are well-defined
    // Community analysis provides quality signal: factions in same community are related
    if (factionCount >= 2) {
      // Preliminary signal: enough factions exist, but agent should verify quality
      const existing = await this.checklistStatusDAO.getItemStatus(
        campaignId,
        CHECKLIST_ITEM_KEYS.FACTIONS
      );
      // Only update if status is "incomplete" or doesn't exist
      // Don't overwrite "complete" or "partial" that was set by agent investigation
      if (!existing || existing.status === "incomplete") {
        let summary = `Preliminary: ${factionCount} factions found.`;
        if (communitySignals.factionsInCommunities >= 2) {
          summary += ` ${communitySignals.factionsInCommunities} factions are in communities together (suggesting they're related/integrated).`;
        }
        summary += ` Agent should investigate if they're well-defined and integrated into the campaign.`;

        updates.push({
          id: crypto.randomUUID(),
          checklistItemKey: CHECKLIST_ITEM_KEYS.FACTIONS,
          update: {
            status: "partial",
            summary,
          },
        });
      }
    } else if (factionCount === 1) {
      const existing = await this.checklistStatusDAO.getItemStatus(
        campaignId,
        CHECKLIST_ITEM_KEYS.FACTIONS
      );
      if (!existing || existing.status === "incomplete") {
        updates.push({
          id: crypto.randomUUID(),
          checklistItemKey: CHECKLIST_ITEM_KEYS.FACTIONS,
          update: {
            status: "partial",
            summary: `Preliminary: 1 faction found (need at least 2). Agent should investigate if it's well-defined.`,
          },
        });
      }
    } else if (factionCount === 0) {
      // Only update if there's an existing record to mark as incomplete
      const existing = await this.checklistStatusDAO.getItemStatus(
        campaignId,
        CHECKLIST_ITEM_KEYS.FACTIONS
      );
      if (existing && existing.status !== "incomplete") {
        updates.push({
          id: crypto.randomUUID(),
          checklistItemKey: CHECKLIST_ITEM_KEYS.FACTIONS,
          update: {
            status: "incomplete",
            summary: null,
          },
        });
      }
    }

    // Update starting location NPCs status - counts are preliminary signals only
    // The agent should investigate further to determine if NPCs are well-defined for the starting location
    // Community analysis provides quality signal: NPCs in communities with locations are likely tied to those locations
    if (npcCount >= 3) {
      // Preliminary signal: enough NPCs exist, but agent should verify they're for starting location
      const existing = await this.checklistStatusDAO.getItemStatus(
        campaignId,
        CHECKLIST_ITEM_KEYS.STARTING_LOCATION_NPCS
      );
      // Only update if status is "incomplete" or doesn't exist
      // Don't overwrite "complete" or "partial" that was set by agent investigation
      if (!existing || existing.status === "incomplete") {
        let summary = `Preliminary: ${npcCount} NPCs found.`;
        if (communitySignals.npcsInCommunities >= 3) {
          summary += ` ${communitySignals.npcsInCommunities} NPCs are in communities together (suggesting they're related/integrated).`;
        }
        if (communitySignals.locationsInCommunities > 0) {
          summary += ` ${communitySignals.locationsInCommunities} locations found in communities.`;
        }
        summary += ` Agent should investigate if they're for the starting location and well-defined (names, roles, goals, fears).`;

        updates.push({
          id: crypto.randomUUID(),
          checklistItemKey: CHECKLIST_ITEM_KEYS.STARTING_LOCATION_NPCS,
          update: {
            status: "partial",
            summary,
          },
        });
      }
    } else if (npcCount > 0) {
      const existing = await this.checklistStatusDAO.getItemStatus(
        campaignId,
        CHECKLIST_ITEM_KEYS.STARTING_LOCATION_NPCS
      );
      if (!existing || existing.status === "incomplete") {
        updates.push({
          id: crypto.randomUUID(),
          checklistItemKey: CHECKLIST_ITEM_KEYS.STARTING_LOCATION_NPCS,
          update: {
            status: "partial",
            summary: `Preliminary: ${npcCount} NPCs found (need 3-5 for starting location). Agent should investigate if they're well-defined.`,
          },
        });
      }
    } else if (npcCount === 0) {
      // Only update if there's an existing record to mark as incomplete
      const existing = await this.checklistStatusDAO.getItemStatus(
        campaignId,
        CHECKLIST_ITEM_KEYS.STARTING_LOCATION_NPCS
      );
      if (existing && existing.status !== "incomplete") {
        updates.push({
          id: crypto.randomUUID(),
          checklistItemKey: CHECKLIST_ITEM_KEYS.STARTING_LOCATION_NPCS,
          update: {
            status: "incomplete",
            summary: null,
          },
        });
      }
    }

    if (updates.length > 0) {
      await this.checklistStatusDAO.bulkUpdateStatus(campaignId, updates);
    }
  }

  /**
   * Analyze all active campaigns and update their checklist status
   * This is designed to be called from a scheduled cron job
   */
  static async analyzeAllCampaigns(env: Env): Promise<{
    analyzed: number;
    updated: number;
    errors: number;
  }> {
    const daoFactory = getDAOFactory(env);
    const entityDAO = daoFactory.entityDAO;
    const checklistStatusService = new ChecklistStatusService(env.DB, env);

    let analyzed = 0;
    let updated = 0;
    let errors = 0;

    try {
      // Get all campaigns that have entities (more efficient than checking all)
      const campaignIds = await entityDAO.getCampaignIdsWithEntities(200);

      for (const campaignId of campaignIds) {
        try {
          analyzed++;
          await checklistStatusService.analyzeEntityCounts(campaignId, env);
          updated++;
        } catch (error) {
          errors++;
          console.error(
            `[ChecklistStatusService] Failed to analyze campaign ${campaignId}:`,
            error
          );
        }
      }
    } catch (error) {
      console.error(
        "[ChecklistStatusService] Failed to analyze all campaigns:",
        error
      );
    }

    return { analyzed, updated, errors };
  }

  /**
   * Manually update a specific checklist item
   */
  async updateItem(
    campaignId: string,
    checklistItemKey: string,
    update: ChecklistStatusUpdate
  ): Promise<void> {
    const id = crypto.randomUUID();
    await this.checklistStatusDAO.upsertItemStatus(
      id,
      campaignId,
      checklistItemKey,
      update
    );
  }
}
