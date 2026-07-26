/**
 * Campaign continuity checker types (issue #744).
 *
 * The checker looks for likely contradictions across session digests, the world
 * state changelog and the entity graph, and reports them as *questions* a GM can
 * adjudicate in seconds rather than as errors.
 */

/** Categories of continuity finding the checker can raise. */
export type ContinuityFindingType =
	/** Entity recorded dead/destroyed/departed, then referenced as present. */
	| "state_contradiction"
	/** Event ordering that conflicts across digests or against first appearance. */
	| "timeline_contradiction"
	/** Allies described as hostile (or vice versa) with no intervening event. */
	| "relationship_contradiction"
	/** A ruling implied by a digest that conflicts with a recorded house rule. */
	| "rules_contradiction"
	/** A hook introduced and never resolved. Not an error — a planning prompt. */
	| "dangling_thread";

export const CONTINUITY_FINDING_TYPES: readonly ContinuityFindingType[] = [
	"state_contradiction",
	"timeline_contradiction",
	"relationship_contradiction",
	"rules_contradiction",
	"dangling_thread",
] as const;

/**
 * Confidence in a finding. The UI defaults to `high` only — a checker that
 * cries wolf gets switched off after one use.
 */
export type ContinuityConfidence = "high" | "medium" | "low";

/** Lifecycle of a finding. `dismissed` findings never resurface. */
export type ContinuityFindingStatus =
	| "open"
	| "confirmed"
	| "dismissed"
	| "corrected";

/** Where a piece of evidence came from, so the GM can jump straight to it. */
export type ContinuityEvidenceSource =
	| "session_digest"
	| "world_state_changelog"
	| "entity"
	| "entity_relationship"
	| "house_rule";

/**
 * One side of a finding. Every finding cites at least two of these — the GM
 * should never have to go investigate which sources disagree.
 */
export interface ContinuityEvidence {
	source: ContinuityEvidenceSource;
	/** Short human label, e.g. "Session 12 digest". */
	label: string;
	/** Row id of the digest / changelog entry / entity so the UI can deep-link. */
	referenceId: string | null;
	/** Campaign session number when known, for ordering the two sides. */
	sessionNumber: number | null;
	/** The exact text that triggered the finding. Kept short. */
	excerpt: string;
}

/**
 * A pre-LLM candidate produced by deterministic detectors. Cheap to generate;
 * only survivors of triage reach the expensive adjudication tier.
 */
export interface ContinuityCandidate {
	/** Stable across scans — the dedupe and dismissal-memory key. */
	fingerprint: string;
	type: ContinuityFindingType;
	subjectEntityId: string | null;
	subjectName: string | null;
	/** Deterministic phrasing, refined by the adjudicator when it survives. */
	question: string;
	/** Why the detector flagged it, fed to the model as context. */
	rationale: string;
	evidence: ContinuityEvidence[];
	/** Session the earlier side of the contradiction was recorded in. */
	earlierSession: number | null;
	/** Session the later, conflicting reference appears in. */
	laterSession: number | null;
}

/** Normalized finding exposed to routes, tools and the UI. */
export interface ContinuityFinding {
	id: string;
	campaignId: string;
	fingerprint: string;
	findingType: ContinuityFindingType;
	confidence: ContinuityConfidence;
	question: string;
	detail: string | null;
	evidence: ContinuityEvidence[];
	subjectEntityId: string | null;
	subjectName: string | null;
	status: ContinuityFindingStatus;
	resolutionNote: string | null;
	resolvedBy: string | null;
	resolvedAt: string | null;
	scanId: string | null;
	detectedAt: string;
	updatedAt: string;
}

/** Raw row shape returned directly from D1. */
export interface ContinuityFindingRecord {
	id: string;
	campaign_id: string;
	fingerprint: string;
	finding_type: string;
	confidence: string;
	question: string;
	detail: string | null;
	evidence: string;
	subject_entity_id: string | null;
	subject_name: string | null;
	status: string;
	resolution_note: string | null;
	resolved_by: string | null;
	resolved_at: string | null;
	scan_id: string | null;
	detected_at: string;
	updated_at: string;
}

export interface CreateContinuityFindingInput {
	id: string;
	campaignId: string;
	fingerprint: string;
	findingType: ContinuityFindingType;
	confidence: ContinuityConfidence;
	question: string;
	detail?: string | null;
	evidence: ContinuityEvidence[];
	subjectEntityId?: string | null;
	subjectName?: string | null;
	scanId?: string | null;
}

/** Incremental checks new sessions only; full rescans the whole campaign. */
export type ContinuityScanMode = "incremental" | "full";

export interface ContinuityScanOptions {
	mode?: ContinuityScanMode;
	/** Restrict detection to a subset of finding types. */
	types?: ContinuityFindingType[];
	/** Hard cap on candidates sent to the model. Protects long campaigns. */
	maxCandidates?: number;
	/** Lowest confidence to persist. Defaults to persisting all tiers. */
	minConfidence?: ContinuityConfidence;
}

export interface ContinuityScanResult {
	scanId: string;
	campaignId: string;
	mode: ContinuityScanMode;
	/** Sessions considered as the "later reference" side of a contradiction. */
	scannedFromSession: number | null;
	scannedToSession: number | null;
	candidatesGenerated: number;
	/** Candidates dropped because an identical fingerprint already exists. */
	candidatesAlreadyKnown: number;
	candidatesTriaged: number;
	candidatesAdjudicated: number;
	findingsCreated: number;
	findings: ContinuityFinding[];
	/** Set when the candidate cap truncated detection, so callers can say so. */
	truncated: boolean;
	/** Populated when the LLM tiers were unavailable and detection ran raw. */
	warnings: string[];
}

export interface ContinuityScanState {
	campaignId: string;
	lastScannedSession: number | null;
	lastScanId: string | null;
	lastScanMode: ContinuityScanMode | null;
	lastScanAt: string | null;
}

/** GM adjudication of a finding. */
export type ContinuityResolutionAction = "confirm" | "dismiss" | "correct";

export function isContinuityFindingType(
	value: unknown
): value is ContinuityFindingType {
	return (
		typeof value === "string" &&
		CONTINUITY_FINDING_TYPES.includes(value as ContinuityFindingType)
	);
}

const CONFIDENCE_RANK: Record<ContinuityConfidence, number> = {
	low: 0,
	medium: 1,
	high: 2,
};

/** True when `value` is at least as confident as `minimum`. */
export function meetsConfidence(
	value: ContinuityConfidence,
	minimum: ContinuityConfidence
): boolean {
	return CONFIDENCE_RANK[value] >= CONFIDENCE_RANK[minimum];
}
