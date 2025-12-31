import type { StructuredEntityType } from "@/lib/entity-types";

/**
 * Unified shard types for the entire system
 * Consolidates all shard interfaces to eliminate duplication
 */

/**
 * Status for shards and entities
 * Used across the codebase for tracking shard/entity approval state
 * Note: "deleted" is primarily used for shards; entities typically use "staging", "approved", or "rejected"
 */
export type ShardStatus = "staging" | "approved" | "rejected" | "deleted";

/**
 * Shard metadata containing file and source information
 */
export interface ShardMetadata {
  fileKey: string;
  fileName: string;
  source: string;
  campaignId: string;
  entityType: StructuredEntityType;
  confidence: number;
  originalMetadata?: Record<string, unknown>;
  sourceRef?: ShardSourceRef;
  [key: string]: unknown;
}

/**
 * Source reference for a shard, pointing to its origin
 */
export interface ShardSourceRef {
  fileKey: string;
  meta: {
    fileName: string;
    campaignId: string;
    entityType: string;
    chunkId?: string;
    score?: number;
    [key: string]: unknown;
  };
}

/**
 * Core shard candidate interface used throughout the system
 */
export interface ShardCandidate {
  id: string;
  text: string;
  metadata: ShardMetadata;
  sourceRef: ShardSourceRef;
}

/**
 * Group of staged shards from the same resource
 */
export interface StagedShardGroup {
  key: string;
  sourceRef: ShardSourceRef;
  shards: ShardCandidate[];
  created_at: string;
  campaignRagBasePath: string;
}

/**
 * AI search response structure
 */
export interface AISearchResponse {
  results: Array<{
    id?: string;
    type?: string;
    content?: unknown;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

/**
 * Data structure for creating a new shard
 * Used for database insertion with snake_case field names
 */
export interface CreateShardData {
  id?: string;
  campaign_id: string;
  resource_id: string;
  shard_type: string;
  content: string;
  metadata: string;
  [key: string]: unknown;
}
