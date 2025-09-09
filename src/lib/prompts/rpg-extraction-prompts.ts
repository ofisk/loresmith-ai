/**
 * RPG Content Extraction Prompts
 * Centralized prompts for extracting structured RPG/D&D content from documents
 */

export const RPG_EXTRACTION_PROMPTS = {
  /**
   * Main prompt for extracting structured RPG content from text
   * Used by AutoRAG AI Search to identify game-ready primitives
   */
  STRUCTURED_CONTENT: `You are extracting Dungeon Master prep data from RPG text.

TASK
From the provided text, identify and synthesize ALL relevant game-ready "primitives" and output a SINGLE JSON object that strictly follows the schema in the SPEC below. Return ONLY valid JSON (no comments, no markdown). If a field is unknown, omit it. Prefer concise, prep-usable summaries over flavor text.

CONTEXT & HINTS
- Typical cues:
  - Monsters/Creatures: "Armor Class", "Hit Points", STR/DEX/CON/INT/WIS/CHA line, "Challenge".
  - Spells: "1st-level <school>", casting time, range, components, duration, "At Higher Levels".
  - Magic Items: rarity, type, "requires attunement".
  - Traps/Hazards: Trigger/Effect/DCs/Countermeasures.
  - Scenes/Rooms: numbered keys (e.g., "Area 12"), read-aloud boxed text, GM notes.
  - Hooks/Quests: imperative requests with stakes and links to NPCs/locations.
  - Tables: a dice column (d20/d100), range → result rows.
- Keep "rejected" campaign content out of results if the shard indicates rejection (e.g., metadata flags).
- Normalize names (title case), keep dice notation and DCs.
- Include lightweight relationships in \`relations[]\` to connect items (e.g., a scene that contains a monster).

OUTPUT RULES
- Output one JSON object with the top-level keys exactly as in SPEC.
- Each array can be empty, but must exist.
- Do not invent rules outside the text; summarize faithfully.
- Keep \`summary\` and \`one_line\` short (≤ 240 chars each).
- Output plain JSON without any markdown formatting.

INPUT VARIABLES
- campaignId: {{CAMPAIGN_ID}}
- source: { "doc": "{{RESOURCE_NAME}}", "pages": "", "anchor": "" }

SPEC (fields not listed under a type are optional; always include common fields if known)
COMMON FIELDS (for every primitive):
- id: stable slug (lowercase kebab). If absent, slugify name + short hash.
- type: one of the defined types.
- name (or title for scenes): string.
- one_line: ultra-brief pitch.
- summary: 1–3 sentence DM-usable summary.
- tags: array of short tags.
- source: { doc, pages?, anchor? }
- relations: array of { rel, target_id }.

TYPES & REQUIRED MINIMUM FIELDS
- monsters[]: { id, type:"monster", name, summary, cr?, ac?, hp?, abilities?: {str, dex, con, int, wis, cha}, actions?, traits?, spellcasting?, tags?, source, relations? }
- npcs[]: { id, type:"npc", name, role?, goals?, secrets?, quirks?, relationships?, statblock_ref?, summary, tags?, source, relations? }
- spells[]: { id, type:"spell", name, level, school, casting_time, range, components, duration, classes?, text, tags?, source }
- items[]: { id, type:"item", name, rarity?, item_type?, attunement?, properties?, charges?, curse?, text, tags?, source }
- traps[]: { id, type:"trap", name, trigger, effect, dcs?, detect_disarm?, reset?, tags?, source }
- hazards[]: { id, type:"hazard", name, effect, dcs?, countermeasures?, tags?, source }
- conditions[]: { id, type:"condition", name, effects, cure?, tags?, source }
- vehicles[]: { id, type:"vehicle", name, stats?: {ac?, hp?, speed?, capacity?}, crew?, actions?, traits?, tags?, source }
- env_effects[]: { id, type:"env_effect", name, triggers?, effects, duration?, counters?, tags?, source }
- hooks[]: { id, type:"hook", name, text, leads_to?: string[], stakes?, tags?, source, relations? }
- plot_lines[]: { id, type:"plot_line", title, premise, beats?: string[], dependencies?: string[], resolutions?: string[], tags?, source, relations? }
- quests[]: { id, type:"quest", title, objective, steps?: string[], rewards?, xp_or_milestone?, involved?: string[], prerequisites?: string[], tags?, source, relations? }
- scenes[]: { id, type:"scene", title, scene_type?: "combat"|"social"|"exploration"|"skill", setup, goal?, participants?: string[], map_ref?, tactics?, scaling?, outcomes?, treasure?, next_scenes?: string[], read_aloud?, tags?, source, relations? }
- locations[]: { id, type:"location", name, kind?: "room"|"site"|"region"|"city"|"dungeon_level", overview, keyed_areas?: string[], inhabitants?: string[], features?: string[], hazards?: string[], treasure?, map_refs?, travel?, tags?, source, relations? }
- lairs[]: { id, type:"lair", owner, features?: string[], lair_actions?: string[], regional_effects?: string[], treasure?, tags?, source, relations? }
- factions[]: { id, type:"faction", name, purpose, assets?, notable_npcs?: string[], ranks?, secrets?, relationships?, tags?, source, relations? }
- deities[]: { id, type:"deity", name, domains?, tenets?, boons?, edicts?, anathema?, rites?, favored_items?, symbol?, tags?, source }
- backgrounds[]: { id, type:"background", name, proficiencies?, tools?, languages?, equipment?, feature?, suggested_traits?, tags?, source }
- feats[]: { id, type:"feat", name, prerequisites?, effect, scaling?, tags?, source }
- subclasses[]: { id, type:"subclass", name, parent_class, level_features: { [level:number]: string }, spell_list_adds?, restrictions?, tags?, source }
- rules[]: { id, type:"rule", name, modifies?, text, examples?, safety_notes?, tags?, source }
- downtime[]: { id, type:"downtime", name, requirements?, procedure, checks?, time_cost?, outcomes?, complications?, tags?, source }
- tables[]: { id, type:"table", title, dice, rows: [{range:string, result:string}], usage_notes?, tags?, source }
- encounter_tables[]: { id, type:"encounter_table", environment?, level_band?, dice, rows:[{range:string, result:string}], notes?, tags?, source }
- treasure_tables[]: { id, type:"treasure_table", tier_or_cr?, rows:[{range:string, result:string}], notes?, tags?, source }
- maps[]: { id, type:"map", title, scale?, grid?, keyed?: string[], player_version?: boolean?, file_refs?: string[], tags?, source }
- handouts[]: { id, type:"handout", title, delivery?, text_or_art_ref, when_to_reveal?, redactions?, tags?, source }
- puzzles[]: { id, type:"puzzle", prompt, solution, hints?: string[], failure_stakes?, bypass_methods?, tags?, source }
- timelines[]: { id, type:"timeline", title, phases?: string[], triggers?: string[], consequences?: string[], reset_rules?, tags?, source }
- travel[]: { id, type:"travel", route, distance?, time?, encounters_table_ref?, costs?, checkpoints?, tags?, source }

TOP-LEVEL RETURN SHAPE (all keys required, arrays may be empty)
{
  "meta": { "campaignId": string, "source": { "doc": string, "pages"?: string, "anchor"?: string } },
  "monsters": [], "npcs": [], "spells": [], "items": [],
  "traps": [], "hazards": [], "conditions": [], "vehicles": [], "env_effects": [],
  "hooks": [], "plot_lines": [], "quests": [], "scenes": [],
  "locations": [], "lairs": [], "factions": [], "deities": [],
  "backgrounds": [], "feats": [], "subclasses": [], "rules": [], "downtime": [],
  "tables": [], "encounter_tables": [], "treasure_tables": [],
  "maps": [], "handouts": [], "puzzles": [],
  "timelines": [], "travel": []
}

RETURN ONLY JSON.`,

  /**
   * Helper function to format the prompt with campaign-specific variables
   */
  formatStructuredContentPrompt: (
    campaignId: string,
    resourceName: string
  ): string => {
    return RPG_EXTRACTION_PROMPTS.STRUCTURED_CONTENT.replace(
      "{{CAMPAIGN_ID}}",
      campaignId
    ).replace("{{RESOURCE_NAME}}", resourceName);
  },
};
