import type { CampaignDAO } from "@/dao/campaign-dao";
import {
  FULL_REBUILD_THRESHOLD,
  PARTIAL_REBUILD_THRESHOLD,
} from "@/lib/rebuild-config";

export type RebuildType = "full" | "partial" | "none";

export interface RebuildDecision {
  shouldRebuild: boolean;
  rebuildType: RebuildType;
  cumulativeImpact: number;
  affectedEntities?: string[];
  timestamp: string;
}

export class RebuildTriggerService {
  constructor(private readonly campaignDAO: CampaignDAO) {}

  async recordImpact(campaignId: string, impactScore: number): Promise<number> {
    const campaign = await this.campaignDAO.getCampaignById(campaignId);
    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    let metadata: Record<string, unknown> = {};
    if (campaign.metadata) {
      try {
        metadata = JSON.parse(campaign.metadata) as Record<string, unknown>;
      } catch (_error) {
        metadata = {};
      }
    }

    const currentImpact = (metadata.cumulativeImpact as number) ?? 0;
    const newImpact = currentImpact + impactScore;

    await this.campaignDAO.updateCampaign(campaignId, {
      metadata: {
        ...metadata,
        cumulativeImpact: newImpact,
        lastImpactUpdate: new Date().toISOString(),
      },
    });

    return newImpact;
  }

  async getCumulativeImpact(campaignId: string): Promise<number> {
    const campaign = await this.campaignDAO.getCampaignById(campaignId);
    if (!campaign) {
      return 0;
    }

    let metadata: Record<string, unknown> = {};
    if (campaign.metadata) {
      try {
        metadata = JSON.parse(campaign.metadata) as Record<string, unknown>;
      } catch (_error) {
        metadata = {};
      }
    }

    return (metadata.cumulativeImpact as number) ?? 0;
  }

  async shouldTriggerRebuild(campaignId: string): Promise<boolean> {
    const cumulativeImpact = await this.getCumulativeImpact(campaignId);
    return cumulativeImpact >= FULL_REBUILD_THRESHOLD;
  }

  async getRebuildType(
    campaignId: string,
    affectedEntityIds?: string[]
  ): Promise<RebuildType> {
    const cumulativeImpact = await this.getCumulativeImpact(campaignId);

    if (cumulativeImpact >= FULL_REBUILD_THRESHOLD) {
      return "full";
    }

    if (cumulativeImpact >= PARTIAL_REBUILD_THRESHOLD) {
      if (affectedEntityIds && affectedEntityIds.length > 0) {
        return "partial";
      }
      return "none";
    }

    return "none";
  }

  async makeRebuildDecision(
    campaignId: string,
    affectedEntityIds?: string[]
  ): Promise<RebuildDecision> {
    const cumulativeImpact = await this.getCumulativeImpact(campaignId);
    const rebuildType = await this.getRebuildType(
      campaignId,
      affectedEntityIds
    );

    const shouldRebuild = rebuildType !== "none";

    const decision: RebuildDecision = {
      shouldRebuild,
      rebuildType,
      cumulativeImpact,
      affectedEntities: affectedEntityIds,
      timestamp: new Date().toISOString(),
    };

    if (shouldRebuild) {
      console.log(
        `[RebuildTrigger] Rebuild decision for campaign ${campaignId}:`,
        {
          type: rebuildType,
          cumulativeImpact,
          affectedEntities: affectedEntityIds?.length ?? 0,
        }
      );
    }

    return decision;
  }

  async resetImpact(campaignId: string): Promise<void> {
    const campaign = await this.campaignDAO.getCampaignById(campaignId);
    if (!campaign) {
      return;
    }

    let metadata: Record<string, unknown> = {};
    if (campaign.metadata) {
      try {
        metadata = JSON.parse(campaign.metadata) as Record<string, unknown>;
      } catch (_error) {
        metadata = {};
      }
    }

    await this.campaignDAO.updateCampaign(campaignId, {
      metadata: {
        ...metadata,
        cumulativeImpact: 0,
        lastRebuildAt: new Date().toISOString(),
      },
    });
  }

  async logRebuildDecision(
    campaignId: string,
    decision: RebuildDecision,
    rebuildResult?: { success: boolean; communitiesCount?: number }
  ): Promise<void> {
    const logEntry = {
      campaignId,
      decision,
      rebuildResult,
      timestamp: new Date().toISOString(),
    };

    console.log(`[RebuildTrigger] Rebuild decision log:`, logEntry);
  }
}
