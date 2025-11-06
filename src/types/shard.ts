import type { StructuredContentType } from "@/lib/content-types";

/**
 * Unified shard types for the entire system
 * Consolidates all shard interfaces to eliminate duplication
 */

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
 * Standardized shard metadata structure
 */
export interface ShardMetadata {
  fileKey: string;
  fileName: string;
  source: string;
  campaignId: string;
  entityType: StructuredContentType;
  confidence: number;
  originalMetadata?: Record<string, any>;
  query?: string; // Optional query that generated this shard
  sourceRef?: {
    fileKey: string;
    meta: {
      fileName: string;
      campaignId: string;
      entityType: string;
      chunkId: string;
      score: number;
    };
  };
}

/**
 * Source reference for shards
 */
export interface ShardSourceRef {
  fileKey: string;
  meta: {
    fileName: string;
    campaignId: string;
    entityType?: string;
    chunkId?: string;
    score?: number;
  };
}

/**
 * Campaign resource interface for shard generation
 */
export interface CampaignResource {
  id: string;
  resource_id?: string;
  resource_name?: string;
  file_name?: string;
  name?: string;
}

/**
 * AI Search response structure for parsing
 */
export interface AISearchResponse {
  [key: string]: unknown;
  meta?: {
    campaignId: string;
    source: {
      doc: string;
      pages?: string;
      anchor?: string;
    };
  };
}

/**
 * Shard expansion interface for enhanced content
 */
export interface ShardExpansion {
  originalText: string;
  expandedText: string;
  reasoning: string;
  metadata?: Record<string, any>;
}

/**
 * Rejected shard interface for tracking rejections
 */
export interface RejectedShard {
  rejectedAt: string;
  reason: string;
  payload: ShardCandidate;
}

/**
 * Staged shard group interface for UI display
 */
export interface StagedShardGroup {
  key: string;
  sourceRef: ShardSourceRef;
  shards: ShardCandidate[];
  created_at: string;
  campaignRagBasePath: string;
}

/**
 * Shard creation data for database operations
 */
export interface CreateShardData {
  id: string;
  campaign_id: string;
  resource_id: string;
  shard_type: string;
  content: string;
  metadata?: string;
}

/**
 * Shard search result interface
 */
export interface ShardSearchResult {
  id: string;
  text: string;
  score: number;
  metadata?: any;
}
