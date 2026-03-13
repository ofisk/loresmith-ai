import type { CampaignDAO } from "@/dao/campaign-dao";
import type { CommunityDAO } from "@/dao/community-dao";
import type { CommunitySummaryDAO } from "@/dao/community-summary-dao";
import type { EntityDAO } from "@/dao/entity-dao";
import type { EntityImportanceDAO } from "@/dao/entity-importance-dao";
import type { GraphRebuildDirtyDAO } from "@/dao/graph-rebuild-dirty-dao";
import type { RebuildStatusDAO, RebuildType } from "@/dao/rebuild-status-dao";
import { TelemetryDAO } from "@/dao/telemetry-dao";
import type { WorldStateChangelogDAO } from "@/dao/world-state-changelog-dao";
import { TelemetryService } from "@/services/telemetry/telemetry-service";
import { ChangelogArchiveService } from "./changelog-archive-service";
import { CommunityDetectionService } from "./community-detection-service";
import { EntityImportanceService } from "./entity-importance-service";
import { RebuildTriggerService } from "./rebuild-trigger-service";

export interface RebuildPipelineOptions {
	regenerateSummaries?: boolean;
	recalculateImportance?: boolean;
	openaiApiKey?: string;
}

export interface RebuildExecutionContext {
	mode?: "incremental" | "full";
	requestedRadius?: number;
	idempotencyToken?: string;
	dirtyEntitySeedIds?: string[];
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
	private readonly graphRebuildDirtyDAO?: GraphRebuildDirtyDAO;
	private telemetryService: TelemetryService | null = null;
	private readonly env?: any;

	constructor(
		db: any,
		private readonly rebuildStatusDAO: RebuildStatusDAO,
		entityDAO: EntityDAO,
		communityDAO: CommunityDAO,
		communitySummaryDAO: CommunitySummaryDAO,
		entityImportanceDAO: EntityImportanceDAO,
		campaignDAO: CampaignDAO,
		worldStateChangelogDAO: WorldStateChangelogDAO,
		graphRebuildDirtyDAO?: GraphRebuildDirtyDAO,
		private readonly openaiApiKey?: string,
		env?: any
	) {
		this.env = env;
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
		this.graphRebuildDirtyDAO = graphRebuildDirtyDAO;
		try {
			this.telemetryService = new TelemetryService(new TelemetryDAO(db));
		} catch (_error) {}
	}

	/**
	 * Execute a rebuild with full orchestration
	 */
	async executeRebuild(
		rebuildId: string,
		campaignId: string,
		rebuildType: RebuildType,
		affectedEntityIds?: string[],
		options: RebuildPipelineOptions = {},
		executionContext: RebuildExecutionContext = {}
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
			if (this.graphRebuildDirtyDAO && executionContext.idempotencyToken) {
				await this.graphRebuildDirtyDAO.upsertDedupeJob({
					campaignId,
					idempotencyKey: executionContext.idempotencyToken,
					rebuildMode:
						executionContext.mode ??
						(rebuildType === "full" ? "full" : "incremental"),
					status: "running",
					lastRebuildId: rebuildId,
				});
			}

			// Record rebuild status transition (fire and forget)
			this.telemetryService
				?.recordRebuildStatus("in_progress", {
					campaignId,
					rebuildId,
					rebuildType,
					metadata: { affectedEntityCount: affectedEntityIds?.length || 0 },
				})
				.catch((_error) => {});

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
					executionContext.requestedRadius ?? 2,
					openaiApiKey,
					regenerateSummaries
				);
			}

			// Update entity importance
			if (recalculateImportance) {
				if (
					rebuildType === "partial" &&
					affectedEntityIds &&
					affectedEntityIds.length
				) {
					await this.updateEntityImportanceIncremental(
						campaignId,
						affectedEntityIds,
						executionContext.requestedRadius ?? 2
					);
				} else {
					await this.updateEntityImportance(campaignId);
				}
			}

			// Archive changelog entries that were applied
			if (unappliedEntryIds.length > 0 && this.env?.R2) {
				try {
					const archiveService = new ChangelogArchiveService({
						db: this.env.DB!,
						r2: this.env.R2,
						vectorize: this.env.VECTORIZE,
						openaiApiKey: openaiApiKey,
						env: this.env,
					});
					await archiveService.archiveChangelogEntries(
						unappliedEntryIds,
						rebuildId,
						campaignId
					);
				} catch (_error) {
					// Continue even if archival fails - entries are still marked as applied
				}
			} else if (unappliedEntryIds.length > 0) {
				// Fallback: just mark as applied if R2 is not available
				await this.worldStateChangelogDAO.markEntriesApplied(unappliedEntryIds);
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
					.catch((_error) => {})
			);

			// Record rebuild frequency
			if (hoursSinceLastRebuild !== null) {
				telemetryPromises.push(
					this.telemetryService
						?.recordRebuildFrequency(hoursSinceLastRebuild, {
							campaignId,
							rebuildType,
						})
						.catch((_error) => {})
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
					.catch((_error) => {})
			);

			await Promise.allSettled(telemetryPromises);

			if (this.graphRebuildDirtyDAO) {
				if (rebuildType === "full") {
					await this.graphRebuildDirtyDAO.clearDirtyForCampaign(campaignId);
				} else if (affectedEntityIds && affectedEntityIds.length > 0) {
					await this.graphRebuildDirtyDAO.clearDirtyForEntities(
						campaignId,
						affectedEntityIds
					);
				}
				if (executionContext.idempotencyToken) {
					await this.graphRebuildDirtyDAO.upsertDedupeJob({
						campaignId,
						idempotencyKey: executionContext.idempotencyToken,
						rebuildMode:
							executionContext.mode ??
							(rebuildType === "full" ? "full" : "incremental"),
						status: "completed",
						lastRebuildId: rebuildId,
					});
				}
			}

			// Reset impact score after successful rebuild
			await this.rebuildTriggerService.resetImpact(campaignId);

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
				.catch((_error) => {});
			if (this.graphRebuildDirtyDAO && executionContext.idempotencyToken) {
				await this.graphRebuildDirtyDAO.upsertDedupeJob({
					campaignId,
					idempotencyKey: executionContext.idempotencyToken,
					rebuildMode:
						executionContext.mode ??
						(rebuildType === "full" ? "full" : "incremental"),
					status: "failed",
					lastRebuildId: rebuildId,
				});
			}

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
		radius: number,
		openaiApiKey?: string,
		regenerateSummaries = true
	): Promise<any[]> {
		// Incremental update for affected communities
		const communities = await this.communityDetectionService.incrementalUpdate(
			campaignId,
			affectedEntityIds,
			radius,
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
		await this.entityImportanceService.recalculateImportanceForCampaign(
			campaignId
		);
	}

	private async updateEntityImportanceIncremental(
		campaignId: string,
		affectedEntityIds: string[],
		radius: number
	): Promise<void> {
		await this.entityImportanceService.recalculateImportanceIncremental(
			campaignId,
			affectedEntityIds,
			{ radius }
		);
	}
}
