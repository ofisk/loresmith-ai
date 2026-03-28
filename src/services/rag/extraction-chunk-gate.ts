import { z } from "zod";
import { getGenerationModelForProvider, MODEL_CONFIG } from "@/app-constants";
import type { EnvWithSecrets } from "@/lib/env-utils";
import { getEnvVar } from "@/lib/env-utils";
import { parseOrThrow } from "@/lib/zod-utils";
import { createLLMProvider } from "@/services/llm/llm-provider-factory";

/**
 * When true, each non-empty chunk runs a cheap model (PIPELINE_LIGHT) that only
 * decides skip vs run full extraction. Default off: set env EXTRACTION_CHUNK_GATE_ENABLED=true.
 *
 * Skip only clearly non-substantive text (TOC-only, boilerplate, whitespace). When in doubt
 * the gate must answer runFullExtraction=true to avoid missing entities.
 */
export async function isExtractionChunkGateEnabled(
	env: EnvWithSecrets
): Promise<boolean> {
	const raw = await getEnvVar(env, "EXTRACTION_CHUNK_GATE_ENABLED", false);
	const v = raw.trim().toLowerCase();
	return v === "1" || v === "true" || v === "yes";
}

const CHUNK_GATE_JSON_SCHEMA = JSON.stringify({
	type: "object",
	properties: {
		runFullExtraction: {
			type: "boolean",
			description:
				"True unless the chunk is clearly non-substantive (blank, TOC-only, navigation-only, pure boilerplate). If unsure, true.",
		},
	},
	required: ["runFullExtraction"],
	additionalProperties: false,
});

const ChunkGateResultSchema = z.object({
	runFullExtraction: z.boolean(),
});

/** Max characters sent to the gate model (preview only; full chunk still extracted if gate passes). */
const MAX_GATE_PREVIEW_CHARS = 8000;

const GATE_INSTRUCTIONS = `You route text chunks for RPG/campaign knowledge extraction.

Return runFullExtraction=true unless the chunk is clearly non-substantive and not worth extracting:
- empty or only whitespace
- only a table of contents, page numbers, or running headers/footers
- only copyright, legal, or "all rights reserved" boilerplate with no game content
- only navigation/UI text ("click here", "see page") with no lore or rules
- repeated filler with no extractable entities, locations, rules, items, or plot

When in doubt, return runFullExtraction=true. Do not list entities or types; only this boolean.`;

export interface EvaluateExtractionChunkGateOptions {
	chunkText: string;
	llmApiKey: string;
	username: string;
	campaignId: string;
	onUsage?: (
		usage: { tokens: number; queryCount: number },
		context?: { model?: string }
	) => void | Promise<void>;
}

export interface ExtractionChunkGateResult {
	runFullExtraction: boolean;
	latencyMs: number;
	/** True when the gate LLM failed; caller should run full extraction. */
	gateError?: boolean;
}

/**
 * Cheap model pass: boolean only — whether to run the full structured extraction on this chunk.
 * On any failure, returns runFullExtraction=true (conservative).
 */
export async function evaluateExtractionChunkGate(
	options: EvaluateExtractionChunkGateOptions
): Promise<ExtractionChunkGateResult> {
	const preview =
		options.chunkText.length > MAX_GATE_PREVIEW_CHARS
			? options.chunkText.slice(0, MAX_GATE_PREVIEW_CHARS)
			: options.chunkText;

	const prompt = `${GATE_INSTRUCTIONS}\n\n---\nCHUNK TEXT:\n${preview}`;

	const provider = MODEL_CONFIG.PROVIDER.DEFAULT;
	const model = getGenerationModelForProvider("PIPELINE_LIGHT");
	const started = Date.now();

	try {
		const llm = createLLMProvider({
			provider,
			apiKey: options.llmApiKey,
			defaultModel: model,
			defaultTemperature: 0,
			defaultMaxTokens: 256,
		});

		const raw = await llm.generateStructuredOutput<
			z.infer<typeof ChunkGateResultSchema>
		>(prompt, {
			model,
			temperature: 0,
			maxTokens: 256,
			schema: CHUNK_GATE_JSON_SCHEMA,
			username: options.username,
			onUsage: options.onUsage,
		});

		const parsed = parseOrThrow(ChunkGateResultSchema, raw, {
			logPrefix: "[ExtractionChunkGate]",
			messagePrefix: "Chunk gate schema validation failed",
		});

		const latencyMs = Math.max(0, Date.now() - started);
		return {
			runFullExtraction: parsed.runFullExtraction !== false,
			latencyMs,
		};
	} catch {
		return {
			runFullExtraction: true,
			latencyMs: Math.max(0, Date.now() - started),
			gateError: true,
		};
	}
}
