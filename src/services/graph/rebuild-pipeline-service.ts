import type { RebuildStatusDAO, RebuildType } from "@/dao/rebuild-status-dao";
import { CommunityDetectionService } from "./community-detection-service";
import { EntityImportanceService } from "./entity-importance-service";
import { RebuildTriggerService } from "./rebuild-trigger-service";
import type { EntityDAO } from "@/dao/entity-dao";
import type { CommunityDAO } from "@/dao/community-dao";
import type { CommunitySummaryDAO } from "@/dao/community-summary-dao";
import type { EntityImportanceDAO } from "@/dao/entity-importance-dao";
import type { CampaignDAO } from "@/dao/campaign-dao";
import type { WorldStateChangelogDAO } from "@/dao/world-state-changelog-dao";
import { TelemetryDAO } from "@/dao/telemetry-dao";
import { TelemetryService } from "@/services/telemetry/telemetry-service";

export interface RebuildPipelineOptions {
  regenerateSummaries?: boolean;
  recalculateImportance?: boolean;
  openaiApiKey?: string;
}

export interface RebuildPipelineResult {
  rebuildId: string;
  success: boolean;
  communitiesCount?: number;
  communities?: any[];
  error?: string;
  duration: number;
}

export class RebuildPipelineService {
  private communityDetectionService: CommunityDetectionService;
  private entityImportanceService: EntityImportanceService;
  private rebuildTriggerService: RebuildTriggerService;
  private readonly worldStateChangelogDAO: WorldStateChangelogDAO;
  private telemetryService: TelemetryService | null = null;

  constructor(
    db: any,
    private readonly rebuildStatusDAO: RebuildStatusDAO,
    entityDAO: EntityDAO,
    communityDAO: CommunityDAO,
    communitySummaryDAO: CommunitySummaryDAO,
    entityImportanceDAO: EntityImportanceDAO,
    campaignDAO: CampaignDAO,
    worldStateChangelogDAO: WorldStateChangelogDAO,
    private readonly openaiApiKey?: string
  ) {
    this.communityDetectionService = new CommunityDetectionService(
      entityDAO,
      communityDAO,
      communitySummaryDAO,
      openaiApiKey
    );
    this.entityImportanceService = new EntityImportanceService(
      entityDAO,
      undefined, // communityDAO is optional
      entityImportanceDAO
    );
    this.rebuildTriggerService = new RebuildTriggerService(campaignDAO);
    this.worldStateChangelogDAO = worldStateChangelogDAO;
    try {
      this.telemetryService = new TelemetryService(new TelemetryDAO(db));
    } catch (error) {
      console.warn(
        "[RebuildPipeline] Failed to initialize telemetry service:",
        error
      );
    }
  }

  /**
   * Execute a rebuild with full orchestration
   */
  async executeRebuild(
    rebuildId: string,
    campaignId: string,
    rebuildType: RebuildType,
    affectedEntityIds?: string[],
    options: RebuildPipelineOptions = {}
  ): Promise<RebuildPipelineResult> {
    const startTime = Date.now();
    const {
      regenerateSummaries = true,
      recalculateImportance = true,
      openaiApiKey = this.openaiApiKey,
    } = options;

    try {
      // Update status to in_progress
      await this.rebuildStatusDAO.updateRebuildStatus(rebuildId, {
        status: "in_progress",
        startedAt: new Date().toISOString(),
      });

      // Record rebuild status transition (fire and forget)
      this.telemetryService
        ?.recordRebuildStatus("in_progress", {
          campaignId,
          rebuildId,
          rebuildType,
          metadata: { affectedEntityCount: affectedEntityIds?.length || 0 },
        })
        .catch((error) => {
          console.error(
            "[RebuildPipeline] Failed to record rebuild status:",
            error
          );
        });

      console.log(
        `[RebuildPipeline] Starting ${rebuildType} rebuild for campaign ${campaignId} (rebuildId: ${rebuildId})`
      );

      // Get unapplied changelog entries before rebuild
      const unappliedEntries =
        await this.worldStateChangelogDAO.listEntriesForCampaign(campaignId, {
          appliedToGraph: false,
        });
      const unappliedEntryIds = unappliedEntries.map((entry) => entry.id);

      let communities: any[] = [];

      // Execute rebuild based on type
      if (rebuildType === "full") {
        communities = await this.executeFullRebuild(
          campaignId,
          openaiApiKey,
          regenerateSummaries
        );
      } else if (rebuildType === "partial" && affectedEntityIds) {
        communities = await this.executePartialRebuild(
          campaignId,
          affectedEntityIds,
          openaiApiKey,
          regenerateSummaries
        );
      }

      // Update entity importance
      if (recalculateImportance) {
        await this.updateEntityImportance(campaignId);
      }

      // Archive changelog entries that were applied
      if (unappliedEntryIds.length > 0) {
        await this.archiveChangelogEntries(unappliedEntryIds);
      }

      const duration = Date.now() - startTime;

      // Calculate time since last rebuild (rebuild frequency)
      const lastRebuild = await this.rebuildStatusDAO.getRebuildHistory(
        campaignId,
        { status: "completed", rebuildType, limit: 1, offset: 1 }
      );
      const hoursSinceLastRebuild =
        lastRebuild.length > 0 && lastRebuild[0].completedAt
          ? (Date.now() - new Date(lastRebuild[0].completedAt).getTime()) /
            (1000 * 60 * 60)
          : null;

      // Update status to completed
      await this.rebuildStatusDAO.updateRebuildStatus(rebuildId, {
        status: "completed",
        completedAt: new Date().toISOString(),
        metadata: {
          communitiesCount: communities.length,
          duration,
          regeneratedSummaries: regenerateSummaries,
          recalculatedImportance: recalculateImportance,
        },
      });

      // Record rebuild metrics (fire and forget)
      const telemetryPromises = [];

      // Record rebuild duration
      telemetryPromises.push(
        this.telemetryService
          ?.recordRebuildDuration(duration, {
            campaignId,
            rebuildType,
            affectedEntityCount: affectedEntityIds?.length || 0,
            metadata: { communitiesCount: communities.length },
          })
          .catch((error) => {
            console.error(
              "[RebuildPipeline] Failed to record rebuild duration:",
              error
            );
          })
      );

      // Record rebuild frequency
      if (hoursSinceLastRebuild !== null) {
        telemetryPromises.push(
          this.telemetryService
            ?.recordRebuildFrequency(hoursSinceLastRebuild, {
              campaignId,
              rebuildType,
            })
            .catch((error) => {
              console.error(
                "[RebuildPipeline] Failed to record rebuild frequency:",
                error
              );
            })
        );
      }

      // Record rebuild status transition
      telemetryPromises.push(
        this.telemetryService
          ?.recordRebuildStatus("completed", {
            campaignId,
            rebuildId,
            rebuildType,
            metadata: {
              duration,
              communitiesCount: communities.length,
              affectedEntityCount: affectedEntityIds?.length || 0,
            },
          })
          .catch((error) => {
            console.error(
              "[RebuildPipeline] Failed to record rebuild status:",
              error
            );
          })
      );

      await Promise.allSettled(telemetryPromises);

      // Reset impact score after successful rebuild
      await this.rebuildTriggerService.resetImpact(campaignId);

      console.log(
        `[RebuildPipeline] Rebuild completed successfully in ${duration}ms: ${communities.length} communities`
      );

      return {
        rebuildId,
        success: true,
        communitiesCount: communities.length,
        communities,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      console.error(
        `[RebuildPipeline] Rebuild failed after ${duration}ms:`,
        error
      );

      // Update status to failed
      await this.rebuildStatusDAO.updateRebuildStatus(rebuildId, {
        status: "failed",
        completedAt: new Date().toISOString(),
        errorMessage,
      });

      // Record rebuild status as failed (fire and forget)
      this.telemetryService
        ?.recordRebuildStatus("failed", {
          campaignId,
          rebuildId,
          rebuildType,
          metadata: {
            duration,
            errorMessage,
            affectedEntityCount: affectedEntityIds?.length || 0,
          },
        })
        .catch((error) => {
          console.error(
            "[RebuildPipeline] Failed to record rebuild status:",
            error
          );
        });

      return {
        rebuildId,
        success: false,
        error: errorMessage,
        duration,
      };
    }
  }

  /**
   * Execute full rebuild for entire campaign
   */
  private async executeFullRebuild(
    campaignId: string,
    openaiApiKey?: string,
    regenerateSummaries = true
  ): Promise<any[]> {
    console.log(
      `[RebuildPipeline] Executing full rebuild for campaign ${campaignId}`
    );

    // Delete existing communities and detect new ones
    const communities = await this.communityDetectionService.rebuildCommunities(
      campaignId,
      regenerateSummaries && openaiApiKey
        ? ({ generateSummaries: true, openaiApiKey } as any)
        : {}
    );

    return communities;
  }

  /**
   * Execute partial rebuild for affected entities
   */
  private async executePartialRebuild(
    campaignId: string,
    affectedEntityIds: string[],
    openaiApiKey?: string,
    regenerateSummaries = true
  ): Promise<any[]> {
    console.log(
      `[RebuildPipeline] Executing partial rebuild for campaign ${campaignId}, affected entities: ${affectedEntityIds.length}`
    );

    // Incremental update for affected communities
    const communities = await this.communityDetectionService.incrementalUpdate(
      campaignId,
      affectedEntityIds,
      regenerateSummaries && openaiApiKey
        ? ({ generateSummaries: true, openaiApiKey } as any)
        : {}
    );

    return communities;
  }

  /**
   * Update entity importance scores for campaign
   */
  private async updateEntityImportance(campaignId: string): Promise<void> {
    console.log(
      `[RebuildPipeline] Recalculating entity importance for campaign ${campaignId}`
    );

    await this.entityImportanceService.recalculateImportanceForCampaign(
      campaignId
    );
  }

  /**
   * Archive changelog entries that were applied during rebuild
   */
  private async archiveChangelogEntries(entryIds: string[]): Promise<void> {
    if (entryIds.length === 0) {
      return;
    }

    console.log(
      `[RebuildPipeline] Archiving ${entryIds.length} changelog entries`
    );

    await this.worldStateChangelogDAO.markEntriesApplied(entryIds);
  }
}
