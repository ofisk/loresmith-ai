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
	return createLLMProvider({
		apiKey,
		defaultModel: getGenerationModelForProvider(tier),
		defaultTemperature: temperature,
		defaultMaxTokens: maxTokens,
	});
}
