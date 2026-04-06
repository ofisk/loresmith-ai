/**
 * LLM-generated short titles for visual_inspiration shards (tone/mood from image description).
 */

import { z } from "zod";
import { getGenerationModelForProvider, MODEL_CONFIG } from "@/app-constants";
import type { LLMOptions } from "@/services/llm/llm-provider";
import { createLLMProvider } from "@/services/llm/llm-provider-factory";

const titleResponseSchema = z.object({
	title: z.string().min(1).max(200),
});

const TITLE_JSON_SCHEMA = JSON.stringify({
	type: "object",
	properties: {
		title: {
			type: "string",
			description:
				"Short evocative name for this visual inspiration (sentence case, 3–10 words)",
		},
	},
	required: ["title"],
});

/**
 * Strip library vision boilerplate and cap length for the title model.
 */
export function extractVisualDescriptionForTitle(fullText: string): string {
	let s = fullText.trim();
	if (s.startsWith("Visual inspiration reference")) {
		const doubleNl = s.indexOf("\n\n");
		if (doubleNl !== -1) {
			s = s.slice(doubleNl + 2).trim();
		}
	}
	if (s.length > 8000) {
		s = s.slice(0, 8000);
	}
	return s.trim();
}

/**
 * Produce a concise shard name from the full vision description text.
 * Caller should fall back to a filename-based label if this throws or key is missing.
 */
export async function generateVisualInspirationTitle(params: {
	descriptionText: string;
	apiKey: string;
	onUsage?: LLMOptions["onUsage"];
}): Promise<string> {
	const { descriptionText, apiKey, onUsage } = params;
	const body = extractVisualDescriptionForTitle(descriptionText);
	if (!body) {
		throw new Error("Empty visual inspiration description");
	}

	const llm = createLLMProvider({
		provider: MODEL_CONFIG.PROVIDER.DEFAULT,
		apiKey,
		defaultModel: getGenerationModelForProvider("ANALYSIS"),
		defaultTemperature: 0.35,
		defaultMaxTokens: 120,
	});

	const prompt = `You name visual inspiration entries for tabletop RPG campaigns.

Read the description below (from an image analysis). Respond with JSON only matching the schema: {"title":"..."}.

Rules for title:
- Sentence case: capitalize the first word only, plus proper nouns (e.g. D&D, Ravenloft).
- Use 3 to 10 words that capture mood, setting, and atmosphere. Do not use generic labels like "Image", "Visual reference", or "Picture".
- No quotation marks inside the title. No trailing period.
- Maximum 80 characters.

DESCRIPTION:
${body}`;

	const raw = await llm.generateStructuredOutput<unknown>(prompt, {
		model: getGenerationModelForProvider("ANALYSIS"),
		temperature: 0.35,
		maxTokens: 150,
		schema: TITLE_JSON_SCHEMA,
		onUsage,
	});

	const parsed = titleResponseSchema.safeParse(raw);
	if (!parsed.success) {
		throw new Error("Invalid title model response");
	}

	let title = parsed.data.title.trim();
	title = title.replace(/^["'\s]+|["'\s]+$/g, "");
	if (title.length > 120) {
		title = `${title.slice(0, 117)}...`;
	}
	return title;
}
