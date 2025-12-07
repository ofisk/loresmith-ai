import { BaseDAOClass } from "./base-dao";
import type {
  TelemetryRecord,
  CreateTelemetryRecordInput,
  TelemetryQueryOptions,
  AggregatedMetrics,
  TimeSeriesDataPoint,
  MetricType,
} from "@/types/telemetry";

// Raw row structure matching the database schema
export interface TelemetryRecordRow {
  id: string;
  campaign_id: string | null;
  metric_type: string;
  metric_value: number;
  metadata: string | null;
  recorded_at: string;
}

export class TelemetryDAO extends BaseDAOClass {
  async recordMetric(input: CreateTelemetryRecordInput): Promise<void> {
    const sql = `
      INSERT INTO graphrag_telemetry (
        id,
        campaign_id,
        metric_type,
        metric_value,
        metadata,
        recorded_at
      ) VALUES (
        ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
      )
    `;

    await this.execute(sql, [
      input.id,
      input.campaignId || null,
      input.metricType,
      input.metricValue,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ]);
  }

  async getMetrics(
    options: TelemetryQueryOptions = {}
  ): Promise<TelemetryRecord[]> {
    const conditions: string[] = [];
    const params: any[] = [];

    if (options.campaignId) {
      conditions.push("campaign_id = ?");
      params.push(options.campaignId);
    }

    if (options.metricType) {
      conditions.push("metric_type = ?");
      params.push(options.metricType);
    }

    if (options.fromDate) {
      conditions.push("recorded_at >= ?");
      params.push(options.fromDate);
    }

    if (options.toDate) {
      conditions.push("recorded_at <= ?");
      params.push(options.toDate);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const limit = options.limit || 1000;
    const offset = options.offset || 0;

    const sql = `
      SELECT 
        id,
        campaign_id,
        metric_type,
        metric_value,
        metadata,
        recorded_at
      FROM graphrag_telemetry
      ${whereClause}
      ORDER BY recorded_at DESC
      LIMIT ? OFFSET ?
    `;

    const rows = await this.queryAll<TelemetryRecordRow>(sql, [
      ...params,
      limit,
      offset,
    ]);

    return rows.map(this.mapRowToRecord);
  }

  async getMetricsByType(
    metricType: MetricType,
    options: Omit<TelemetryQueryOptions, "metricType"> = {}
  ): Promise<TelemetryRecord[]> {
    return this.getMetrics({ ...options, metricType });
  }

  async getMetricsByCampaign(
    campaignId: string,
    options: Omit<TelemetryQueryOptions, "campaignId"> = {}
  ): Promise<TelemetryRecord[]> {
    return this.getMetrics({ ...options, campaignId });
  }

  async getAggregatedMetrics(
    metricType: MetricType,
    options: {
      campaignId?: string;
      fromDate?: string;
      toDate?: string;
    } = {}
  ): Promise<AggregatedMetrics | null> {
    const conditions: string[] = ["metric_type = ?"];
    const params: any[] = [metricType];

    if (options.campaignId) {
      conditions.push("campaign_id = ?");
      params.push(options.campaignId);
    }

    if (options.fromDate) {
      conditions.push("recorded_at >= ?");
      params.push(options.fromDate);
    }

    if (options.toDate) {
      conditions.push("recorded_at <= ?");
      params.push(options.toDate);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    // Get all values for percentile calculation
    const sql = `
      SELECT metric_value
      FROM graphrag_telemetry
      ${whereClause}
      ORDER BY metric_value
    `;

    const rows = await this.queryAll<{ metric_value: number }>(sql, params);

    if (rows.length === 0) {
      return null;
    }

    const values = rows.map((r) => r.metric_value);
    const sorted = values.sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    const avg = sum / count;
    const min = sorted[0];
    const max = sorted[count - 1];

    // Calculate percentiles
    const p50 = this.calculatePercentile(sorted, 50);
    const p95 = this.calculatePercentile(sorted, 95);
    const p99 = this.calculatePercentile(sorted, 99);

    return {
      metricType,
      count,
      min,
      max,
      avg,
      p50,
      p95,
      p99,
      sum,
    };
  }

  async getTimeSeriesData(
    metricType: MetricType,
    options: {
      campaignId?: string;
      fromDate?: string;
      toDate?: string;
      interval: "hour" | "day" | "week";
    }
  ): Promise<TimeSeriesDataPoint[]> {
    const conditions: string[] = ["metric_type = ?"];
    const params: any[] = [metricType];

    if (options.campaignId) {
      conditions.push("campaign_id = ?");
      params.push(options.campaignId);
    }

    if (options.fromDate) {
      conditions.push("recorded_at >= ?");
      params.push(options.fromDate);
    }

    if (options.toDate) {
      conditions.push("recorded_at <= ?");
      params.push(options.toDate);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    // Format date based on interval
    let dateFormat: string;
    switch (options.interval) {
      case "hour":
        dateFormat = "strftime('%Y-%m-%d %H:00:00', recorded_at)";
        break;
      case "day":
        dateFormat = "date(recorded_at)";
        break;
      case "week":
        dateFormat =
          "date(recorded_at, '-' || ((strftime('%w', recorded_at) + 6) % 7) || ' days')";
        break;
      default:
        dateFormat = "date(recorded_at)";
    }

    const sql = `
      SELECT 
        ${dateFormat} as date,
        AVG(metric_value) as value,
        COUNT(*) as count
      FROM graphrag_telemetry
      ${whereClause}
      GROUP BY date
      ORDER BY date ASC
    `;

    const rows = await this.queryAll<{
      date: string;
      value: number;
      count: number;
    }>(sql, params);

    return rows.map((row) => ({
      date: row.date,
      value: row.value,
      count: row.count,
    }));
  }

  private calculatePercentile(sorted: number[], percentile: number): number {
    if (sorted.length === 0) return 0;
    const index = (percentile / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (lower === upper) {
      return sorted[lower];
    }

    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  private mapRowToRecord(row: TelemetryRecordRow): TelemetryRecord {
    return {
      id: row.id,
      campaignId: row.campaign_id,
      metricType: row.metric_type as MetricType,
      metricValue: row.metric_value,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      recordedAt: row.recorded_at,
    };
  }
}
