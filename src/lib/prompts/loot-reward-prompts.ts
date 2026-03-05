import type { Entity } from "@/dao/entity-dao";

function getEntityText(entity: Entity): string {
	const content = entity.content;
	if (!content || typeof content !== "object" || Array.isArray(content)) {
		return "";
	}
	try {
		return JSON.stringify(content);
	} catch {
		return "";
	}
}

export function summarizeEntities(entities: Entity[], max = 16): string {
	return entities
		.slice(0, max)
		.map((entity) => {
			const content = getEntityText(entity).slice(0, 260);
			return `- ${entity.name} [${entity.entityType}] ${content}`;
		})
		.join("\n");
}

export function formatGenerateLootPrompt(params: {
	campaignName: string;
	campaignDescription: string;
	campaignMetadata: string;
	campaignTone: string;
	partyLevel: string;
	encounterChallenge: string;
	userPrompt: string;
	recentEntitiesSummary: string;
	previousLootSummary: string;
}): string {
	return `
You are generating tabletop RPG loot for a campaign.
Return valid JSON only.

Campaign name: ${params.campaignName}
Campaign description: ${params.campaignDescription}
Campaign metadata: ${params.campaignMetadata}
Requested campaign tone: ${params.campaignTone}
Party level: ${params.partyLevel}
Encounter challenge: ${params.encounterChallenge}

User request:
${params.userPrompt}

Recent campaign entities:
${params.recentEntitiesSummary}

Previously distributed item entities:
${params.previousLootSummary}

Generate loot that is narratively coherent, not repetitive with previous rewards, and suitable for the likely party power level.

Return JSON with this exact shape (use these keys). Currency keys are game-specific (e.g. gp/gold for fantasy, credits for sci-fi):
{"summary":"string","currency":{"unitName":0},"valuables":["string"],"items":[{"name":"string","itemType":"string","rarity":"string","description":"string","mechanicalNotes":"string","storyHook":"string","estimatedValue":0,"valueUnit":"string"}],"distributionNotes":["string"]}
`.trim();
}

export function formatGenerateLootFallbackPrompt(params: {
	campaignName: string;
	campaignTone: string;
	partyLevel: string;
	encounterChallenge: string;
	userPrompt: string;
}): string {
	return `
Return valid JSON only.
Create a level-appropriate tabletop RPG loot cache using this request.

Campaign: ${params.campaignName}
Tone: ${params.campaignTone}
Party level: ${params.partyLevel}
Encounter challenge: ${params.encounterChallenge}
Request: ${params.userPrompt}

Include currency, valuables, 3-6 items, and short distribution notes.
Avoid repeating exact prior loot; keep rewards setting-appropriate.

JSON shape: {"summary":"string","currency":{"unitName":0},"valuables":["..."],"items":[{"name":"...","itemType":"...","rarity":"...","description":"...","mechanicalNotes":"...","storyHook":"...","estimatedValue":0,"valueUnit":"..."}],"distributionNotes":["..."]}
`.trim();
}

export function formatSuggestMagicItemPrompt(params: {
	campaignName: string;
	campaignDescription: string;
	campaignMetadata: string;
	campaignTone: string;
	partyLevel: string;
	request: string;
	targetCharacterSummary: string;
	relevantEntitiesSummary: string;
}): string {
	return `
You are suggesting a meaningful tabletop RPG magic item reward.
Return valid JSON only.

Campaign name: ${params.campaignName}
Campaign description: ${params.campaignDescription}
Campaign metadata: ${params.campaignMetadata}
Campaign tone: ${params.campaignTone}
Party level: ${params.partyLevel}

Request:
${params.request}

Target character (if any):
${params.targetCharacterSummary}

Relevant campaign entities:
${params.relevantEntitiesSummary}

Return one primary recommendation and 2-3 alternatives.
Prioritize narrative tie-ins to known NPCs, locations, factions, or plot threads.
`.trim();
}

export function formatSuggestMagicItemFallbackPrompt(params: {
	campaignName: string;
	partyLevel: string;
	campaignTone: string;
	request: string;
	characterContext: string;
}): string {
	return `
Return valid JSON only.
Suggest one primary magic item and 2-3 alternatives for this campaign context.

Campaign: ${params.campaignName}
Party level: ${params.partyLevel}
Tone: ${params.campaignTone}
Request: ${params.request}
Character context: ${params.characterContext}
`.trim();
}

export const LOOT_REWARD_PROMPTS = {
	summarizeEntities,
	formatGenerateLootPrompt,
	formatGenerateLootFallbackPrompt,
	formatSuggestMagicItemPrompt,
	formatSuggestMagicItemFallbackPrompt,
};
