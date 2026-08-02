import type { Experiment } from "@/types/experiments";
import { CONTROL_VARIANT, DEFAULT_VARIANTS } from "@/types/experiments";

/**
 * Deterministic bucketing for runtime experiments (issue #755).
 *
 * There is no assignments table. A user's bucket is a pure function of
 * `(experimentKey, username)`, which buys three things at once:
 *
 * - **Sticky** across sessions, devices and isolates, with no storage and no
 *   read on the hot path.
 * - **Monotonic** under ramp: the bucket does not depend on `rolloutPct`, so
 *   raising 10 -> 25 only adds users to treatment. Nobody who already saw the
 *   new experience gets pulled back to control, which is exactly the property a
 *   naive random-assignment table fails to give you.
 * - **Independent** across experiments: the key is part of the hash input, so a
 *   user who lands in treatment for one experiment is not correlated into
 *   treatment for the next.
 *
 * The trade-off, accepted knowingly: assignments cannot be *frozen*. Changing
 * the hash, or an experiment's key, reshuffles everyone. If we ever need frozen
 * assignments across such a change we have to add the table after all.
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Buckets are 0-99 so `bucket < rolloutPct` reads as a straight percentage. */
export const BUCKET_COUNT = 100;

/**
 * FNV-1a over `key:username`, folded into 0-99.
 *
 * FNV-1a rather than a crypto hash because bucketing runs per flag check and
 * must stay synchronous — `crypto.subtle.digest` is async, and this is not a
 * security boundary. `Math.imul` is load-bearing: the FNV prime multiply
 * overflows the 53-bit float mantissa, so plain `*` would silently lose the low
 * bits and collapse the distribution.
 */
export function bucketFor(experimentKey: string, username: string): number {
	const input = `${experimentKey}:${username}`;
	let hash = FNV_OFFSET_BASIS;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, FNV_PRIME);
	}
	return (hash >>> 0) % BUCKET_COUNT;
}

/** Clamp a stored or user-supplied percentage into 0-100. */
export function clampRolloutPct(pct: number): number {
	if (!Number.isFinite(pct)) return 0;
	return Math.min(100, Math.max(0, Math.trunc(pct)));
}

/**
 * `variants[0]` is control and `variants[1]` is treatment. A malformed or
 * single-element array degrades to control-only rather than throwing, because a
 * bad row in the flags table must not take down every request that reads flags.
 */
export function armsOf(variants: string[] | undefined): {
	control: string;
	treatment: string;
} {
	const list =
		Array.isArray(variants) && variants.length > 0
			? variants
			: [...DEFAULT_VARIANTS];
	const control = list[0] ?? CONTROL_VARIANT;
	return { control, treatment: list[1] ?? control };
}

/**
 * The single place statuses turn into a variant. `off` is the kill switch, `on`
 * is full rollout, `experiment` is the only status that hashes.
 */
export function resolveVariant(
	experiment: Pick<Experiment, "key" | "status" | "rolloutPct" | "variants">,
	username: string
): string {
	const { control, treatment } = armsOf(experiment.variants);

	switch (experiment.status) {
		case "on":
			return treatment;
		case "experiment": {
			const pct = clampRolloutPct(experiment.rolloutPct);
			return bucketFor(experiment.key, username) < pct ? treatment : control;
		}
		default:
			return control;
	}
}

/** A flag is "enabled" when the user is on any arm other than control. */
export function isVariantEnabled(
	variant: string,
	variants: string[] | undefined
): boolean {
	return variant !== armsOf(variants).control;
}
