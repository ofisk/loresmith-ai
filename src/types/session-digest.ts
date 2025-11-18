/**
 * Session digest data structure matching the JSON schema from issue #216
 */
export interface SessionDigestData {
  last_session_recap: {
    key_events: string[];
    state_changes: SessionDigestStateChanges;
    open_threads: string[];
  };
  next_session_plan: {
    objectives_dm: string[];
    probable_player_goals: string[];
    beats: string[];
    if_then_branches: string[];
  };
  npcs_to_run: string[];
  locations_in_focus: string[];
  encounter_seeds: string[];
  clues_and_revelations: string[];
  treasure_and_rewards: string[];
  todo_checklist: string[];
}

/**
 * State changes structure within session digest
 */
export interface SessionDigestStateChanges {
  factions: string[];
  locations: string[];
  npcs: string[];
}

/**
 * Database record structure for session_digests table
 */
export interface SessionDigest {
  id: string;
  campaign_id: string;
  session_number: number;
  session_date: string | null;
  digest_data: string; // JSON string
  created_at: string;
  updated_at: string;
}

/**
 * Mapped session digest with parsed digest_data
 */
export interface SessionDigestWithData {
  id: string;
  campaignId: string;
  sessionNumber: number;
  sessionDate: string | null;
  digestData: SessionDigestData;
  createdAt: string;
  updatedAt: string;
}

/**
 * Input for creating a new session digest
 */
export interface CreateSessionDigestInput {
  campaignId: string;
  sessionNumber: number;
  sessionDate?: string | null;
  digestData: SessionDigestData;
}

/**
 * Input for updating a session digest
 */
export interface UpdateSessionDigestInput {
  sessionDate?: string | null;
  digestData?: SessionDigestData;
}

/**
 * Validate that an object matches the SessionDigestData structure
 */
export function validateSessionDigestData(
  data: unknown
): data is SessionDigestData {
  if (!data || typeof data !== "object") {
    return false;
  }

  const obj = data as Record<string, unknown>;

  // Check last_session_recap
  if (!obj.last_session_recap || typeof obj.last_session_recap !== "object") {
    return false;
  }
  const recap = obj.last_session_recap as Record<string, unknown>;
  if (
    !Array.isArray(recap.key_events) ||
    !Array.isArray(recap.open_threads) ||
    !recap.state_changes ||
    typeof recap.state_changes !== "object"
  ) {
    return false;
  }
  const stateChanges = recap.state_changes as Record<string, unknown>;
  if (
    !Array.isArray(stateChanges.factions) ||
    !Array.isArray(stateChanges.locations) ||
    !Array.isArray(stateChanges.npcs)
  ) {
    return false;
  }

  // Check next_session_plan
  if (!obj.next_session_plan || typeof obj.next_session_plan !== "object") {
    return false;
  }
  const plan = obj.next_session_plan as Record<string, unknown>;
  if (
    !Array.isArray(plan.objectives_dm) ||
    !Array.isArray(plan.probable_player_goals) ||
    !Array.isArray(plan.beats) ||
    !Array.isArray(plan.if_then_branches)
  ) {
    return false;
  }

  // Check remaining arrays
  const requiredArrays = [
    "npcs_to_run",
    "locations_in_focus",
    "encounter_seeds",
    "clues_and_revelations",
    "treasure_and_rewards",
    "todo_checklist",
  ];
  for (const key of requiredArrays) {
    if (!Array.isArray(obj[key])) {
      return false;
    }
  }

  return true;
}
