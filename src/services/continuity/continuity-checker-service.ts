import type { D1Database } from "@cloudflare/workers-types";
import { generateId } from "ai";
import { getDAOFactory } from "@/dao/dao-factory";
import { RulesContextService } from "@/services/campaign/rules-context-service";
import { WorldStateChangelogService } from "@/services/graph/world-state-changelog-service";
import { getDefaultProviderApiKey } from "@/services/llm/llm-provider-utils";
import {
	CONTINUITY_FINDING_TYPES,
	type ContinuityCandidate,
	type ContinuityFinding,
	type ContinuityFindingType,
	type ContinuityResolutionAction,
	type ContinuityScanMode,
	type ContinuityScanOptions,
	type ContinuityScanResult,
	meetsConfidence,
} from "@/types/continuity";
import type { WorldStateChangelogPayload } from "@/types/world-state";
import {
	type AdjudicatedCandidate,
	ContinuityAdjudicationService,
} from "./continuity-adjudication-service";
import {
	type ContinuityCorpus,
	loadContinuityCorpus,
} from "./continuity-corpus";
import { detectDanglingThreads } from "./detect-dangling-threads";
import { detectRelationshipContradictions } from "./detect-relationship-contradictions";
import { detectRulesContradictions } from "./detect-rules-contradictions";
import { detectStateContradictions } from "./detect-state-contradictions";
import { detectTimelineContradictions } from "./detect-timeline-contradictions";

/** Default ceiling on candidates sent to the model tiers in one scan. */
const DEFAULT_MAX_CANDIDATES = 60;

/**
 * Order used when the candidate cap bites. State contradictions are the
 * findings GMs act on most, dangling threads the most tolerant of waiting.
 */
const TYPE_PRIORITY: Record<ContinuityFindingType, number> = {
	state_contradiction: 0,
	relationship_contradiction: 1,
	timeline_contradiction: 2,
	rules_contradiction: 3,
	dangling_thread: 4,
};

/**
 * Dangling threads are not contradictions, so they skip the quality tier —
 * triage alone is enough for a planning prompt, and this keeps the expensive
 * model reserved for actual conflicts.
 */
const TRIAGE_ONLY_TYPES = new Set<ContinuityFindingType>(["dangling_thread"]);

export interface ContinuityCheckerServiceOptions {
	db: D1Database;
	env?: Record<string, unknown>;
	/** Injected in tests. Production resolves the provider API key from env. */
	adjudicationService?: ContinuityAdjudicationService;
}

export interface ResolveFindingInput {
	action: ContinuityResolutionAction;
	note?: string | null;
	resolvedBy?: string | null;
	/** Required for "correct": the world state value to write back. */
	correction?: {
		entityId?: string | null;
		status?: string | null;
		campaignSessionId?: number | null;
	};
}

export interface ResolveFindingResult {
	finding: ContinuityFinding;
	/** Set when a correction wrote a world state changelog entry. */
	changelogEntryId: string | null;
}

function sortCandidates(
	candidates: ContinuityCandidate[]
): ContinuityCandidate[] {
	return [...candidates].sort((left, right) => {
		const byType = TYPE_PRIORITY[left.type] - TYPE_PRIORITY[right.type];
		if (byType !== 0) return byType;
		return (right.laterSession ?? -1) - (left.laterSession ?? -1);
	});
}

export class ContinuityCheckerService {
	private readonly db: D1Database;
	private readonly env: Record<string, unknown>;
	private readonly injectedAdjudicationService?: ContinuityAdjudicationService;

	constructor(options: ContinuityCheckerServiceOptions) {
		this.db = options.db;
		this.env = options.env ?? {};
		this.injectedAdjudicationService = options.adjudicationService;
	}

	/**
	 * Scan a campaign for continuity findings.
	 *
	 * Incremental scans (the default) only consider sessions newer than the
	 * last watermark as the *later* side of a contradiction, so routine checks
	 * cost O(new sessions) rather than O(campaign history).
	 */
	async scan(
		campaignId: string,
		options: ContinuityScanOptions = {}
	): Promise<ContinuityScanResult> {
		const scanId = generateId();
		const mode: ContinuityScanMode = options.mode ?? "incremental";
		const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
		const warnings: string[] = [];

		const dao = getDAOFactory({ DB: this.db }).continuityFindingDAO;
		const scanState = await dao.getScanState(campaignId);
		const fromSession =
			mode === "full" || scanState?.lastScannedSession == null
				? null
				: scanState.lastScannedSession + 1;

		const corpus = await loadContinuityCorpus(this.db, campaignId);
		const generated = await this.generateCandidates(
			corpus,
			campaignId,
			options.types,
			fromSession
		);

		const known = await dao.getKnownFingerprints(campaignId);
		const unseen = sortCandidates(
			generated.filter((candidate) => !known.has(candidate.fingerprint))
		);
		const truncated = unseen.length > maxCandidates;
		const selected = unseen.slice(0, maxCandidates);

		const adjudicated = await this.review(selected, warnings);
		const minConfidence = options.minConfidence ?? "low";
		const persistable = adjudicated.filter((item) =>
			meetsConfidence(item.confidence, minConfidence)
		);

		const findings = await this.persist(campaignId, scanId, persistable);

		await dao.recordScan({
			campaignId,
			scanId,
			mode,
			lastScannedSession: corpus.maxSessionNumber,
		});

		if (truncated) {
			warnings.push(
				`Candidate cap of ${maxCandidates} reached; ${unseen.length - maxCandidates} candidate(s) were not reviewed this run.`
			);
		}

		return {
			scanId,
			campaignId,
			mode,
			scannedFromSession: fromSession,
			scannedToSession: corpus.maxSessionNumber,
			candidatesGenerated: generated.length,
			candidatesAlreadyKnown: generated.length - unseen.length,
			candidatesTriaged: selected.length,
			candidatesAdjudicated: adjudicated.length,
			findingsCreated: findings.length,
			findings,
			truncated,
			warnings,
		};
	}

	/** Run the deterministic detectors for the requested finding types. */
	private async generateCandidates(
		corpus: ContinuityCorpus,
		campaignId: string,
		types: ContinuityFindingType[] | undefined,
		fromSession: number | null
	): Promise<ContinuityCandidate[]> {
		const requested = new Set(types?.length ? types : CONTINUITY_FINDING_TYPES);
		const detectorOptions = { fromSession };
		const candidates: ContinuityCandidate[] = [];

		if (requested.has("state_contradiction")) {
			candidates.push(...detectStateContradictions(corpus, detectorOptions));
		}
		if (requested.has("relationship_contradiction")) {
			candidates.push(
				...detectRelationshipContradictions(corpus, detectorOptions)
			);
		}
		if (requested.has("timeline_contradiction")) {
			candidates.push(...detectTimelineContradictions(corpus, detectorOptions));
		}
		if (requested.has("dangling_thread")) {
			candidates.push(...detectDanglingThreads(corpus, detectorOptions));
		}
		if (requested.has("rules_contradiction")) {
			const rules = await RulesContextService.getActiveRulesForCampaign(
				{ DB: this.db, ...this.env },
				campaignId
			);
			candidates.push(
				...detectRulesContradictions(corpus, rules, detectorOptions)
			);
		}

		return candidates;
	}

	/** Triage everything, then adjudicate only the types that warrant it. */
	private async review(
		candidates: ContinuityCandidate[],
		warnings: string[]
	): Promise<AdjudicatedCandidate[]> {
		if (candidates.length === 0) return [];

		const service = await this.getAdjudicationService();
		if (!service) {
			warnings.push(
				"No LLM provider API key configured; continuity scan produced no findings."
			);
			return [];
		}

		const survivors = await service.triage(candidates);
		const triageOnly = survivors.filter((candidate) =>
			TRIAGE_ONLY_TYPES.has(candidate.type)
		);
		const forAdjudication = survivors.filter(
			(candidate) => !TRIAGE_ONLY_TYPES.has(candidate.type)
		);

		const adjudicated = await service.adjudicate(forAdjudication);
		return [
			...adjudicated,
			...triageOnly.map((candidate) => ({
				candidate,
				confidence: "medium" as const,
				question: candidate.question,
				detail: candidate.rationale,
			})),
		];
	}

	private async getAdjudicationService(): Promise<ContinuityAdjudicationService | null> {
		if (this.injectedAdjudicationService) {
			return this.injectedAdjudicationService;
		}
		try {
			const apiKey = await getDefaultProviderApiKey(this.env);
			if (!apiKey) return null;
			return new ContinuityAdjudicationService({ apiKey });
		} catch (_error) {
			return null;
		}
	}

	/** Write surviving findings, skipping fingerprints already on record. */
	private async persist(
		campaignId: string,
		scanId: string,
		items: AdjudicatedCandidate[]
	): Promise<ContinuityFinding[]> {
		const dao = getDAOFactory({ DB: this.db }).continuityFindingDAO;
		const created: ContinuityFinding[] = [];

		for (const item of items) {
			const id = generateId();
			const inserted = await dao.createFinding({
				id,
				campaignId,
				fingerprint: item.candidate.fingerprint,
				findingType: item.candidate.type,
				confidence: item.confidence,
				question: item.question,
				detail: item.detail,
				evidence: item.candidate.evidence,
				subjectEntityId: item.candidate.subjectEntityId,
				subjectName: item.candidate.subjectName,
				scanId,
			});
			if (!inserted) continue;

			const finding = await dao.getFindingById(id);
			if (finding) created.push(finding);
		}

		return created;
	}

	/**
	 * Record the GM's adjudication. `correct` additionally writes the corrected
	 * value back to world state as a changelog entry, so the fix flows into the
	 * graph on the next rebuild rather than living only in the report.
	 */
	async resolveFinding(
		campaignId: string,
		findingId: string,
		input: ResolveFindingInput
	): Promise<ResolveFindingResult> {
		const dao = getDAOFactory({ DB: this.db }).continuityFindingDAO;
		const existing = await dao.getFindingById(findingId);
		if (!existing || existing.campaignId !== campaignId) {
			throw new Error("Continuity finding not found");
		}

		let changelogEntryId: string | null = null;
		if (input.action === "correct") {
			changelogEntryId = await this.writeCorrection(
				campaignId,
				existing,
				input
			);
		}

		const status =
			input.action === "confirm"
				? "confirmed"
				: input.action === "dismiss"
					? "dismissed"
					: "corrected";

		await dao.updateFindingStatus(findingId, status, {
			resolutionNote: input.note ?? null,
			resolvedBy: input.resolvedBy ?? null,
		});

		const finding = await dao.getFindingById(findingId);
		if (!finding) {
			throw new Error("Continuity finding not found after update");
		}
		return { finding, changelogEntryId };
	}

	private async writeCorrection(
		campaignId: string,
		finding: ContinuityFinding,
		input: ResolveFindingInput
	): Promise<string> {
		const entityId = input.correction?.entityId ?? finding.subjectEntityId;
		const status = input.correction?.status?.trim();
		if (!entityId || !status) {
			throw new Error(
				"A correction requires an entity id and a corrected status"
			);
		}

		const payload: WorldStateChangelogPayload = {
			campaign_session_id: input.correction?.campaignSessionId ?? null,
			timestamp: new Date().toISOString(),
			entity_updates: [
				{
					entity_id: entityId,
					status,
					source: "continuity_correction",
					continuity_finding_id: finding.id,
					note: input.note ?? null,
				},
			],
			relationship_updates: [],
			new_entities: [],
		};

		const entry = await new WorldStateChangelogService({
			db: this.db,
		}).recordChangelog(campaignId, payload);
		return entry.id;
	}
}
