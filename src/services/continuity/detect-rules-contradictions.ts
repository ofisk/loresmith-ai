import type { CampaignRule } from "@/services/campaign/rules-context-service";
import type { ContinuityCandidate } from "@/types/continuity";
import type { ContinuityCorpus } from "./continuity-corpus";
import {
	buildFingerprint,
	toExcerpt,
	tokenOverlap,
} from "./continuity-text-utils";
import { looksLikeRuling } from "./continuity-vocabulary";

/**
 * Minimum vocabulary overlap before a digest ruling and a house rule are
 * considered to be about the same subject. Below this, pairing them wastes a
 * model call on two unrelated statements.
 */
const SUBJECT_OVERLAP_THRESHOLD = 0.25;

/** Cap pairings per ruling so one chatty digest cannot dominate a scan. */
const MAX_RULES_PER_RULING = 3;

interface DigestRuling {
	digestId: string;
	sessionNumber: number;
	field: string;
	text: string;
}

/**
 * Pull ruling-shaped lines out of the digests.
 *
 * `checkHouseRuleConflictTool` already compares a candidate rule against the
 * recorded rules pairwise. What it cannot see is a ruling the table made at
 * the table and only ever wrote down in a session recap — which is exactly the
 * gap the issue asks this detector to close.
 */
export function collectDigestRulings(
	corpus: ContinuityCorpus,
	fromSession: number | null
): DigestRuling[] {
	const rulings: DigestRuling[] = [];
	for (const digest of corpus.digests) {
		if (fromSession !== null && digest.sessionNumber < fromSession) continue;
		for (const block of digest.blocks) {
			if (!looksLikeRuling(block.text)) continue;
			rulings.push({
				digestId: digest.id,
				sessionNumber: digest.sessionNumber,
				field: block.field,
				text: block.text,
			});
		}
	}
	return rulings;
}

function rankRulesBySubject(
	ruling: DigestRuling,
	rules: CampaignRule[]
): CampaignRule[] {
	return rules
		.map((rule) => ({
			rule,
			score: tokenOverlap(ruling.text, `${rule.name} ${rule.text}`),
		}))
		.filter((scored) => scored.score >= SUBJECT_OVERLAP_THRESHOLD)
		.sort((left, right) => right.score - left.score)
		.slice(0, MAX_RULES_PER_RULING)
		.map((scored) => scored.rule);
}

/**
 * Pair rulings recorded in digests against the campaign's active rules when
 * they talk about the same subject. Whether they actually conflict is a
 * judgement call, so it is left to the adjudication tier.
 */
export function detectRulesContradictions(
	corpus: ContinuityCorpus,
	rules: CampaignRule[],
	options: { fromSession: number | null } = { fromSession: null }
): ContinuityCandidate[] {
	if (rules.length === 0) return [];

	const candidates: ContinuityCandidate[] = [];
	for (const ruling of collectDigestRulings(corpus, options.fromSession)) {
		for (const rule of rankRulesBySubject(ruling, rules)) {
			candidates.push({
				fingerprint: buildFingerprint("rules_contradiction", [
					ruling.digestId,
					ruling.text,
					rule.id,
				]),
				type: "rules_contradiction",
				subjectEntityId: rule.entityId ?? null,
				subjectName: rule.name,
				question: `Session ${ruling.sessionNumber} records a ruling that may not match the house rule "${rule.name}". Which one is current?`,
				rationale: `A digest line reads like a table ruling and shares subject vocabulary with the active ${rule.category} rule "${rule.name}".`,
				evidence: [
					{
						source: "house_rule",
						label: `House rule: ${rule.name}`,
						referenceId: rule.id,
						sessionNumber: null,
						excerpt: toExcerpt(rule.text),
					},
					{
						source: "session_digest",
						label: `Session ${ruling.sessionNumber} digest (${ruling.field})`,
						referenceId: ruling.digestId,
						sessionNumber: ruling.sessionNumber,
						excerpt: toExcerpt(ruling.text),
					},
				],
				earlierSession: null,
				laterSession: ruling.sessionNumber,
			});
		}
	}

	return candidates;
}
