/**
 * Cloudflare D1 limits (bound parameters per single SQL statement).
 * @see https://developers.cloudflare.com/d1/platform/limits/
 */
export const D1_MAX_BOUND_PARAMETERS_PER_QUERY = 100;

/** Safe size for `WHERE col IN (?,?,…)` when that list is the only large bind group. */
export const D1_IN_LIST_CHUNK_SIZE = 90;

/**
 * Max rows per `INSERT … VALUES (?,?),…` when each tuple has `bindsPerRow` placeholders.
 * Stays under {@link D1_MAX_BOUND_PARAMETERS_PER_QUERY} with a small margin.
 */
export function d1MultiRowValuesChunkSize(bindsPerRow: number): number {
	if (bindsPerRow < 1) return 1;
	return Math.max(
		1,
		Math.floor(D1_MAX_BOUND_PARAMETERS_PER_QUERY / bindsPerRow) - 1
	);
}
