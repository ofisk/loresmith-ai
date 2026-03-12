import type { CharacterCreationRules } from "@/tools/campaign-context/character-rules-fetcher";

export interface CharacterGenerationParams {
	characterName: string;
	characterClass?: string;
	characterLevel: number;
	characterRace?: string;
	campaignSetting?: string;
	playerPreferences?: string;
	partyComposition?: string[];
	campaignName: string;
}

/**
 * Build an LLM prompt for character generation using campaign rules.
 * System-agnostic: uses whatever classes/species/rules exist in the campaign.
 */
export function buildCharacterGenerationPrompt(params: {
	rules: CharacterCreationRules;
	params: CharacterGenerationParams;
	allowInvent: boolean;
}): string {
	const { rules, params: p, allowInvent } = params;

	const hasRules =
		rules.classes.length > 0 ||
		rules.species.length > 0 ||
		rules.ruleExcerpts.length > 0;

	const rulesSection = hasRules
		? `
## Campaign character rules (use these; do not invent unless instructed)

Available classes/roles: ${rules.classes.length > 0 ? rules.classes.join(", ") : "(none in campaign)"}
Available species/ancestries: ${rules.species.length > 0 ? rules.species.join(", ") : "(none in campaign)"}

${rules.ruleExcerpts ? `Relevant rule excerpts:\n${rules.ruleExcerpts}\n` : ""}
`
		: allowInvent
			? `
## No character rules in campaign

The user has granted permission for you to invent reasonable character options. Use generic terms appropriate to the setting (e.g. fighter, wizard, human, elf for fantasy; or adapt to sci-fi, horror, etc. based on campaign setting).
`
			: "";

	return `You are generating a tabletop RPG character. Return valid JSON only.

Campaign: ${p.campaignName}
Character name: ${p.characterName}
Level: ${p.characterLevel}
${p.characterClass ? `Requested class: ${p.characterClass}` : ""}
${p.characterRace ? `Requested species/race: ${p.characterRace}` : ""}
${p.campaignSetting ? `Setting: ${p.campaignSetting}` : ""}
${p.playerPreferences ? `Player preferences: ${p.playerPreferences}` : ""}
${p.partyComposition?.length ? `Party members (for relationships): ${p.partyComposition.join(", ")}` : ""}
${rulesSection}
Generate a complete character. Use ONLY classes and species from the campaign rules above. If a specific class or species was requested and it exists in the rules, use it. If not requested, choose from the available options. If the rules list is empty and you were instructed to invent, use reasonable generic options for the setting.

Return JSON with this exact shape:
{"characterName":"string","characterClass":"string","characterLevel":number,"characterRace":"string","backstory":"string","personalityTraits":"string","goals":"string","relationships":["string"]}

- backstory: 2-4 sentences fitting the campaign setting
- personalityTraits: brief comma-separated traits
- goals: one sentence on what the character seeks
- relationships: array of relationship descriptions (one per party member if provided, else 1-2 default relationships)`.trim();
}

/** Suggested questions when campaign lacks character rules. */
export const CHARACTER_RULES_CLARIFICATION_QUESTIONS = [
	"What game system or ruleset does this campaign use? (e.g. D&D 5e, Pathfinder, a specific indie game)",
	"Do you have character creation rules in your campaign? You can add them by uploading a rulebook or creating house rules in your campaign context.",
	"Would you like me to invent reasonable character options for this setting? Say 'yes, invent options' to allow that.",
] as const;
