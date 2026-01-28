/**
 * Character Sheet Detection and Parsing Prompts
 * Prompts for detecting and parsing character sheets from various file types
 */

/**
 * Generate prompt for detecting if text content is a character sheet
 */
export function formatCharacterSheetDetectionPrompt(
  textContent: string
): string {
  return `Analyze the following text content and determine if it is a character sheet from a tabletop role-playing game.

The content may be from any file type (PDF, DOCX, Markdown, TXT, etc.) and any game system (D&D, Pathfinder, Call of Cthulhu, etc.).

Look for these indicators that suggest it's a character sheet:
- Character name prominently displayed
- Character statistics or attributes (any stat system - do NOT hardcode to specific stat names like STR, DEX, etc.)
- Character class, profession, archetype, or similar role
- Level, experience points, rank, or advancement metrics
- Health, hit points, vitality, or similar life/health metrics
- Equipment, inventory, possessions, or items lists
- Skills, abilities, special talents, or proficiencies
- Character background, history, origin, or backstory sections
- Appearance or physical description
- Combat-related stats (armor class, defense, initiative, etc.)

IMPORTANT:
- Be game-system agnostic - look for generic patterns, not specific stat names
- Be filetype agnostic - work with the extracted text regardless of source format
- A character sheet typically has multiple of these indicators present
- Campaign notes, session summaries, or world-building documents are NOT character sheets

Text content to analyze:
${textContent}

Please respond with a JSON object containing:
- isCharacterSheet: boolean (true if this appears to be a character sheet)
- confidence: number (0.0 to 1.0, how confident you are)
- characterName: string | null (the character's name if detected, otherwise null)
- detectedGameSystem: string | null (the game system if identifiable, e.g., "D&D 5e", "Pathfinder 2e", otherwise null)
- reasoning: string (brief explanation of your decision)

Respond with valid JSON only.`;
}

/**
 * Generate prompt for parsing character sheet text into structured data
 */
export function formatCharacterSheetParsingPrompt(
  textContent: string,
  characterName?: string
): string {
  const characterNameHint = characterName
    ? `\nThe character's name is: ${characterName}\n`
    : "";

  return `Extract structured character data from the following character sheet text.

The content may be from any file type (PDF, DOCX, Markdown, TXT, etc.) and any game system (D&D, Pathfinder, Call of Cthulhu, etc.).

${characterNameHint}
Extract comprehensive character information in a flexible, game-system agnostic way:

BASIC INFO:
- name: Character name
- class: Class, profession, archetype, or similar role
- level: Level, rank, tier, or advancement metric
- race: Race, species, ancestry, or similar classification
- background: Character background
- alignment: Alignment, morality, ethics, or similar descriptor

ATTRIBUTES/STATS:
- Extract whatever stat system is present (ability scores, characteristics, attributes, etc.)
- Store as flexible key-value pairs in the "stats" or "attributes" field
- Do NOT hardcode to specific stat names - extract whatever is present
- Values can be numbers or strings (e.g., "3d6", "65", etc.)

COMBAT/MECHANICS:
- defense: Defense, armor class, armor value, or similar
- health: Health, hit points, vitality (with current/max if available)
- speed: Speed, movement, or similar mobility metric
- initiative: Initiative or initiative order

SKILLS/ABILITIES:
- skills: Any skills, proficiencies, or special abilities with modifiers/values
- abilities: Special abilities, talents, or unique character mechanics

EQUIPMENT:
- equipment: Weapons, armor, items, inventory, possessions with details

FEATURES/TRAITS:
- features: Class features, racial traits, feats, or any unique character mechanics

MAGIC/SPELLS (if present):
- spells: Spell lists, spell slots, prepared spells, or magical/paranormal abilities

CHARACTER DETAILS:
- appearance: Physical description, distinguishing features, visual characteristics
- backstory: Character history, origin, motivations, goals
- personalityTraits: Traits, ideals, bonds, flaws, quirks, or personality notes
- goals: Character goals or objectives
- relationships: Connections to other characters, NPCs, organizations, or entities

GAME SYSTEM:
- gameSystem: Detected game system if identifiable (e.g., "D&D 5e", "Pathfinder 2e")

IMPORTANT:
- Extract whatever fields are present without assuming a specific system
- Store stats/attributes as flexible objects that can accommodate any system
- If a field is not present or not applicable, omit it (don't include null/empty values)
- Be thorough but accurate - only extract information that is clearly present

Character sheet text:
${textContent}

Please respond with a JSON object containing the extracted character data. Respond with valid JSON only.`;
}

export const CHARACTER_SHEET_PROMPTS = {
  formatCharacterSheetDetectionPrompt,
  formatCharacterSheetParsingPrompt,
};
