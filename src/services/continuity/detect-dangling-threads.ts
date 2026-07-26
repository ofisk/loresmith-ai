import type { ContinuityCandidate } from "@/types/continuity";
import type { ContinuityCorpus, CorpusDigest } from "./continuity-corpus";
import {
	buildFingerprint,
	toExcerpt,
	tokenOverlap,
} from "./continuity-text-utils";

/**
 * Overlap above which a later digest line is taken to be the same thread.
 * Tuned to be forgiving: wrongly treating a thread as resolved is a silent
 * miss, which is far cheaper than nagging a GM about a thread they closed.
 */
const RESOLUTION_OVERLAP_THRESHOLD = 0.5;

/**
 * Sessions a thread must survive before it is worth mentioning. A hook left
 * open for one session is just next week's plot.
 */
const MIN_SESSIONS_DANGLING = 2;

/** Threads shorter than this are labels, not hooks, and score badly on overlap. */
const MIN_THREAD_LENGTH = 12;

function laterDigests(
	corpus: ContinuityCorpus,
	afterSession: number
): CorpusDigest[] {
	return corpus.digests.filter((digest) => digest.sessionNumber > afterSession);
}

/** True when some later digest line plainly covers the same ground. */
function looksResolved(
	corpus: ContinuityCorpus,
	thread: string,
	sessionNumber: number
): boolean {
	for (const digest of laterDigests(corpus, sessionNumber)) {
		for (const block of digest.blocks) {
			if (tokenOverlap(thread, block.text) >= RESOLUTION_OVERLAP_THRESHOLD) {
				return true;
			}
		}
	}
	return false;
}

/**
 * Hooks introduced and never picked up again.
 *
 * Not an error — the issue calls this "the report a GM most wants before
 * planning the next session" — so the phrasing stays neutral and these are the
 * one finding type that never claims something is wrong.
 */
export function detectDanglingThreads(
	corpus: ContinuityCorpus,
	options: { fromSession: number | null } = { fromSession: null }
): ContinuityCandidate[] {
	const maxSession = corpus.maxSessionNumber;
	if (maxSession === null) return [];

	const candidates: ContinuityCandidate[] = [];
	const seenThreads = new Set<string>();

	for (const digest of corpus.digests) {
		const sessionsSince = maxSession - digest.sessionNumber;
		if (sessionsSince < MIN_SESSIONS_DANGLING) continue;

		for (const thread of digest.data.last_session_recap.open_threads ?? []) {
			const text = typeof thread === "string" ? thread.trim() : "";
			if (text.length < MIN_THREAD_LENGTH) continue;

			const normalized = text.toLowerCase();
			if (seenThreads.has(normalized)) continue;
			seenThreads.add(normalized);

			if (looksResolved(corpus, text, digest.sessionNumber)) continue;

			candidates.push({
				fingerprint: buildFingerprint("dangling_thread", [
					digest.id,
					normalized,
				]),
				type: "dangling_thread",
				subjectEntityId: null,
				subjectName: null,
				question: `Session ${digest.sessionNumber} left this thread open and nothing since has picked it up: "${toExcerpt(text, 160)}". Still live?`,
				rationale: `Open thread recorded in session ${digest.sessionNumber} with no substantially overlapping content in the ${sessionsSince} session(s) since.`,
				evidence: [
					{
						source: "session_digest",
						label: `Session ${digest.sessionNumber} digest (open_threads)`,
						referenceId: digest.id,
						sessionNumber: digest.sessionNumber,
						excerpt: toExcerpt(text),
					},
					{
						source: "session_digest",
						label: `Sessions ${digest.sessionNumber + 1}–${maxSession}`,
						referenceId: null,
						sessionNumber: maxSession,
						excerpt: "No later digest revisits this thread.",
					},
				],
				earlierSession: digest.sessionNumber,
				laterSession: maxSession,
			});
		}
	}

	// Incremental scans still walk the whole history — a thread only becomes
	// dangling by the *absence* of later content — but callers asking for a
	// window get the threads that newly qualified within it.
	const fromSession = options.fromSession;
	if (fromSession === null) return candidates;
	return candidates.filter(
		(candidate) =>
			candidate.earlierSession !== null &&
			candidate.earlierSession + MIN_SESSIONS_DANGLING >= fromSession
	);
}
