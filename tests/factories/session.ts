import type {
	SessionDigest,
	SessionDigestData,
	SessionDigestSourceType,
	SessionDigestStatus,
} from "../../src/types/session-digest";

const ISO_NOW = "2024-01-01T00:00:00.000Z";

const DEFAULT_DIGEST_DATA: SessionDigestData = {
	last_session_recap: {
		key_events: [],
		state_changes: { factions: [], locations: [], npcs: [] },
		open_threads: [],
	},
	next_session_plan: {
		objectives_dm: [],
		probable_player_goals: [],
		beats: [],
		if_then_branches: [],
	},
	npcs_to_run: [],
	locations_in_focus: [],
	encounter_seeds: [],
	clues_and_revelations: [],
	treasure_and_rewards: [],
	todo_checklist: [],
};

/**
 * Create a type-checked session digest for testing with sensible defaults.
 * @param overrides - Partial overrides merged onto defaults
 */
export function makeSessionDigest(
	overrides: Partial<SessionDigest> = {}
): SessionDigest {
	const { digest_data: digestOverride, ...rest } = overrides;
	const digest_data =
		digestOverride !== undefined
			? typeof digestOverride === "string"
				? digestOverride
				: JSON.stringify(digestOverride)
			: JSON.stringify(DEFAULT_DIGEST_DATA);

	return {
		id: "session-test-id",
		campaign_id: "campaign-test-id",
		session_number: 1,
		session_date: null,
		status: "draft" as SessionDigestStatus,
		quality_score: null,
		review_notes: null,
		generated_by_ai: false,
		template_id: null,
		source_type: "manual" as SessionDigestSourceType,
		created_at: ISO_NOW,
		updated_at: ISO_NOW,
		...rest,
		digest_data,
	};
}

/**
 * Create a type-checked session digest data structure for testing.
 * @param overrides - Partial overrides merged onto defaults
 */
export function makeSessionDigestData(
	overrides: Partial<SessionDigestData> = {}
): SessionDigestData {
	return {
		...DEFAULT_DIGEST_DATA,
		...overrides,
	};
}
