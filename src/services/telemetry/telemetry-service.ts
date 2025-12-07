import type { TelemetryDAO } from "@/dao/telemetry-dao";
import type {
  MetricType,
  AggregatedMetrics,
  TimeSeriesDataPoint,
  TelemetryQueryOptions,
} from "@/types/telemetry";

export class TelemetryService {
  constructor(private readonly telemetryDAO: TelemetryDAO) {}

  /**
   * Record a metric
   */
  async recordMetric(
    metricType: MetricType,
    metricValue: number,
    options: {
      campaignId?: string | null;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<void> {
    const id = crypto.randomUUID();
    await this.telemetryDAO.recordMetric({
      id,
      metricType,
      metricValue,
      campaignId: options.campaignId || null,
      metadata: options.metadata,
    });
  }

  /**
   * Record query latency metric
   */
  async recordQueryLatency(
    latencyMs: number,
    options: {
      campaignId?: string;
      queryType?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<void> {
    await this.recordMetric("query_latency", latencyMs, {
      campaignId: options.campaignId,
      metadata: {
        queryType: options.queryType,
        ...options.metadata,
      },
    });
  }

  /**
   * Record rebuild duration metric
   */
  async recordRebuildDuration(
    durationMs: number,
    options: {
      campaignId?: string;
      rebuildType?: string;
      affectedEntityCount?: number;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<void> {
    await this.recordMetric("rebuild_duration", durationMs, {
      campaignId: options.campaignId,
      metadata: {
        rebuildType: options.rebuildType,
        affectedEntityCount: options.affectedEntityCount,
        ...options.metadata,
      },
    });
  }

  /**
   * Record rebuild frequency metric (time since last rebuild)
   */
  async recordRebuildFrequency(
    hoursSinceLastRebuild: number,
    options: {
      campaignId?: string;
      rebuildType?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<void> {
    await this.recordMetric("rebuild_frequency", hoursSinceLastRebuild, {
      campaignId: options.campaignId,
      metadata: {
        rebuildType: options.rebuildType,
        ...options.metadata,
      },
    });
  }

  /**
   * Record rebuild status transition
   */
  async recordRebuildStatus(
    status: string,
    options: {
      campaignId?: string;
      rebuildId?: string;
      rebuildType?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<void> {
    await this.recordMetric("rebuild_status", 1, {
      campaignId: options.campaignId,
      metadata: {
        status,
        rebuildId: options.rebuildId,
        rebuildType: options.rebuildType,
        ...options.metadata,
      },
    });
  }

  /**
   * Record changelog entry count
   */
  async recordChangelogEntryCount(
    count: number,
    options: {
      campaignId?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<void> {
    await this.recordMetric("changelog_entry_count", count, {
      campaignId: options.campaignId,
      metadata: options.metadata,
    });
  }

  /**
   * Record changelog size in bytes
   */
  async recordChangelogSize(
    sizeBytes: number,
    options: {
      campaignId?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<void> {
    await this.recordMetric("changelog_size_bytes", sizeBytes, {
      campaignId: options.campaignId,
      metadata: options.metadata,
    });
  }

  /**
   * Record changelog growth rate (entries per time period)
   */
  async recordChangelogGrowthRate(
    entriesPerPeriod: number,
    options: {
      campaignId?: string;
      period?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<void> {
    await this.recordMetric("changelog_growth_rate", entriesPerPeriod, {
      campaignId: options.campaignId,
      metadata: {
        period: options.period,
        ...options.metadata,
      },
    });
  }

  /**
   * Record entity extraction count
   */
  async recordEntityExtractionCount(
    count: number,
    options: {
      campaignId?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<void> {
    await this.recordMetric("entity_extraction_count", count, {
      campaignId: options.campaignId,
      metadata: options.metadata,
    });
  }

  /**
   * Record number of entities extracted
   */
  async recordEntitiesExtracted(
    count: number,
    options: {
      campaignId?: string;
      confidenceScore?: number;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<void> {
    await this.recordMetric("entities_extracted", count, {
      campaignId: options.campaignId,
      metadata: {
        confidenceScore: options.confidenceScore,
        ...options.metadata,
      },
    });
  }

  /**
   * Record relationship extraction count
   */
  async recordRelationshipExtractionCount(
    count: number,
    options: {
      campaignId?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<void> {
    await this.recordMetric("relationship_extraction_count", count, {
      campaignId: options.campaignId,
      metadata: options.metadata,
    });
  }

  /**
   * Record DM satisfaction rating
   */
  async recordDmSatisfaction(
    rating: number,
    options: {
      campaignId?: string;
      queryId?: string;
      feedback?: string;
      contextType?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<void> {
    await this.recordMetric("dm_satisfaction", rating, {
      campaignId: options.campaignId,
      metadata: {
        queryId: options.queryId,
        feedback: options.feedback,
        contextType: options.contextType,
        ...options.metadata,
      },
    });
  }

  /**
   * Record context accuracy measurement
   */
  async recordContextAccuracy(
    accuracy: number,
    options: {
      campaignId?: string;
      queryId?: string;
      notes?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<void> {
    await this.recordMetric("context_accuracy", accuracy, {
      campaignId: options.campaignId,
      metadata: {
        queryId: options.queryId,
        notes: options.notes,
        ...options.metadata,
      },
    });
  }

  /**
   * Get aggregated metrics for a specific metric type
   */
  async getAggregatedMetrics(
    metricType: MetricType,
    options: {
      campaignId?: string;
      fromDate?: string;
      toDate?: string;
    } = {}
  ): Promise<AggregatedMetrics | null> {
    return this.telemetryDAO.getAggregatedMetrics(metricType, options);
  }

  /**
   * Get time series data for a metric
   */
  async getTimeSeriesData(
    metricType: MetricType,
    options: {
      campaignId?: string;
      fromDate?: string;
      toDate?: string;
      interval: "hour" | "day" | "week";
    }
  ): Promise<TimeSeriesDataPoint[]> {
    return this.telemetryDAO.getTimeSeriesData(metricType, options);
  }

  /**
   * Get metrics with query options
   */
  async getMetrics(
    options: TelemetryQueryOptions = {}
  ): Promise<ReturnType<typeof this.telemetryDAO.getMetrics>> {
    return this.telemetryDAO.getMetrics(options);
  }
}
