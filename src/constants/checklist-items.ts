/**
 * Checklist item keys that map to the campaign planning checklist.
 * These keys are used to track status and summaries in the campaign_checklist_status table.
 */
export const CHECKLIST_ITEM_KEYS = {
  // Campaign Foundation (Section 1)
  CAMPAIGN_TONE: "campaign_tone",
  CORE_THEMES: "core_themes",
  INTENDED_PLAYER_FANTASY: "intended_player_fantasy",
  INITIAL_SCOPE: "initial_scope",
  CAMPAIGN_PITCH: "campaign_pitch",
  CAMPAIGN_LENGTH_EXPECTATION: "campaign_length_expectation",

  // World & Setting Basics (Section 2)
  WORLD_NAME: "world_name",
  DOMINANT_CULTURAL_TRAIT: "dominant_cultural_trait",
  UNUSUAL_DEFINING_FEATURE: "unusual_defining_feature",
  MAGIC_SYSTEM: "magic_system",
  UNRESOLVED_HISTORICAL_EVENT: "unresolved_historical_event",
  GODS_FAITH_BELIEF: "gods_faith_belief",
  MYSTERY_NOT_EXPLAINED: "mystery_not_explained",

  // Starting Location (Section 3)
  STARTING_LOCATION: "starting_location",
  STARTING_LOCATION_WHY_PEOPLE_LIVE: "starting_location_why_people_live",
  STARTING_LOCATION_VISIBLE_PROBLEM: "starting_location_visible_problem",
  STARTING_LOCATION_NPCS: "starting_location_npcs",
  STARTING_LOCATION_ADVENTURE_LOCATIONS:
    "starting_location_adventure_locations",
  STARTING_LOCATION_HIDDEN_SECRET: "starting_location_hidden_secret",
  STARTING_LOCATION_CHANGE_OVER_TIME: "starting_location_change_over_time",

  // Factions, Powers & Threats (Section 4)
  FACTIONS: "factions",
  FACTION_GOALS: "faction_goals",
  FACTION_OPERATIONS: "faction_operations",
  WHAT_HAPPENS_IF_PCS_DO_NOTHING: "what_happens_if_pcs_do_nothing",
  EMERGING_THREAT: "emerging_threat",
  FACTION_OPINIONS_OF_PCS: "faction_opinions_of_pcs",

  // Player Integration & Session Zero (Section 5)
  CHARACTER_BACKSTORIES: "character_backstories",
  PC_TIES_TO_NPC_PROBLEM_RUMOR: "pc_ties_to_npc_problem_rumor",
  PARTY_RELATIONSHIPS: "party_relationships",
  PLAYER_EXPECTATIONS: "player_expectations",
  TABLE_RULES_SAFETY_TOOLS: "table_rules_safety_tools",
  PLAY_FORMAT: "play_format",

  // First Story Arc (Section 6)
  INITIAL_UNSTABLE_SITUATION: "initial_unstable_situation",
  MULTIPLE_APPROACHES_TO_RESOLUTION: "multiple_approaches_to_resolution",
  KEY_ENCOUNTERS: "key_encounters",
  CLUES_TO_LARGER_STORY: "clues_to_larger_story",
  CONSEQUENCES_SUCCESS_FAILURE: "consequences_success_failure",
  WORLD_REACTION_AFTER_ARC: "world_reaction_after_arc",
} as const;

/**
 * All checklist item keys as an array for iteration
 */
export const ALL_CHECKLIST_ITEM_KEYS = Object.values(CHECKLIST_ITEM_KEYS);

/**
 * Checklist item key to human-readable name mapping
 */
export const CHECKLIST_ITEM_NAMES: Record<string, string> = {
  [CHECKLIST_ITEM_KEYS.CAMPAIGN_TONE]: "Campaign Tone",
  [CHECKLIST_ITEM_KEYS.CORE_THEMES]: "Core Themes",
  [CHECKLIST_ITEM_KEYS.INTENDED_PLAYER_FANTASY]: "Intended Player Fantasy",
  [CHECKLIST_ITEM_KEYS.INITIAL_SCOPE]: "Initial Scope",
  [CHECKLIST_ITEM_KEYS.CAMPAIGN_PITCH]: "Campaign Elevator Pitch",
  [CHECKLIST_ITEM_KEYS.CAMPAIGN_LENGTH_EXPECTATION]:
    "Campaign Length Expectation",
  [CHECKLIST_ITEM_KEYS.WORLD_NAME]: "World Name",
  [CHECKLIST_ITEM_KEYS.DOMINANT_CULTURAL_TRAIT]: "Dominant Cultural Trait",
  [CHECKLIST_ITEM_KEYS.UNUSUAL_DEFINING_FEATURE]: "Unusual Defining Feature",
  [CHECKLIST_ITEM_KEYS.MAGIC_SYSTEM]: "Magic System",
  [CHECKLIST_ITEM_KEYS.UNRESOLVED_HISTORICAL_EVENT]:
    "Unresolved Historical Event",
  [CHECKLIST_ITEM_KEYS.GODS_FAITH_BELIEF]: "Gods, Faith, or Belief",
  [CHECKLIST_ITEM_KEYS.MYSTERY_NOT_EXPLAINED]: "Mystery Not Explained",
  [CHECKLIST_ITEM_KEYS.STARTING_LOCATION]: "Starting Location",
  [CHECKLIST_ITEM_KEYS.STARTING_LOCATION_WHY_PEOPLE_LIVE]:
    "Starting Location - Why People Live Here",
  [CHECKLIST_ITEM_KEYS.STARTING_LOCATION_VISIBLE_PROBLEM]:
    "Starting Location - Visible Problem",
  [CHECKLIST_ITEM_KEYS.STARTING_LOCATION_NPCS]: "Starting Location - NPCs",
  [CHECKLIST_ITEM_KEYS.STARTING_LOCATION_ADVENTURE_LOCATIONS]:
    "Starting Location - Adventure Locations",
  [CHECKLIST_ITEM_KEYS.STARTING_LOCATION_HIDDEN_SECRET]:
    "Starting Location - Hidden Secret",
  [CHECKLIST_ITEM_KEYS.STARTING_LOCATION_CHANGE_OVER_TIME]:
    "Starting Location - Change Over Time",
  [CHECKLIST_ITEM_KEYS.FACTIONS]: "Factions",
  [CHECKLIST_ITEM_KEYS.FACTION_GOALS]: "Faction Goals",
  [CHECKLIST_ITEM_KEYS.FACTION_OPERATIONS]: "Faction Operations",
  [CHECKLIST_ITEM_KEYS.WHAT_HAPPENS_IF_PCS_DO_NOTHING]:
    "What Happens If PCs Do Nothing",
  [CHECKLIST_ITEM_KEYS.EMERGING_THREAT]: "Emerging Threat",
  [CHECKLIST_ITEM_KEYS.FACTION_OPINIONS_OF_PCS]: "Faction Opinions of PCs",
  [CHECKLIST_ITEM_KEYS.CHARACTER_BACKSTORIES]: "Character Backstories",
  [CHECKLIST_ITEM_KEYS.PC_TIES_TO_NPC_PROBLEM_RUMOR]:
    "PC Ties to NPC/Problem/Rumor",
  [CHECKLIST_ITEM_KEYS.PARTY_RELATIONSHIPS]: "Party Relationships",
  [CHECKLIST_ITEM_KEYS.PLAYER_EXPECTATIONS]: "Player Expectations",
  [CHECKLIST_ITEM_KEYS.TABLE_RULES_SAFETY_TOOLS]: "Table Rules & Safety Tools",
  [CHECKLIST_ITEM_KEYS.PLAY_FORMAT]: "Play Format",
  [CHECKLIST_ITEM_KEYS.INITIAL_UNSTABLE_SITUATION]:
    "Initial Unstable Situation",
  [CHECKLIST_ITEM_KEYS.MULTIPLE_APPROACHES_TO_RESOLUTION]:
    "Multiple Approaches to Resolution",
  [CHECKLIST_ITEM_KEYS.KEY_ENCOUNTERS]: "Key Encounters",
  [CHECKLIST_ITEM_KEYS.CLUES_TO_LARGER_STORY]: "Clues to Larger Story",
  [CHECKLIST_ITEM_KEYS.CONSEQUENCES_SUCCESS_FAILURE]:
    "Consequences for Success/Failure",
  [CHECKLIST_ITEM_KEYS.WORLD_REACTION_AFTER_ARC]: "World Reaction After Arc",
};
