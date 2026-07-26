import type {
	ContinuityCandidate,
	ContinuityEvidence,
} from "@/types/continuity";
import type {
	ContinuityCorpus,
	CorpusChangelogEntry,
	CorpusDigest,
} from "./continuity-corpus";
import {
	buildFingerprint,
	mentionsName,
	toExcerpt,
} from "./continuity-text-utils";
import {
	classifyEntityStatus,
	type EntityStatusBucket,
} from "./continuity-vocabulary";

/** Digest fields that describe *upcoming* play, where a mention is strongest. */
const FORWARD_LOOKING_FIELDS = new Set([
	"npcs_to_run",
	"locations_in_focus",
	"next_session_plan.beats",
	"next_session_plan.objectives_dm",
	"encounter_seeds",
]);

/** The last recorded removal/absence for one entity. */
interface StatusMark {
	entityId: string;
	name: string;
	bucket: EntityStatusBucket;
	status: string;
	sessionNumber: number | null;
	timestamp: string;
	entryId: string;
}

function statusOf(update: { status?: string }): string {
	return typeof update.status === "string" ? update.status : "";
}

/**
 * Walk the changelog in order and keep, per entity, the most recent removal or
 * absence that has *not* since been undone.
 *
 * Handling `restored` by clearing the mark is what stops the checker from
 * flagging every resurrection in the campaign — the single most obvious false
 * positive in fiction.
 */
export function collectOpenStatusMarks(
	corpus: ContinuityCorpus
): Map<string, StatusMark> {
	const marks = new Map<string, StatusMark>();

	for (const entry of corpus.changelog) {
		for (const update of entry.payload.entity_updates ?? []) {
			const entityId = update.entity_id;
			if (!entityId) continue;

			const name = corpus.entityNames.get(entityId);
			if (!name) continue;

			const status = statusOf(update);
			const bucket = classifyEntityStatus(status);

			if (bucket === "restored") {
				marks.delete(entityId);
				continue;
			}
			if (bucket !== "removed" && bucket !== "absent") continue;

			marks.set(entityId, {
				entityId,
				name,
				bucket,
				status,
				sessionNumber: entry.sessionNumber,
				timestamp: entry.timestamp,
				entryId: entry.id,
			});
		}
	}

	return marks;
}

function changelogEvidence(
	mark: StatusMark,
	entry: CorpusChangelogEntry | undefined
): ContinuityEvidence {
	const sessionLabel =
		mark.sessionNumber === null
			? "World state change"
			: `Session ${mark.sessionNumber} world state`;
	return {
		source: "world_state_changelog",
		label: sessionLabel,
		referenceId: entry?.id ?? mark.entryId,
		sessionNumber: mark.sessionNumber,
		excerpt: toExcerpt(`${mark.name} recorded as "${mark.status}".`),
	};
}

function digestEvidence(
	digest: CorpusDigest,
	field: string,
	text: string
): ContinuityEvidence {
	return {
		source: "session_digest",
		label: `Session ${digest.sessionNumber} digest (${field})`,
		referenceId: digest.id,
		sessionNumber: digest.sessionNumber,
		excerpt: toExcerpt(text),
	};
}

function buildQuestion(mark: StatusMark, digest: CorpusDigest): string {
	const when =
		mark.sessionNumber === null
			? "World state"
			: `Session ${mark.sessionNumber}`;
	return `${when} recorded ${mark.name} as "${mark.status}", but session ${digest.sessionNumber} references ${mark.name} as present. Intentional?`;
}

function buildRationale(
	mark: StatusMark,
	field: string,
	forwardLooking: boolean
): string {
	const strength = mark.bucket === "removed" ? "removed from play" : "absent";
	const context = forwardLooking
		? `the later mention is in "${field}", which describes upcoming play`
		: `the later mention is in "${field}"`;
	return `${mark.name} was marked ${strength} ("${mark.status}") and no later world state entry restores them; ${context}.`;
}

/**
 * Find entities recorded as dead/destroyed/departed that a later digest still
 * treats as present.
 *
 * Candidate generation is bounded by the number of *marked* entities, not by
 * the entity count: an entity nobody ever removed is never a candidate.
 */
export function detectStateContradictions(
	corpus: ContinuityCorpus,
	options: { fromSession: number | null } = { fromSession: null }
): ContinuityCandidate[] {
	const marks = collectOpenStatusMarks(corpus);
	if (marks.size === 0) return [];

	const changelogById = new Map(
		corpus.changelog.map((entry) => [entry.id, entry])
	);
	const candidates: ContinuityCandidate[] = [];

	for (const mark of marks.values()) {
		// A removal with no session number cannot be ordered against digests.
		if (mark.sessionNumber === null) continue;

		for (const digest of corpus.digests) {
			if (digest.sessionNumber <= mark.sessionNumber) continue;
			if (
				options.fromSession !== null &&
				digest.sessionNumber < options.fromSession
			) {
				continue;
			}

			const hit = digest.blocks.find((block) =>
				mentionsName(block.text, mark.name)
			);
			if (!hit) continue;

			const forwardLooking = FORWARD_LOOKING_FIELDS.has(hit.field);
			candidates.push({
				fingerprint: buildFingerprint("state_contradiction", [
					mark.entityId,
					mark.sessionNumber,
					digest.sessionNumber,
					hit.field,
					hit.text,
				]),
				type: "state_contradiction",
				subjectEntityId: mark.entityId,
				subjectName: mark.name,
				question: buildQuestion(mark, digest),
				rationale: buildRationale(mark, hit.field, forwardLooking),
				evidence: [
					changelogEvidence(mark, changelogById.get(mark.entryId)),
					digestEvidence(digest, hit.field, hit.text),
				],
				earlierSession: mark.sessionNumber,
				laterSession: digest.sessionNumber,
			});

			// One candidate per (entity, later session). Repeating the same
			// question for every line in a digest is exactly the noise that
			// gets a checker switched off.
			break;
		}
	}

	return candidates;
}
