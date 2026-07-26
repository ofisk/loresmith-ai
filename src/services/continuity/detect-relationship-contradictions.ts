import type {
	ContinuityCandidate,
	ContinuityEvidence,
} from "@/types/continuity";
import type { ContinuityCorpus } from "./continuity-corpus";
import {
	buildFingerprint,
	mentionsName,
	toExcerpt,
} from "./continuity-text-utils";
import {
	classifyRelationshipStatus,
	type RelationshipPolarity,
} from "./continuity-vocabulary";

interface PolarityMark {
	polarity: RelationshipPolarity;
	status: string;
	sessionNumber: number | null;
	timestamp: string;
	entryId: string;
}

interface PolarityFlip {
	fromEntityId: string;
	toEntityId: string;
	fromName: string;
	toName: string;
	before: PolarityMark;
	after: PolarityMark;
}

function pairKey(from: string, to: string): string {
	return from < to ? `${from}::${to}` : `${to}::${from}`;
}

function newStatusOf(update: { new_status?: string }): string {
	return typeof update.new_status === "string" ? update.new_status : "";
}

/**
 * Detect allied↔hostile reversals in the relationship changelog.
 *
 * Only polarity *reversals* count. A drift through neutral, or a restatement of
 * the same polarity, is normal campaign bookkeeping and is skipped.
 */
export function collectPolarityFlips(corpus: ContinuityCorpus): PolarityFlip[] {
	const latest = new Map<string, PolarityMark>();
	const flips: PolarityFlip[] = [];

	for (const entry of corpus.changelog) {
		for (const update of entry.payload.relationship_updates ?? []) {
			const { from, to } = update;
			if (!from || !to) continue;

			const fromName = corpus.entityNames.get(from);
			const toName = corpus.entityNames.get(to);
			if (!fromName || !toName) continue;

			const status = newStatusOf(update);
			const polarity = classifyRelationshipStatus(status);
			if (polarity === "neutral") continue;

			const key = pairKey(from, to);
			const previous = latest.get(key);
			const current: PolarityMark = {
				polarity,
				status,
				sessionNumber: entry.sessionNumber,
				timestamp: entry.timestamp,
				entryId: entry.id,
			};
			latest.set(key, current);

			if (!previous || previous.polarity === polarity) continue;

			flips.push({
				fromEntityId: from,
				toEntityId: to,
				fromName,
				toName,
				before: previous,
				after: current,
			});
		}
	}

	return flips;
}

/**
 * Look for something between the two sessions that could explain the reversal.
 *
 * A digest line naming both parties in the intervening window is treated as the
 * missing event: the GM recorded *why* the relationship changed, so there is
 * nothing to ask about.
 */
function findInterveningEvent(
	corpus: ContinuityCorpus,
	flip: PolarityFlip
): { digestId: string; sessionNumber: number; text: string } | null {
	const start = flip.before.sessionNumber;
	const end = flip.after.sessionNumber;
	if (start === null || end === null) return null;

	for (const digest of corpus.digests) {
		if (digest.sessionNumber < start || digest.sessionNumber > end) continue;
		for (const block of digest.blocks) {
			if (
				mentionsName(block.text, flip.fromName) &&
				mentionsName(block.text, flip.toName)
			) {
				return {
					digestId: digest.id,
					sessionNumber: digest.sessionNumber,
					text: block.text,
				};
			}
		}
	}
	return null;
}

function relationshipEvidence(
	mark: PolarityMark,
	flip: PolarityFlip
): ContinuityEvidence {
	const label =
		mark.sessionNumber === null
			? "World state relationship change"
			: `Session ${mark.sessionNumber} relationship change`;
	return {
		source: "entity_relationship",
		label,
		referenceId: mark.entryId,
		sessionNumber: mark.sessionNumber,
		excerpt: toExcerpt(
			`${flip.fromName} → ${flip.toName} recorded as "${mark.status}" (${mark.polarity}).`
		),
	};
}

/**
 * Report allied factions later described as hostile (or the reverse) with no
 * intervening session that mentions both of them.
 */
export function detectRelationshipContradictions(
	corpus: ContinuityCorpus,
	options: { fromSession: number | null } = { fromSession: null }
): ContinuityCandidate[] {
	const candidates: ContinuityCandidate[] = [];

	for (const flip of collectPolarityFlips(corpus)) {
		const laterSession = flip.after.sessionNumber;
		if (
			options.fromSession !== null &&
			laterSession !== null &&
			laterSession < options.fromSession
		) {
			continue;
		}

		if (findInterveningEvent(corpus, flip)) continue;

		const whenBefore =
			flip.before.sessionNumber === null
				? "earlier"
				: `session ${flip.before.sessionNumber}`;
		const whenAfter =
			laterSession === null ? "later" : `session ${laterSession}`;

		candidates.push({
			fingerprint: buildFingerprint("relationship_contradiction", [
				pairKey(flip.fromEntityId, flip.toEntityId),
				flip.before.sessionNumber,
				flip.after.sessionNumber,
				flip.before.polarity,
				flip.after.polarity,
			]),
			type: "relationship_contradiction",
			subjectEntityId: flip.fromEntityId,
			subjectName: `${flip.fromName} / ${flip.toName}`,
			question: `${flip.fromName} and ${flip.toName} were ${flip.before.polarity} in ${whenBefore} and ${flip.after.polarity} by ${whenAfter}, with no session recording why. Is an event missing?`,
			rationale: `Relationship polarity reversed from ${flip.before.polarity} ("${flip.before.status}") to ${flip.after.polarity} ("${flip.after.status}") and no digest between those sessions mentions both parties together.`,
			evidence: [
				relationshipEvidence(flip.before, flip),
				relationshipEvidence(flip.after, flip),
			],
			earlierSession: flip.before.sessionNumber,
			laterSession,
		});
	}

	return candidates;
}
