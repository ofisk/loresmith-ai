import {
	getGenerationModelForProvider,
	type TextGenerationTier,
} from "@/app-constants";
import { getEnvVar } from "@/lib/env-utils";
import { createLLMProvider } from "./llm-provider-factory";

export function getDefaultProviderEnvVar(): "ANTHROPIC_API_KEY" {
	return "ANTHROPIC_API_KEY";
}

export async function getDefaultProviderApiKey(
	env: Record<string, unknown>,
	required: boolean = false
): Promise<string> {
	const providerEnvVar = getDefaultProviderEnvVar();
	const providerApiKeyRaw = await getEnvVar(env, providerEnvVar, required);
	return providerApiKeyRaw.trim();
}

export function createProviderForTier(params: {
	apiKey: string;
	tier: TextGenerationTier;
	temperature: number;
	maxTokens: number;
}) {
	const { apiKey, tier, temperature, maxTokens } = params;
	// The tier is forwarded, not just consumed to pick a model: it selects the
	// Anthropic effort level and tags spend with `modelRole`, which is what makes
	// a per-tier effort comparison groupable in the drain.
	return createLLMProvider({
		apiKey,
		defaultModel: getGenerationModelForProvider(tier),
		defaultTemperature: temperature,
		defaultMaxTokens: maxTokens,
		defaultTier: tier,
	});
}
