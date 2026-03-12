import {
	getGenerationModelForProvider,
	MODEL_CONFIG,
	type ToolResult,
} from "@/app-constants";
import { getDAOFactory } from "@/dao/dao-factory";
import {
	buildCharacterGenerationPrompt,
	CHARACTER_RULES_CLARIFICATION_QUESTIONS,
} from "@/lib/prompts/character-generation-prompts";
import {
	createProviderForTier,
	getDefaultProviderApiKey,
} from "@/services/llm/llm-provider-utils";
import { createToolSuccess } from "@/tools/utils";
import { parseGeneratedCharacter } from "./character-generation-utils";
import { fetchCharacterCreationRules } from "./character-rules-fetcher";

/** Tool result data when campaign lacks character rules and invent is not allowed. */
export const NEEDS_CLARIFICATION_MARKER = "needsClarification" as const;

export interface GenerateCharacterParams {
	campaignId: string;
	characterName: string;
	characterClass?: string;
	characterLevel: number;
	characterRace?: string;
	campaignSetting?: string;
	playerPreferences?: string;
	partyComposition?: string[];
	campaignName: string;
	toolCallId: string;
	/** When true, LLM may invent options if campaign has no character rules. */
	allowInventIfNoRules?: boolean;
}

/**
 * Generate character data using the LLM and campaign rules from the entity graph.
 * System-agnostic: uses whatever classes, species, and rules exist in the campaign.
 * If no rules exist and allowInventIfNoRules is false, returns a needsClarification result
 * so the agent can ask the user.
 */
export async function generateCharacterWithAI(
	params: GenerateCharacterParams,
	env: Record<string, unknown>
): Promise<ToolResult> {
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
		allowInventIfNoRules = false,
	} = params;

	const daoFactory = getDAOFactory(env as any);
	const { rules, hasMinimalRules } = await fetchCharacterCreationRules(
		params.campaignId,
		daoFactory
	);

	if (!hasMinimalRules && !allowInventIfNoRules) {
		return createToolSuccess(
			"This campaign does not have character creation rules indexed yet. Ask the user to add rules or grant permission to invent options.",
			{
				[NEEDS_CLARIFICATION_MARKER]: true,
				message:
					"Campaign has no character classes, species, or rules indexed. Add rulebooks or house rules to your campaign, or say 'yes, invent options' to allow the AI to create reasonable options.",
				suggestedQuestions: [...CHARACTER_RULES_CLARIFICATION_QUESTIONS],
			},
			toolCallId
		);
	}

	const apiKey = await getDefaultProviderApiKey(env, false);
	if (!apiKey?.trim()) {
		return createToolSuccess(
			"AI is not configured for character generation. Store character info manually.",
			{
				[NEEDS_CLARIFICATION_MARKER]: true,
				message:
					"API key not configured. Character generation requires an LLM. Use storeCharacterInfo to add character details manually.",
				suggestedQuestions: [
					"Configure an API key for AI generation, or provide character details manually using storeCharacterInfo.",
				],
			},
			toolCallId
		);
	}

	const provider = createProviderForTier({
		apiKey,
		tier: "SESSION_PLANNING",
		temperature: MODEL_CONFIG.PARAMETERS.SESSION_PLANNING_TEMPERATURE,
		maxTokens: MODEL_CONFIG.PARAMETERS.SESSION_PLANNING_MAX_TOKENS,
	});

	const prompt = buildCharacterGenerationPrompt({
		rules,
		params: {
			characterName,
			characterClass,
			characterLevel,
			characterRace,
			campaignSetting,
			playerPreferences,
			partyComposition,
			campaignName,
		},
		allowInvent: !hasMinimalRules && allowInventIfNoRules,
	});

	let raw: unknown;
	try {
		const text = await provider.generateSummary(prompt, {
			model: getGenerationModelForProvider("SESSION_PLANNING"),
			temperature: MODEL_CONFIG.PARAMETERS.SESSION_PLANNING_TEMPERATURE,
			maxTokens: 1200,
		});
		const trimmed = text.trim();
		const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
		const rawJson = (fenced?.[1] ?? trimmed).trim();
		raw = JSON.parse(rawJson);
	} catch (_err) {
		return createToolSuccess(
			"Character generation failed. Try again or add character details manually.",
			{
				[NEEDS_CLARIFICATION_MARKER]: true,
				message: "AI could not generate valid character output.",
				suggestedQuestions: [
					"Try again, or use storeCharacterInfo to add character details manually.",
				],
			},
			toolCallId
		);
	}

	let characterData: ReturnType<typeof parseGeneratedCharacter>;
	try {
		characterData = parseGeneratedCharacter(raw);
	} catch (_err) {
		return createToolSuccess(
			"Character generation produced invalid data. Try again.",
			{
				[NEEDS_CLARIFICATION_MARKER]: true,
				message: "Generated character data was invalid.",
				suggestedQuestions: [
					"Try again or provide character details manually.",
				],
			},
			toolCallId
		);
	}

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
			...characterData,
			metadata,
		},
		toolCallId
	);
}
