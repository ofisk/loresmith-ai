export interface WorldStateEntityUpdate {
  entity_id: string;
  status?: string;
  [key: string]: unknown;
}

export interface WorldStateRelationshipUpdate {
  from: string;
  to: string;
  new_status?: string;
  [key: string]: unknown;
}

export interface WorldStateNewEntity {
  entity_id: string;
  type?: string;
  name?: string;
  [key: string]: unknown;
}

/**
 * JSON payload stored in world_state_changelog.changelog_data.
 */
export interface WorldStateChangelogPayload {
  campaign_session_id: number | null;
  timestamp: string;
  entity_updates: WorldStateEntityUpdate[];
  relationship_updates: WorldStateRelationshipUpdate[];
  new_entities: WorldStateNewEntity[];
}

/**
 * Raw row shape returned directly from D1 queries against world_state_changelog.
 */
export interface WorldStateChangelogRecord {
  id: string;
  campaign_id: string;
  campaign_session_id: number | null;
  timestamp: string;
  changelog_data: string;
  impact_score: number | null;
  applied_to_graph: number | boolean;
  created_at: string;
}

/**
 * Normalized world state changelog entry exposed to the rest of the application.
 */
export interface WorldStateChangelogEntry {
  id: string;
  campaignId: string;
  campaignSessionId: number | null;
  timestamp: string;
  payload: WorldStateChangelogPayload;
  impactScore: number | null;
  appliedToGraph: boolean;
  createdAt: string;
}
