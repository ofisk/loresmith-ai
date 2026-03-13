import type { CampaignDAO } from "@/dao/campaign-dao";
import type { EntityDAO } from "@/dao/entity-dao";
import type { GraphRebuildDirtyDAO } from "@/dao/graph-rebuild-dirty-dao";
import type { RebuildStatusDAO } from "@/dao/rebuild-status-dao";
import {
	FULL_REBUILD_THRESHOLD,
	PARTIAL_REBUILD_THRESHOLD,
} from "@/lib/rebuild-config";
import type { RebuildQueueService } from "./rebuild-queue-service";

export type RebuildType = "full" | "partial" | "none";

export interface RebuildDecision {
	shouldRebuild: boolean;
	rebuildType: RebuildType;
	cumulativeImpact: number;
	affectedEntities?: string[];
	mode?: "incremental" | "full";
	fallbackReason?: string;
	timestamp: string;
}

interface EnqueueDecisionInput {
	campaignId: string;
	triggeredBy: string;
	requestedRadius?: number;
	dirtyEntitySeedIds?: string[];
	queueService: RebuildQueueService;
}

interface EnqueueDecisionResult {
	enqueued: boolean;
	reason?: string;
	rebuildId?: string;
	rebuildType?: "full" | "partial";
	mode?: "incremental" | "full";
	fallbackReason?: string;
	dirtyEntityCount?: number;
	neighborhoodEntityCount?: number;
	idempotencyToken?: string;
}

export class RebuildTriggerService {
	constructor(
		private readonly campaignDAO: CampaignDAO,
		private readonly entityDAO?: EntityDAO,
		private readonly rebuildStatusDAO?: RebuildStatusDAO,
		private readonly graphRebuildDirtyDAO?: GraphRebuildDirtyDAO
	) {}

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
		}

		return decision;
	}

	async decideAndEnqueueRebuild(
		input: EnqueueDecisionInput
	): Promise<EnqueueDecisionResult> {
		if (
			!this.entityDAO ||
			!this.rebuildStatusDAO ||
			!this.graphRebuildDirtyDAO
		) {
			throw new Error(
				"RebuildTriggerService requires entityDAO, rebuildStatusDAO, and graphRebuildDirtyDAO for enqueue decisions"
			);
		}

		const {
			campaignId,
			triggeredBy,
			queueService,
			requestedRadius = 2,
			dirtyEntitySeedIds = [],
		} = input;
		const dirtySnapshot =
			await this.graphRebuildDirtyDAO.getDirtySnapshot(campaignId);
		const dirtyEntityIds = Array.from(
			new Set([...dirtySnapshot.entityIds, ...dirtyEntitySeedIds])
		);

		if (dirtyEntityIds.length === 0) {
			return { enqueued: false, reason: "No dirty entities" };
		}

		const active =
			await this.rebuildStatusDAO.getActiveRebuildForCampaign(campaignId);
		if (active) {
			return {
				enqueued: false,
				reason: `Active rebuild already present (${active.id})`,
			};
		}

		const totalEntityCount =
			await this.entityDAO.getEntityCountByCampaign(campaignId);
		const dirtyRatio =
			totalEntityCount > 0 ? dirtyEntityIds.length / totalEntityCount : 1;
		const mode: "incremental" | "full" =
			dirtyEntityIds.length >= 300 || dirtyRatio >= 0.35
				? "full"
				: "incremental";
		const fallbackReason =
			mode === "full"
				? dirtyEntityIds.length >= 300
					? "dirty_set_large"
					: "dirty_ratio_large"
				: undefined;
		const rebuildType: "full" | "partial" =
			mode === "full" ? "full" : "partial";

		const neighborhood = await this.graphRebuildDirtyDAO.getTwoHopNeighborhood(
			campaignId,
			dirtyEntityIds,
			requestedRadius
		);
		const idempotencyToken = this.buildIdempotencyToken(
			campaignId,
			mode,
			dirtyEntityIds
		);

		const existingDedupe = await this.graphRebuildDirtyDAO.getExistingDedupeJob(
			campaignId,
			idempotencyToken
		);
		if (
			existingDedupe &&
			(existingDedupe.status === "pending" ||
				existingDedupe.status === "running")
		) {
			return {
				enqueued: false,
				reason: "Equivalent rebuild job is already active",
				idempotencyToken,
			};
		}

		const rebuildId = crypto.randomUUID();
		await this.rebuildStatusDAO.createRebuild({
			id: rebuildId,
			campaignId,
			rebuildType,
			status: "pending",
			affectedEntityIds: mode === "full" ? undefined : neighborhood.entityIds,
			metadata: {
				mode,
				fallbackReason,
				dirtyEntityCount: dirtyEntityIds.length,
				neighborhoodEntityCount: neighborhood.entityIds.length,
				requestedRadius,
				idempotencyToken,
			},
		});

		await this.graphRebuildDirtyDAO.upsertDedupeJob({
			campaignId,
			idempotencyKey: idempotencyToken,
			rebuildMode: mode,
			status: "pending",
			lastRebuildId: rebuildId,
			payload: {
				dirtyEntityCount: dirtyEntityIds.length,
				neighborhoodEntityCount: neighborhood.entityIds.length,
				requestedRadius,
				fallbackReason,
			},
		});

		await queueService.enqueueRebuild({
			rebuildId,
			campaignId,
			rebuildType,
			affectedEntityIds: mode === "full" ? undefined : neighborhood.entityIds,
			dirtyEntitySeedIds: dirtyEntityIds,
			requestedRadius,
			mode,
			fallbackReason,
			idempotencyToken,
			triggeredBy,
			options: {
				regenerateSummaries: true,
				recalculateImportance: true,
			},
		});

		return {
			enqueued: true,
			rebuildId,
			rebuildType,
			mode,
			fallbackReason,
			dirtyEntityCount: dirtyEntityIds.length,
			neighborhoodEntityCount: neighborhood.entityIds.length,
			idempotencyToken,
		};
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
		_campaignId: string,
		_decision: RebuildDecision,
		_rebuildResult?: { success: boolean; communitiesCount?: number }
	): Promise<void> {
		// Logging placeholder for future use
	}

	private buildIdempotencyToken(
		campaignId: string,
		mode: "incremental" | "full",
		entityIds: string[]
	): string {
		const stableIds = Array.from(new Set(entityIds)).sort();
		return `${campaignId}:${mode}:${stableIds.join("|")}`;
	}
}
