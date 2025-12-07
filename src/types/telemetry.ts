/**
 * Telemetry types and interfaces for GraphRAG metrics tracking
 */

export type MetricType =
  | "query_latency"
  | "rebuild_duration"
  | "rebuild_frequency"
  | "rebuild_status"
  | "changelog_entry_count"
  | "changelog_size_bytes"
  | "changelog_growth_rate"
  | "entity_extraction_count"
  | "entities_extracted"
  | "relationship_extraction_count"
  | "dm_satisfaction"
  | "context_accuracy";

export interface TelemetryRecord {
  id: string;
  campaignId: string | null;
  metricType: MetricType;
  metricValue: number;
  metadata?: Record<string, unknown>;
  recordedAt: string;
}

export interface CreateTelemetryRecordInput {
  id: string;
  campaignId?: string | null;
  metricType: MetricType;
  metricValue: number;
  metadata?: Record<string, unknown>;
}

export interface TelemetryQueryOptions {
  campaignId?: string;
  metricType?: MetricType;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export interface AggregatedMetrics {
  metricType: MetricType;
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  sum?: number;
}

export interface TimeSeriesDataPoint {
  date: string;
  value: number;
  count: number;
}

export interface SatisfactionRating {
  campaignId: string;
  queryId?: string;
  rating: number; // 1-5 scale
  feedback?: string;
  contextType?: string;
}

export interface ContextAccuracy {
  campaignId: string;
  queryId: string;
  accuracy: number; // 0-1 scale or percentage
  notes?: string;
}

export interface AlertRule {
  metricType: MetricType;
  threshold: number;
  operator: ">" | "<" | ">=" | "<=" | "==";
  windowMinutes: number;
  aggregateType: "avg" | "p95" | "p99" | "count";
}

export interface Alert {
  id: string;
  rule: AlertRule;
  currentValue: number;
  threshold: number;
  triggeredAt: string;
  campaignId?: string;
  resolved?: boolean;
  acknowledged?: boolean;
}
