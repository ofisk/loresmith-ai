import type { StructuredContentType } from "../lib/content-types";

/**
 * Unified snippet types for the entire system
 * Consolidates all snippet interfaces to eliminate duplication
 */

/**
 * Core snippet candidate interface used throughout the system
 */
export interface SnippetCandidate {
  id: string;
  text: string;
  metadata: SnippetMetadata;
  sourceRef: SnippetSourceRef;
}

/**
 * Standardized snippet metadata structure
 */
export interface SnippetMetadata {
  fileKey: string;
  fileName: string;
  source: string;
  campaignId: string;
  entityType: StructuredContentType;
  confidence: number;
  originalMetadata?: Record<string, any>;
  query?: string; // Optional query that generated this snippet
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
 * Source reference for snippets
 */
export interface SnippetSourceRef {
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
 * Campaign resource interface for snippet generation
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
  [key: string]: any;
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
 * Snippet expansion interface for enhanced content
 */
export interface SnippetExpansion {
  originalText: string;
  expandedText: string;
  reasoning: string;
  metadata?: Record<string, any>;
}

/**
 * Rejected snippet interface for tracking rejections
 */
export interface RejectedSnippet {
  rejectedAt: string;
  reason: string;
  payload: SnippetCandidate;
}

/**
 * Database snippet interface for D1 storage
 */
export interface DatabaseSnippet {
  id: string;
  campaign_id: string;
  resource_id: string;
  snippet_type: string;
  content: string;
  metadata?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

/**
 * Staged snippet group interface for UI display
 */
export interface StagedSnippetGroup {
  key: string;
  sourceRef: SnippetSourceRef;
  snippets: SnippetCandidate[];
  created_at: string;
  campaignRagBasePath: string;
}

/**
 * Snippet creation data for database operations
 */
export interface CreateSnippetData {
  id: string;
  campaign_id: string;
  resource_id: string;
  snippet_type: string;
  content: string;
  metadata?: string;
}

/**
 * Snippet search result interface
 */
export interface SnippetSearchResult {
  id: string;
  text: string;
  score: number;
  metadata?: any;
}
