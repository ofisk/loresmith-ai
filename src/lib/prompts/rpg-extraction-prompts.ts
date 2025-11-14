/**
 * RPG Content Extraction Prompts
 * Centralized prompts for extracting structured RPG/D&D content from documents
 */

import {
  STRUCTURED_ENTITY_TYPES,
  ENTITY_TYPE_CATEGORIES,
  ENTITY_TYPE_EXTRACTION_HINTS,
  getEntityTypeDisplayName,
  type StructuredEntityType,
} from "@/lib/entity-types";
import { RELATIONSHIP_TYPE_CATEGORIES } from "@/lib/relationship-types";

/**
 * Build the entity type list for the prompt
 */
function buildEntityTypeList(): string {
  return Object.entries(ENTITY_TYPE_CATEGORIES)
    .map(([category, types]) => {
      const typeList = types.join(", ");
      return `- ${category}: ${typeList}`;
    })
    .join("\n");
}

/**
 * Build the relationship type list for the prompt
 */
function buildRelationshipTypeList(): string {
  return Object.entries(RELATIONSHIP_TYPE_CATEGORIES)
    .map(([category, types]) => {
      const typeList = types.join(", ");
      return `- ${category}: ${typeList}`;
    })
    .join("\n");
}

/**
 * Build the extraction hints list for the prompt
 */
function buildExtractionHints(): string {
  const hints = Object.entries(ENTITY_TYPE_EXTRACTION_HINTS)
    .map(([type, hint]) => {
      const displayName = getEntityTypeDisplayName(
        type as StructuredEntityType
      );
      return `- ${displayName}: ${hint}`;
    })
    .join("\n");

  return (
    hints ||
    "- Look for structured content matching the entity type definitions above."
  );
}

/**
 * Build the top-level return shape JSON structure
 */
function buildTopLevelReturnShape(): string {
  const entityTypeKeys = STRUCTURED_ENTITY_TYPES.map(
    (type) => `"${type}": []`
  ).join(",\n  ");
  return `{
  "meta": { "source": { "doc": string, "pages"?: string, "anchor"?: string } },
  ${entityTypeKeys}
}`;
}

export const RPG_EXTRACTION_PROMPTS = {
  /**
   * Main prompt for extracting structured RPG content from text for GraphRAG
   * Used by AutoRAG AI Search to identify game-ready primitives and build a knowledge graph
   */
  STRUCTURED_CONTENT: `You are extracting Dungeon Master prep data from RPG text to build a knowledge graph for GraphRAG (Graph-based Retrieval Augmented Generation).

PURPOSE
Your output will be used to construct a knowledge graph where entities are nodes and relationships are edges. This graph enables:
- Graph traversal queries (e.g., "find all NPCs connected to this location")
- Relationship-based retrieval (e.g., "what items does this NPC own?")
- Multi-hop reasoning across connected entities
- Contextual understanding of entity connections

TASK
From the provided text, identify and synthesize ALL relevant game-ready "primitives" (entities) and their relationships. Output a SINGLE JSON object that strictly follows the schema in the SPEC below. Return ONLY valid JSON (no comments, no markdown). If a field is unknown, omit it. Be comprehensive - extract all potentially useful content for game preparation.

ENTITY EXTRACTION
Extract entities from these categories (use the exact type names):
${buildEntityTypeList()}

Look for these common RPG elements:
${buildExtractionHints()}
- Normalize names (title case), preserve dice notation and DCs.

RELATIONSHIP EXTRACTION (CRITICAL FOR GRAPHRAG)
Extracting relationships is THE MOST IMPORTANT aspect of this task. The knowledge graph's power comes from these connections.

Rules:
1. The \`target_id\` in each relation MUST match the exact \`id\` of another entity extracted in the same response
2. Use ONLY the relationship types listed below (exact matches required)
3. If a relationship doesn't fit exactly, use "related_to" as a fallback
4. Extract relationships aggressively - when in doubt, include the relationship
5. For NPCs especially: extract family relationships (parent_of, married_to), social connections (allied_with, enemy_of, rival_of, mentor_of), and organizational ties (member_of, ruled_by)

Valid relationship types (use these exact strings):
${buildRelationshipTypeList()}

Example: If you extract NPC "elizabeth-durst" and NPC "rose-durst", and the text says "Elizabeth is Rose's mother", add: \`{ "rel": "parent_of", "target_id": "rose-durst" }\` to Elizabeth's relations array. If the text also mentions "Elizabeth and Gustav are married", add: \`{ "rel": "married_to", "target_id": "gustav-durst" }\` to Elizabeth's relations.

OUTPUT RULES
- Output one JSON object with the top-level keys exactly as in SPEC.
- Each predefined array can be empty, but must exist.
- You may discover content that doesn't fit the predefined types - create a new "custom" array for these discoveries.
- Summarize faithfully from the text; do not invent or add information not present.
- Keep \`summary\` and \`one_line\` concise but informative (≤ 240 chars each).
- Output plain JSON without any markdown formatting.
- Be comprehensive and inclusive - extract everything that could be useful for game preparation.
- When in doubt, include the content rather than exclude it.

SPEC (fields not listed under a type are optional; always include common fields if known)
COMMON FIELDS (for every primitive):
- id: stable slug (lowercase kebab). If absent, slugify name + short hash.
- type: one of the defined types.
- name (or title for scenes): string.
- one_line: ultra-brief pitch.
- summary: 1–3 sentence DM-usable summary.
- tags: array of short tags.
- source: { doc, pages?, anchor? }
- relations: array of { rel, target_id } where \`rel\` is one of the valid relationship types listed above (e.g., "parent_of", "married_to", "allied_with", "enemy_of", "located_in", "owns", "member_of", etc.) and \`target_id\` is the exact \`id\` of another entity extracted in the same response. This creates edges in the knowledge graph.
- display_metadata: { display_name?, subtitle?, quick_info?, primary_text? } - UI display hints (see below).

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
- characters[]: { id, type:"character", name, race?, class?, level?, background?, alignment?, stats?: {str, dex, con, int, wis, cha}, summary, tags?, source, relations? }
- character_sheets[]: { id, type:"character_sheet", name, full_stats?: any, summary, tags?, source, relations? }
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

DISPLAY METADATA (recommended for all items)
Provide display_metadata to help the UI intelligently show the content:
{
  "display_name": "The best name/title to show (e.g., 'Fireball' or 'Ancient Red Dragon')",
  "subtitle": ["2-3 key identifying characteristics as strings (e.g., ['Level 3', 'Evocation'] or ['CR 24', 'Gargantuan', 'Dragon'])"],
  "quick_info": ["2-4 property names that are most important at a glance (e.g., ['casting_time', 'range', 'duration'] or ['ac', 'hp', 'speed'])"],
  "primary_text": "Name of the field containing main description (e.g., 'text', 'summary', or 'description')"
}

CUSTOM TYPES DISCOVERY
If you find content that doesn't fit the predefined types above, create a "custom" array with items following this structure:
- custom[]: { id, type: "custom_[descriptive_type]", name, summary, content_type: "brief description of what this is", details?: any, tags?, source, relations?, display_metadata? }
- Don't hesitate to create custom types for unique or unusual content that could be valuable for game preparation.

TOP-LEVEL RETURN SHAPE (all keys required, arrays may be empty)
${buildTopLevelReturnShape()}

RETURN ONLY JSON.`,

  /**
   * Helper function to format the prompt with resource-specific variables
   */
  formatStructuredContentPrompt: (resourceName: string): string => {
    return RPG_EXTRACTION_PROMPTS.STRUCTURED_CONTENT.replace(
      "document",
      resourceName
    );
  },
};
