import { z } from "zod";
import { getGenerationModelForProvider, MODEL_CONFIG } from "@/app-constants";
import type { EnvWithSecrets } from "@/lib/env-utils";
import { getEnvVar } from "@/lib/env-utils";
import type { LlmUsageReport } from "@/lib/llm-usage-breakdown";
import { parseOrThrow } from "@/lib/zod-utils";
import { createLLMProvider } from "@/services/llm/llm-provider-factory";
import {
	classifyChunkAdvisory,
	classifyChunkDecisively,
} from "./extraction-chunk-gate-rules";
import { logChunkGateDecision } from "./extraction-chunk-gate-telemetry";

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
	/** Worker env, used only for advisory-rule agreement logging. */
	env?: EnvWithSecrets | Record<string, unknown>;
	onUsage?: (
		usage: LlmUsageReport,
		context?: { model?: string }
	) => void | Promise<void>;
}

export interface ExtractionChunkGateResult {
	runFullExtraction: boolean;
	latencyMs: number;
	/** True when the gate LLM failed; caller should run full extraction. */
	gateError?: boolean;
	/** Where the decision came from. `deterministic` means no model call happened. */
	source?: "deterministic" | "llm";
	/** Identifier of the deterministic rule that fired, when one did. */
	rule?: string;
}

/**
 * Cheap model pass: boolean only — whether to run the full structured extraction on this chunk.
 * On any failure, returns runFullExtraction=true (conservative).
 */
export async function evaluateExtractionChunkGate(
	options: EvaluateExtractionChunkGateOptions
): Promise<ExtractionChunkGateResult> {
	const gateStart = Date.now();

	// Layer 1: rules that cannot be wrong. Paying ~2,000 input tokens to detect
	// whitespace is the clearest waste in the pipeline.
	const decisive = classifyChunkDecisively(options.chunkText);
	if (decisive) {
		const result: ExtractionChunkGateResult = {
			runFullExtraction: decisive.verdict !== "non-substantive",
			latencyMs: Math.max(0, Date.now() - gateStart),
			source: "deterministic",
			rule: decisive.rule,
		};
		logChunkGateDecision(options.env, {
			source: "deterministic",
			runFullExtraction: result.runFullExtraction,
			rule: decisive.rule,
			reason: decisive.reason,
			latencyMs: result.latencyMs,
			campaignId: options.campaignId,
		});
		return result;
	}

	// Layer 2: the full rule set, evaluated but never routed on. Its agreement
	// rate with the model below is the signal that decides what gets promoted.
	const advisory = classifyChunkAdvisory(options.chunkText);

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
		const runFullExtraction = parsed.runFullExtraction !== false;
		logChunkGateDecision(options.env, {
			source: "llm",
			runFullExtraction,
			advisoryVerdict: advisory.verdict,
			advisoryRule: advisory.rule,
			// `ambiguous` is a deferral, not a guess — scoring it as a disagreement
			// would understate how well the rules that do fire are doing.
			advisoryAgreed:
				advisory.verdict === "ambiguous"
					? undefined
					: (advisory.verdict === "substantive") === runFullExtraction,
			latencyMs,
			model,
			campaignId: options.campaignId,
		});
		return { runFullExtraction, latencyMs, source: "llm" };
	} catch {
		return {
			runFullExtraction: true,
			latencyMs: Math.max(0, Date.now() - started),
			gateError: true,
			source: "llm",
		};
	}
}
