import {
	CONTINUITY_ADJUDICATION_SCHEMA,
	CONTINUITY_TRIAGE_SCHEMA,
	formatContinuityAdjudicationPrompt,
	formatContinuityTriagePrompt,
} from "@/lib/prompts/continuity-prompts";
import type { LLMProvider } from "@/services/llm/llm-provider";
import { createProviderForTier } from "@/services/llm/llm-provider-utils";
import type {
	ContinuityCandidate,
	ContinuityConfidence,
} from "@/types/continuity";

/**
 * Candidates per triage call. Large enough that the shared instructions are
 * amortised, small enough that the model keeps every item in view.
 */
const TRIAGE_BATCH_SIZE = 12;

/** Adjudication batches stay small — this tier is asked to reason carefully. */
const ADJUDICATION_BATCH_SIZE = 5;

const TRIAGE_MAX_TOKENS = 2000;
const ADJUDICATION_MAX_TOKENS = 3000;

export interface AdjudicatedCandidate {
	candidate: ContinuityCandidate;
	confidence: ContinuityConfidence;
	/** Refined GM-facing phrasing; falls back to the detector's question. */
	question: string;
	detail: string | null;
}

interface TriageVerdict {
	index?: number;
	worthKeeping?: boolean;
	reason?: string;
}

interface AdjudicationVerdict {
	index?: number;
	isContradiction?: boolean;
	confidence?: string;
	question?: string;
	detail?: string;
}

function chunk<T>(items: T[], size: number): T[][] {
	const batches: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		batches.push(items.slice(i, i + size));
	}
	return batches;
}

function normalizeConfidence(value: unknown): ContinuityConfidence {
	return value === "high" || value === "medium" || value === "low"
		? value
		: "low";
}

export interface ContinuityAdjudicationServiceOptions {
	apiKey: string;
	/** Injected in tests; production builds both tiers from MODEL_CONFIG. */
	triageProvider?: LLMProvider;
	adjudicationProvider?: LLMProvider;
}

/**
 * The two model tiers of the continuity checker.
 *
 * Triage runs on PIPELINE_ANALYSIS (cheap) to shortlist; adjudication runs on
 * PIPELINE_STRUCTURED (quality) only on survivors. That split is what keeps a
 * scan affordable as campaign history grows.
 */
export class ContinuityAdjudicationService {
	private readonly triageProvider: LLMProvider;
	private readonly adjudicationProvider: LLMProvider;

	constructor(options: ContinuityAdjudicationServiceOptions) {
		this.triageProvider =
			options.triageProvider ??
			createProviderForTier({
				apiKey: options.apiKey,
				tier: "PIPELINE_ANALYSIS",
				temperature: 0,
				maxTokens: TRIAGE_MAX_TOKENS,
			});
		this.adjudicationProvider =
			options.adjudicationProvider ??
			createProviderForTier({
				apiKey: options.apiKey,
				tier: "PIPELINE_STRUCTURED",
				temperature: 0.1,
				maxTokens: ADJUDICATION_MAX_TOKENS,
			});
	}

	/**
	 * Cheap shortlist. A failed batch is dropped rather than passed through:
	 * an unreviewed candidate reaching the GM is the failure mode this whole
	 * feature is designed to avoid.
	 */
	async triage(
		candidates: ContinuityCandidate[]
	): Promise<ContinuityCandidate[]> {
		if (candidates.length === 0) return [];

		const kept: ContinuityCandidate[] = [];
		for (const batch of chunk(candidates, TRIAGE_BATCH_SIZE)) {
			try {
				const result = await this.triageProvider.generateStructuredOutput<{
					verdicts?: TriageVerdict[];
				}>(formatContinuityTriagePrompt(batch), {
					temperature: 0,
					maxTokens: TRIAGE_MAX_TOKENS,
					schema: CONTINUITY_TRIAGE_SCHEMA,
				});

				for (const verdict of result.verdicts ?? []) {
					const candidate = batch[verdict.index ?? -1];
					if (candidate && verdict.worthKeeping === true) {
						kept.push(candidate);
					}
				}
			} catch (_error) {
				// Drop the batch. Silence beats an unvetted finding.
			}
		}
		return kept;
	}

	/**
	 * Quality pass. Returns only candidates the model calls a real
	 * contradiction, with the confidence and GM-facing phrasing it chose.
	 */
	async adjudicate(
		candidates: ContinuityCandidate[]
	): Promise<AdjudicatedCandidate[]> {
		if (candidates.length === 0) return [];

		const adjudicated: AdjudicatedCandidate[] = [];
		for (const batch of chunk(candidates, ADJUDICATION_BATCH_SIZE)) {
			try {
				const result =
					await this.adjudicationProvider.generateStructuredOutput<{
						verdicts?: AdjudicationVerdict[];
					}>(formatContinuityAdjudicationPrompt(batch), {
						temperature: 0.1,
						maxTokens: ADJUDICATION_MAX_TOKENS,
						schema: CONTINUITY_ADJUDICATION_SCHEMA,
					});

				for (const verdict of result.verdicts ?? []) {
					const candidate = batch[verdict.index ?? -1];
					if (!candidate || verdict.isContradiction !== true) continue;

					adjudicated.push({
						candidate,
						confidence: normalizeConfidence(verdict.confidence),
						question: verdict.question?.trim() || candidate.question,
						detail: verdict.detail?.trim() || null,
					});
				}
			} catch (_error) {
				// Same policy as triage: a batch we could not adjudicate is dropped.
			}
		}
		return adjudicated;
	}
}
