// Character Sheet Parser Service
// Extracts structured character data from character sheet text (filetype & game-system agnostic)

import { createLLMProvider } from "@/services/llm/llm-provider-factory";
import { z } from "zod";
import { formatCharacterSheetParsingPrompt } from "@/lib/prompts/character-sheet-prompts";
import { chunkTextByCharacterCount } from "@/lib/text-chunking-utils";

/**
 * Schema for parsed character data
 * Flexible structure that accommodates different game systems
 */
const CharacterDataSchema = z.object({
  // Basic info
  name: z.string().describe("Character name"),
  class: z
    .string()
    .optional()
    .describe("Class, profession, archetype, or similar role"),
  level: z
    .number()
    .optional()
    .describe("Level, rank, tier, or advancement metric"),
  race: z
    .string()
    .optional()
    .describe("Race, species, ancestry, or similar classification"),
  background: z.string().optional().describe("Character background"),
  alignment: z
    .string()
    .optional()
    .describe("Alignment, morality, ethics, or similar descriptor"),

  // Flexible stats/attributes (accommodates any system)
  stats: z
    .record(z.union([z.number(), z.string()]))
    .optional()
    .describe(
      "Character statistics or attributes as key-value pairs (e.g., { 'STR': 16, 'DEX': 14 } or { 'Strength': '3d6', 'Intelligence': 65 })"
    ),
  attributes: z
    .record(z.union([z.number(), z.string()]))
    .optional()
    .describe("Alternative field name for stats/characteristics"),

  // Combat/mechanics (system-agnostic)
  defense: z
    .number()
    .optional()
    .describe("Defense, armor class, armor value, or similar"),
  health: z
    .object({
      current: z.number().optional(),
      max: z.number().optional(),
    })
    .optional()
    .describe("Health, hit points, vitality, or similar life metrics"),
  speed: z
    .number()
    .optional()
    .describe("Speed, movement, or similar mobility metric"),
  initiative: z.number().optional().describe("Initiative or initiative order"),

  // Skills and abilities (flexible)
  skills: z
    .array(
      z.object({
        name: z.string(),
        proficiency: z.boolean().optional(),
        modifier: z.number().optional(),
        value: z.union([z.number(), z.string()]).optional(),
      })
    )
    .optional()
    .describe("Skills, proficiencies, or special abilities"),
  abilities: z
    .array(z.string())
    .optional()
    .describe("Special abilities, talents, or unique character mechanics"),

  // Equipment
  equipment: z
    .array(
      z.object({
        name: z.string(),
        type: z.string().optional(),
        properties: z.string().optional(),
        quantity: z.number().optional(),
      })
    )
    .optional()
    .describe("Weapons, armor, items, inventory, or possessions"),

  // Features and traits
  features: z
    .array(z.string())
    .optional()
    .describe(
      "Class features, racial traits, feats, or any unique character mechanics"
    ),

  // Magic/spells (if present)
  spells: z
    .array(
      z.object({
        name: z.string(),
        level: z.number().optional(),
        prepared: z.boolean().optional(),
        description: z.string().optional(),
      })
    )
    .optional()
    .describe(
      "Spell lists, spell slots, prepared spells, or magical abilities"
    ),

  // Character details
  appearance: z
    .string()
    .optional()
    .describe(
      "Physical description, distinguishing features, visual characteristics"
    ),
  backstory: z
    .string()
    .optional()
    .describe("Character history, origin, motivations, goals"),
  personalityTraits: z
    .string()
    .optional()
    .describe("Traits, ideals, bonds, flaws, quirks, or personality notes"),
  goals: z.string().optional().describe("Character goals or objectives"),
  relationships: z
    .array(z.string())
    .optional()
    .describe(
      "Connections to other characters, NPCs, organizations, or entities"
    ),

  // Game system metadata (optional)
  gameSystem: z
    .string()
    .optional()
    .describe(
      "Detected game system if identifiable (e.g., 'D&D 5e', 'Pathfinder 2e')"
    ),
});

export type CharacterData = z.infer<typeof CharacterDataSchema>;

const MAX_CHUNK_SIZE = 200000; // Characters per chunk for parsing (GPT-4o can handle ~500k, but we use 200k to be safe)

/**
 * Service to extract structured character data from character sheet text.
 * Works on any file type (PDF, DOCX, Markdown, TXT, etc.) as long as text can be extracted.
 * Game-system agnostic - extracts whatever fields are present without assuming a specific system.
 */
export class CharacterSheetParserService {
  constructor(private openaiApiKey: string) {}

  /**
   * Parse character sheet text into structured character data
   * Uses chunking for large sheets to ensure no content is lost
   * @param textContent - Extracted text from character sheet
   * @param characterName - Optional character name to help with parsing
   * @returns Structured character data
   */
  async parseCharacterSheet(
    textContent: string,
    characterName?: string
  ): Promise<CharacterData> {
    if (!textContent || textContent.trim().length === 0) {
      throw new Error("Empty or no content provided for parsing");
    }

    // If content is small enough, parse it directly
    if (textContent.length <= MAX_CHUNK_SIZE) {
      return await this.parseChunk(textContent, characterName);
    }

    // For larger content, split into chunks and parse all chunks
    const chunks = chunkTextByCharacterCount(textContent, MAX_CHUNK_SIZE);
    console.log(
      `[CharacterSheetParser] Parsing ${chunks.length} chunk(s) for character sheet (total length: ${textContent.length} chars)`
    );

    // Parse all chunks
    const parsedChunks: CharacterData[] = [];
    for (let i = 0; i < chunks.length; i++) {
      try {
        const result = await this.parseChunk(chunks[i], characterName);
        parsedChunks.push(result);
        console.log(
          `[CharacterSheetParser] Parsed chunk ${i + 1}/${chunks.length}`
        );
      } catch (error) {
        console.warn(
          `[CharacterSheetParser] Error parsing chunk ${i + 1}/${chunks.length}:`,
          error
        );
        // Continue with other chunks even if one fails
      }
    }

    if (parsedChunks.length === 0) {
      throw new Error("Failed to parse any chunks from character sheet");
    }

    // Merge results from all chunks
    return this.mergeParsedResults(parsedChunks);
  }

  /**
   * Parse a single chunk of character sheet text
   */
  private async parseChunk(
    chunkContent: string,
    characterName?: string
  ): Promise<CharacterData> {
    const prompt = formatCharacterSheetParsingPrompt(
      chunkContent,
      characterName
    );

    const llmProvider = createLLMProvider({
      provider: "openai",
      apiKey: this.openaiApiKey,
      defaultModel: "gpt-4o",
      defaultTemperature: 0.1,
      defaultMaxTokens: 8000, // Allow larger response for comprehensive character data
    });

    const result = await llmProvider.generateStructuredOutput<CharacterData>(
      prompt,
      {
        model: "gpt-4o",
        temperature: 0.1,
        maxTokens: 8000,
      }
    );

    // Validate against schema
    return CharacterDataSchema.parse(result);
  }

  /**
   * Merge parsed results from multiple chunks into a single CharacterData object
   */
  private mergeParsedResults(results: CharacterData[]): CharacterData {
    if (results.length === 0) {
      throw new Error("No results to merge");
    }

    if (results.length === 1) {
      return results[0];
    }

    // Start with the first result as the base
    const merged: CharacterData = { ...results[0] };

    // Merge each subsequent result
    for (let i = 1; i < results.length; i++) {
      const current = results[i];

      // Basic info: prefer non-empty values, first chunk takes precedence for name
      if (!merged.name && current.name) {
        merged.name = current.name;
      }
      if (!merged.class && current.class) {
        merged.class = current.class;
      }
      if (merged.level === undefined && current.level !== undefined) {
        merged.level = current.level;
      }
      if (!merged.race && current.race) {
        merged.race = current.race;
      }
      if (!merged.background && current.background) {
        merged.background = current.background;
      }
      if (!merged.alignment && current.alignment) {
        merged.alignment = current.alignment;
      }

      // Merge stats/attributes objects
      if (current.stats) {
        merged.stats = { ...(merged.stats || {}), ...current.stats };
      }
      if (current.attributes) {
        merged.attributes = {
          ...(merged.attributes || {}),
          ...current.attributes,
        };
      }

      // Combat/mechanics: prefer non-undefined values
      if (merged.defense === undefined && current.defense !== undefined) {
        merged.defense = current.defense;
      }
      if (current.health) {
        merged.health = {
          current: current.health.current ?? merged.health?.current,
          max: current.health.max ?? merged.health?.max,
        };
      }
      if (merged.speed === undefined && current.speed !== undefined) {
        merged.speed = current.speed;
      }
      if (merged.initiative === undefined && current.initiative !== undefined) {
        merged.initiative = current.initiative;
      }

      // Merge arrays (skills, abilities, equipment, features, spells, relationships)
      // Deduplicate by name where applicable
      if (current.skills) {
        const existingNames = new Set(
          (merged.skills || []).map((s) => s.name.toLowerCase())
        );
        merged.skills = [
          ...(merged.skills || []),
          ...current.skills.filter(
            (s) => !existingNames.has(s.name.toLowerCase())
          ),
        ];
      }

      if (current.abilities) {
        const existingAbilities = new Set(
          (merged.abilities || []).map((a) => a.toLowerCase())
        );
        merged.abilities = [
          ...(merged.abilities || []),
          ...current.abilities.filter(
            (a) => !existingAbilities.has(a.toLowerCase())
          ),
        ];
      }

      if (current.equipment) {
        const existingEquipment = new Set(
          (merged.equipment || []).map((e) => e.name.toLowerCase())
        );
        merged.equipment = [
          ...(merged.equipment || []),
          ...current.equipment.filter(
            (e) => !existingEquipment.has(e.name.toLowerCase())
          ),
        ];
      }

      if (current.features) {
        const existingFeatures = new Set(
          (merged.features || []).map((f) => f.toLowerCase())
        );
        merged.features = [
          ...(merged.features || []),
          ...current.features.filter(
            (f) => !existingFeatures.has(f.toLowerCase())
          ),
        ];
      }

      if (current.spells) {
        const existingSpells = new Set(
          (merged.spells || []).map((s) => s.name.toLowerCase())
        );
        merged.spells = [
          ...(merged.spells || []),
          ...current.spells.filter(
            (s) => !existingSpells.has(s.name.toLowerCase())
          ),
        ];
      }

      if (current.relationships) {
        const existingRelationships = new Set(
          (merged.relationships || []).map((r) => r.toLowerCase())
        );
        merged.relationships = [
          ...(merged.relationships || []),
          ...current.relationships.filter(
            (r) => !existingRelationships.has(r.toLowerCase())
          ),
        ];
      }

      // Merge text fields: concatenate with separator, or take longer version
      if (current.appearance) {
        if (merged.appearance) {
          merged.appearance = `${merged.appearance}\n\n${current.appearance}`;
        } else {
          merged.appearance = current.appearance;
        }
      }

      if (current.backstory) {
        if (merged.backstory) {
          merged.backstory = `${merged.backstory}\n\n${current.backstory}`;
        } else {
          merged.backstory = current.backstory;
        }
      }

      if (current.personalityTraits) {
        if (merged.personalityTraits) {
          merged.personalityTraits = `${merged.personalityTraits}\n\n${current.personalityTraits}`;
        } else {
          merged.personalityTraits = current.personalityTraits;
        }
      }

      if (current.goals) {
        if (merged.goals) {
          merged.goals = `${merged.goals}\n\n${current.goals}`;
        } else {
          merged.goals = current.goals;
        }
      }

      // Game system: prefer non-null value
      if (!merged.gameSystem && current.gameSystem) {
        merged.gameSystem = current.gameSystem;
      }
    }

    return merged;
  }
}
