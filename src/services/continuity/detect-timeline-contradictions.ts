import type {
	ContinuityCandidate,
	ContinuityEvidence,
} from "@/types/continuity";
import type { ContinuityCorpus, CorpusDigest } from "./continuity-corpus";
import {
	buildFingerprint,
	mentionsName,
	toExcerpt,
} from "./continuity-text-utils";

function digestEvidence(
	digest: CorpusDigest,
	excerpt: string
): ContinuityEvidence {
	return {
		source: "session_digest",
		label: `Session ${digest.sessionNumber} digest`,
		referenceId: digest.id,
		sessionNumber: digest.sessionNumber,
		excerpt: toExcerpt(excerpt),
	};
}

function parseDate(value: string | null): number | null {
	if (!value) return null;
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Sessions whose recorded dates run backwards against their session numbers.
 *
 * This is fully deterministic — there is no interpretation involved — so it is
 * the cheapest continuity signal in the system and the most reliable.
 */
function detectSessionDateInversions(
	corpus: ContinuityCorpus,
	fromSession: number | null
): ContinuityCandidate[] {
	const dated = corpus.digests
		.map((digest) => ({ digest, date: parseDate(digest.sessionDate) }))
		.filter(
			(item): item is { digest: CorpusDigest; date: number } =>
				item.date !== null
		);

	const candidates: ContinuityCandidate[] = [];
	for (let i = 1; i < dated.length; i++) {
		const previous = dated[i - 1];
		const current = dated[i];
		if (current.date >= previous.date) continue;
		if (
			fromSession !== null &&
			current.digest.sessionNumber < fromSession &&
			previous.digest.sessionNumber < fromSession
		) {
			continue;
		}

		candidates.push({
			fingerprint: buildFingerprint("timeline_contradiction", [
				"date_inversion",
				previous.digest.id,
				current.digest.id,
			]),
			type: "timeline_contradiction",
			subjectEntityId: null,
			subjectName: null,
			question: `Session ${current.digest.sessionNumber} is dated ${current.digest.sessionDate}, before session ${previous.digest.sessionNumber} on ${previous.digest.sessionDate}. Is one of these dates wrong?`,
			rationale:
				"Session numbers and session dates disagree on ordering. Either a date was mistyped or the sessions were played out of order.",
			evidence: [
				digestEvidence(
					previous.digest,
					`Session ${previous.digest.sessionNumber} dated ${previous.digest.sessionDate}.`
				),
				digestEvidence(
					current.digest,
					`Session ${current.digest.sessionNumber} dated ${current.digest.sessionDate}.`
				),
			],
			earlierSession: previous.digest.sessionNumber,
			laterSession: current.digest.sessionNumber,
		});
	}

	return candidates;
}

/**
 * Entities referenced in a digest earlier than the session that introduces them.
 *
 * Often benign (extraction lag, a foreshadowed name) which is exactly why this
 * goes through triage rather than straight to the GM.
 */
function detectPrematureReferences(
	corpus: ContinuityCorpus,
	fromSession: number | null
): ContinuityCandidate[] {
	const introducedAt = new Map<string, { session: number; entryId: string }>();

	for (const entry of corpus.changelog) {
		if (entry.sessionNumber === null) continue;
		for (const created of entry.payload.new_entities ?? []) {
			const entityId = created.entity_id;
			if (!entityId || introducedAt.has(entityId)) continue;
			introducedAt.set(entityId, {
				session: entry.sessionNumber,
				entryId: entry.id,
			});
		}
	}

	const candidates: ContinuityCandidate[] = [];
	for (const [entityId, introduction] of introducedAt) {
		const name = corpus.entityNames.get(entityId);
		if (!name) continue;

		for (const digest of corpus.digests) {
			if (digest.sessionNumber >= introduction.session) continue;
			if (fromSession !== null && introduction.session < fromSession) continue;

			const hit = digest.blocks.find((block) => mentionsName(block.text, name));
			if (!hit) continue;

			candidates.push({
				fingerprint: buildFingerprint("timeline_contradiction", [
					"premature_reference",
					entityId,
					introduction.session,
					digest.sessionNumber,
				]),
				type: "timeline_contradiction",
				subjectEntityId: entityId,
				subjectName: name,
				question: `${name} is first introduced in session ${introduction.session} but appears in the session ${digest.sessionNumber} digest. Was ${name} introduced earlier than recorded?`,
				rationale: `World state records ${name} as a new entity in session ${introduction.session}, yet an earlier digest already names them.`,
				evidence: [
					{
						source: "world_state_changelog",
						label: `Session ${introduction.session} world state`,
						referenceId: introduction.entryId,
						sessionNumber: introduction.session,
						excerpt: toExcerpt(
							`${name} recorded as a new entity in session ${introduction.session}.`
						),
					},
					digestEvidence(digest, hit.text),
				],
				earlierSession: digest.sessionNumber,
				laterSession: introduction.session,
			});
			break;
		}
	}

	return candidates;
}

/** Both timeline detectors: date inversions and premature references. */
export function detectTimelineContradictions(
	corpus: ContinuityCorpus,
	options: { fromSession: number | null } = { fromSession: null }
): ContinuityCandidate[] {
	return [
		...detectSessionDateInversions(corpus, options.fromSession),
		...detectPrematureReferences(corpus, options.fromSession),
	];
}
