/** First PROGRESS line wins (progress may be prefixed before error/rate-limit text). */
const PROGRESS_IN_MESSAGE = /PROGRESS:(\d+)\/(\d+)/;

/**
 * Parses a `PROGRESS:processed/total` checkpoint from `queue_message`
 * on `entity_extraction_queue` (also used for failures and rate-limit notes).
 * `processed` is cumulative chunks finished for the resource (resume cursor / bar),
 * not “chunks done in the current worker invocation only”.
 * Matches the first `PROGRESS:a/b` in the string so the line can sit before other text.
 */
export function parseEntityExtractionProgress(
	value: string | null | undefined
): { processed: number; total: number } | null {
	if (!value) return null;
	const match = PROGRESS_IN_MESSAGE.exec(value);
	if (!match) return null;
	const processed = Number.parseInt(match[1], 10);
	const total = Number.parseInt(match[2], 10);
	if (
		!Number.isFinite(processed) ||
		!Number.isFinite(total) ||
		total <= 0 ||
		processed < 0
	) {
		return null;
	}
	return { processed, total };
}

/**
 * Keep resume + UI progress when appending a rate-limit or timeout message.
 */
export function queueMessageWithProgress(
	previousQueueMessage: string | null | undefined,
	detail: string
): string {
	const prev = parseEntityExtractionProgress(previousQueueMessage);
	const body = detail.trim();
	if (!prev) return body;
	const line = `PROGRESS:${prev.processed}/${prev.total}`;
	if (!body) return line;
	return `${line}\n${body}`;
}

/** Integer percent indexed (processed chunks / total chunks), capped at 100. */
export function entityExtractionProgressPercent(
	value: string | null | undefined
): number | null {
	const parsed = parseEntityExtractionProgress(value);
	if (!parsed) return null;
	return chunkProgressPercent(parsed.processed, parsed.total);
}

/** Percent complete from chunk counts (same formula as PROGRESS:a/b). */
export function chunkProgressPercent(
	processed: number,
	total: number
): number | null {
	if (total <= 0 || processed < 0 || !Number.isFinite(processed + total)) {
		return null;
	}
	return Math.min(100, Math.round((processed / total) * 100));
}
