/**
 * Archive metadata record stored in D1
 */
export interface ChangelogArchiveMetadataRecord {
  id: string;
  campaign_id: string;
  rebuild_id: string;
  archive_key: string;
  session_range_min: number | null;
  session_range_max: number | null;
  timestamp_range_from: string;
  timestamp_range_to: string;
  entry_count: number;
  archived_at: string;
}

/**
 * Normalized archive metadata
 */
export interface ChangelogArchiveMetadata {
  id: string;
  campaignId: string;
  rebuildId: string;
  archiveKey: string;
  sessionRange: {
    min: number | null;
    max: number | null;
  };
  timestampRange: {
    from: string;
    to: string;
  };
  entryCount: number;
  archivedAt: string;
}

/**
 * Input for creating archive metadata
 */
export interface CreateChangelogArchiveMetadataInput {
  id: string;
  campaignId: string;
  rebuildId: string;
  archiveKey: string;
  sessionRange: {
    min: number | null;
    max: number | null;
  };
  timestampRange: {
    from: string;
    to: string;
  };
  entryCount: number;
}

/**
 * Query options for archive metadata
 */
export interface ChangelogArchiveQueryOptions {
  campaignSessionId?: number;
  fromTimestamp?: string;
  toTimestamp?: string;
  limit?: number;
  offset?: number;
}

/**
 * R2 archive file format (stored as gzipped JSON)
 */
export interface ChangelogArchiveFile {
  rebuildId: string;
  campaignId: string;
  entries: Array<{
    id: string;
    campaignSessionId: number | null;
    timestamp: string;
    payload: any;
    impactScore: number | null;
    createdAt: string;
  }>;
  sessionRange: {
    min: number | null;
    max: number | null;
  };
  timestampRange: {
    from: string;
    to: string;
  };
}

/**
 * Historical query input
 */
export interface HistoricalQueryInput {
  sessionId?: number;
  timestamp?: string;
  query: string;
}

/**
 * Historical context result
 */
export interface HistoricalContext {
  campaignId: string;
  sessionId: number | null;
  timestamp: string;
  entities: Array<{
    id: string;
    name: string;
    entityType: string;
    content: string;
    historicalState?: any;
  }>;
  relationships: Array<{
    fromEntityId: string;
    toEntityId: string;
    relationshipType: string;
    historicalState?: any;
  }>;
  overlay: {
    entityState: Record<string, any>;
    relationshipState: Record<string, any>;
    newEntities: Record<string, any>;
  };
}
