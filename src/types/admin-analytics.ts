/**
 * Admin-only aggregated analytics for the GraphRAG telemetry dashboard.
 */

export interface AdminTelemetryWindow {
	from: string;
	to: string;
}

export interface ShardAnalytics {
	/** Entities created in the time window */
	createdInWindow: number;
	/** Counts by shard_status for rows created in window */
	byStatusCreatedInWindow: Record<string, number>;
	/** Approved / rejected counts where updated_at falls in window */
	approveRejectInWindow: {
		approved: number;
		rejected: number;
		/** approved / (approved + rejected), null if none */
		approvalRate: number | null;
	};
	/** Top entity types for creates in window */
	topEntityTypesCreated: { entityType: string; count: number }[];
}

export interface StuckJobSample {
	kind:
		| "entity_extraction"
		| "sync_queue"
		| "rebuild"
		| "file_processing_chunk";
	id: string;
	campaignId?: string;
	username?: string;
	detail?: string;
	ageMinutes: number;
	status?: string;
}

export interface StuckQueuesAnalytics {
	entityExtraction: { count: number; samples: StuckJobSample[] };
	syncQueue: { count: number; samples: StuckJobSample[] };
	rebuild: { count: number; samples: StuckJobSample[] };
	fileChunks: { count: number; samples: StuckJobSample[] };
}

export interface RebuildHealthAnalytics {
	countsByStatusInWindow: Record<string, number>;
	completedInWindow: number;
	/** Parsed from rebuild_status.metadata JSON when present */
	completedDurationMs: {
		count: number;
		avg: number | null;
		median: number | null;
	};
}

export interface DigestFunnelAnalytics {
	countsByStatusInWindow: Record<string, number>;
}

export interface DedupAnalytics {
	pendingCount: number;
	oldestPendingAgeHours: number | null;
	resolvedInWindow: number;
}

export interface GrowthAnalytics {
	campaignsCreatedInWindow: number;
	resourcesCreatedInWindow: number;
}

export interface LibraryHealthAnalytics {
	statusDistribution: Record<string, number>;
	withProcessingError: number;
	memoryLimitExceeded: number;
	analysisStatusDistribution: Record<string, number>;
}

export interface UsageLeaderRow {
	username: string;
	messageCount?: number;
	tokens?: number;
	yearMonth?: string;
	tokensUsed?: number;
}

export interface UsageAnalytics {
	topByMessages: UsageLeaderRow[];
	topByMonthlyTokens: UsageLeaderRow[];
	topByLifetimeFreeTier: UsageLeaderRow[];
}

export interface AdminTelemetryOverviewResponse {
	window: AdminTelemetryWindow;
	stuckThresholds: {
		entityExtractionMinutes: number;
		syncQueueMinutes: number;
		rebuildMinutes: number;
		fileChunkMinutes: number;
	};
	shards: ShardAnalytics;
	queues: { stuck: StuckQueuesAnalytics };
	rebuilds: RebuildHealthAnalytics;
	digests: DigestFunnelAnalytics;
	dedup: DedupAnalytics;
	growth: GrowthAnalytics;
	library: LibraryHealthAnalytics;
	usage: UsageAnalytics;
	/** Aggregates from graphrag_telemetry (null if no rows) */
	telemetry: {
		fileProcessingDurationMs:
			| import("@/types/telemetry").AggregatedMetrics
			| null;
		queryLatency: import("@/types/telemetry").AggregatedMetrics | null;
		rebuildDuration: import("@/types/telemetry").AggregatedMetrics | null;
		dmSatisfaction: import("@/types/telemetry").AggregatedMetrics | null;
		contextAccuracy: import("@/types/telemetry").AggregatedMetrics | null;
		changelogEntryCount: import("@/types/telemetry").AggregatedMetrics | null;
	};
	lastUpdated: string;
}
