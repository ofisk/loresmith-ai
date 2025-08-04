import { createToolSuccess } from "../utils";
import { type ToolResult } from "../../constants";

// Helper function to generate character data using AI
export async function generateCharacterWithAI(params: {
  characterName: string;
  characterClass?: string;
  characterLevel: number;
  characterRace?: string;
  campaignSetting?: string;
  playerPreferences?: string;
  partyComposition?: string[];
  campaignName: string;
  toolCallId: string;
}): Promise<ToolResult> {
  const {
    characterName,
    characterClass,
    characterLevel,
    characterRace,
    campaignSetting,
    playerPreferences,
    partyComposition,
    campaignName,
    toolCallId,
  } = params;

  // Generate random class if not provided
  const finalCharacterClass = characterClass || generateRandomClass();

  // Generate random race if not provided
  const finalCharacterRace = characterRace || generateRandomRace();

  // Generate backstory
  const backstory = generateBackstory({
    characterName,
    characterClass: finalCharacterClass,
    characterRace: finalCharacterRace,
    characterLevel,
    campaignSetting,
    playerPreferences,
  });

  // Generate personality traits
  const personalityTraits = generatePersonalityTraits(
    finalCharacterClass,
    finalCharacterRace
  );

  // Generate goals
  const goals = generateGoals({
    characterName,
    characterClass: finalCharacterClass,
    characterRace: finalCharacterRace,
    campaignSetting,
  });

  // Generate relationships
  const relationships = generateRelationships(partyComposition || []);

  // Create metadata
  const metadata = {
    generatedBy: "AI",
    campaignName,
    generationTimestamp: new Date().toISOString(),
    playerPreferences,
    partyComposition,
  };

  return createToolSuccess(
    "Character generated successfully",
    {
      characterName,
      characterClass: finalCharacterClass,
      characterLevel,
      characterRace: finalCharacterRace,
      backstory,
      personalityTraits,
      goals,
      relationships,
      metadata,
    },
    toolCallId
  );
}

// Helper function to generate a random character class
export function generateRandomClass(): string {
  const classes = [
    "Fighter",
    "Wizard",
    "Cleric",
    "Rogue",
    "Ranger",
    "Paladin",
    "Bard",
    "Sorcerer",
    "Warlock",
    "Monk",
    "Druid",
    "Barbarian",
  ];
  return classes[Math.floor(Math.random() * classes.length)];
}

// Helper function to generate a random character race
export function generateRandomRace(): string {
  const races = [
    "Human",
    "Elf",
    "Dwarf",
    "Halfling",
    "Dragonborn",
    "Tiefling",
    "Half-Elf",
    "Half-Orc",
    "Gnome",
    "Aarakocra",
    "Genasi",
    "Goliath",
  ];
  return races[Math.floor(Math.random() * races.length)];
}

// Helper function to generate character backstory
export function generateBackstory(params: {
  characterName: string;
  characterClass: string;
  characterRace: string;
  characterLevel?: number;
  campaignSetting?: string;
  playerPreferences?: string;
}): string {
  const {
    characterName,
    characterClass,
    characterRace,
    characterLevel,
    campaignSetting,
    playerPreferences,
  } = params;

  const setting = campaignSetting || "fantasy world";
  const preferences = playerPreferences || "adventurous";

  return `${characterName} is a ${characterLevel || 1}st level ${characterClass} ${characterRace} from a ${setting}. ${characterName} has always been ${preferences}, seeking adventure and challenges. Their journey began when they discovered their innate abilities and decided to use them for the greater good. Now they travel the world, seeking to make a difference and uncover the mysteries that lie ahead.`;
}

// Helper function to generate personality traits based on class and race
export function generatePersonalityTraits(
  characterClass: string,
  characterRace: string
): string {
  const classTraits: Record<string, string[]> = {
    Fighter: ["Brave", "Disciplined", "Protective", "Honorable"],
    Wizard: ["Intellectual", "Curious", "Studious", "Analytical"],
    Cleric: ["Devout", "Compassionate", "Wise", "Faithful"],
    Rogue: ["Cunning", "Quick-witted", "Stealthy", "Independent"],
    Ranger: ["Nature-loving", "Observant", "Self-reliant", "Protective"],
    Paladin: ["Noble", "Just", "Courageous", "Righteous"],
    Bard: ["Charismatic", "Creative", "Sociable", "Inspiring"],
    Sorcerer: ["Mysterious", "Powerful", "Impulsive", "Charismatic"],
    Warlock: ["Ambitious", "Mysterious", "Determined", "Cunning"],
    Monk: ["Disciplined", "Peaceful", "Focused", "Humble"],
    Druid: ["Nature-connected", "Wise", "Protective", "Mystical"],
    Barbarian: ["Fierce", "Passionate", "Strong-willed", "Protective"],
  };

  const raceTraits: Record<string, string[]> = {
    Human: ["Adaptable", "Ambitious", "Versatile"],
    Elf: ["Graceful", "Long-lived", "Magical"],
    Dwarf: ["Sturdy", "Traditional", "Hard-working"],
    Halfling: ["Cheerful", "Brave", "Lucky"],
    Dragonborn: ["Proud", "Honorable", "Powerful"],
    Tiefling: ["Mysterious", "Resilient", "Charismatic"],
    "Half-Elf": ["Diplomatic", "Adaptable", "Charismatic"],
    "Half-Orc": ["Strong", "Fierce", "Loyal"],
    Gnome: ["Curious", "Inventive", "Energetic"],
    Aarakocra: ["Free-spirited", "Observant", "Graceful"],
    Genasi: ["Elemental", "Mysterious", "Powerful"],
    Goliath: ["Strong", "Honorable", "Competitive"],
  };

  const classTrait =
    classTraits[characterClass]?.[
      Math.floor(Math.random() * classTraits[characterClass]?.length || 1)
    ] || "Adventurous";
  const raceTrait =
    raceTraits[characterRace]?.[
      Math.floor(Math.random() * raceTraits[characterRace]?.length || 1)
    ] || "Unique";

  return `${classTrait}, ${raceTrait}, and always ready for adventure.`;
}

// Helper function to generate character goals
export function generateGoals(params: {
  characterName: string;
  characterClass: string;
  characterRace: string;
  campaignSetting?: string;
}): string {
  const { characterName, characterClass } = params;

  const goals = [
    `Master the art of ${characterClass.toLowerCase()} abilities`,
    `Discover ancient secrets and lost knowledge`,
    `Protect the innocent and fight evil`,
    `Explore the world and uncover its mysteries`,
    `Build a legacy that will be remembered`,
    `Find their true purpose in life`,
  ];

  const randomGoal = goals[Math.floor(Math.random() * goals.length)];
  return `${characterName} seeks to ${randomGoal.toLowerCase()}.`;
}

// Helper function to generate character relationships
export function generateRelationships(partyComposition: string[]): string[] {
  if (!partyComposition || partyComposition.length === 0) {
    return [
      "Has a mentor who taught them their skills",
      "Lost their family in a tragic event",
    ];
  }

  const relationships = partyComposition.map((member, index) => {
    const relationshipTypes = [
      "trusted ally",
      "rival",
      "mentor",
      "student",
      "friend",
      "companion",
    ];
    const type = relationshipTypes[index % relationshipTypes.length];
    return `Has a ${type} relationship with ${member}`;
  });

  return relationships;
}
