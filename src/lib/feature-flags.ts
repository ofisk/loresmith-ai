/**
 * Feature flag reads, resolved at runtime from D1 with a build-time fallback.
 *
 * Flags and A/B experiments live in the `experiments` table and are served per
 * user by `GET /api/experiments/assignments` (see docs/FEATURE_FLAGS.md).
 * `ExperimentProvider` fetches that map once at app start and pushes it in here
 * via {@link setRuntimeAssignments}.
 *
 * These functions stay **synchronous** on purpose. Making them async would churn
 * every call site and force flag checks into effects; instead the network read
 * happens once and this module holds the answer.
 *
 * DEPRECATED: the build-time `VITE_FEATURES` JSON (a GitHub Actions `FEATURES`
 * variable baked into the bundle) survives only as an offline fallback for when
 * the assignments fetch fails or has not landed yet. Do not add new flags there.
 */

const raw =
	typeof import.meta !== "undefined" &&
	import.meta.env &&
	typeof (import.meta.env as unknown as { VITE_FEATURES?: string })
		.VITE_FEATURES === "string"
		? (import.meta.env as unknown as { VITE_FEATURES: string }).VITE_FEATURES
		: "{}";

let buildTimeFlags: Record<string, boolean> = {};
try {
	buildTimeFlags = JSON.parse(raw) as Record<string, boolean>;
} catch {
	// ignore invalid JSON
}

/** Arm every unknown or disabled flag resolves to. Mirrors the server. */
const CONTROL = "control";

let runtimeVariants: Record<string, string> | null = null;
let runtimeFlags: Record<string, boolean> | null = null;

/**
 * Install the server-resolved assignment map.
 *
 * Layered, not replacing: a key the server has an opinion about wins, and a key
 * it has never heard of still reads from `VITE_FEATURES`. That is what makes the
 * cutover non-breaking — a flag can move from the GitHub variable to the
 * `experiments` table one row at a time, and a build-time flag that nobody has
 * created a DB row for yet keeps working.
 */
export function setRuntimeAssignments(
	variants: Record<string, string>,
	flags: Record<string, boolean>
): void {
	runtimeVariants = variants;
	runtimeFlags = flags;
}

/** Drop the runtime layer (logout, or a test). Reads fall back to build time. */
export function clearRuntimeAssignments(): void {
	runtimeVariants = null;
	runtimeFlags = null;
}

/** True once a successful assignments fetch has landed. */
export function hasRuntimeAssignments(): boolean {
	return runtimeFlags !== null;
}

/**
 * Returns true if the feature is enabled for the current user.
 *
 * Enabled means "on any arm other than control", so a flag and the treatment arm
 * of an experiment are the same question.
 */
export function isFeatureEnabled(flag: string): boolean {
	if (runtimeFlags && flag in runtimeFlags) {
		return runtimeFlags[flag];
	}
	return Boolean(buildTimeFlags[flag]);
}

/**
 * The current user's arm for an experiment, e.g. `"control"` or `"treatment"`.
 *
 * Falls back to projecting the build-time boolean onto the two default arms, so
 * a `useVariant` call site behaves sanely before assignments arrive.
 */
export function getVariant(key: string): string {
	if (runtimeVariants && key in runtimeVariants) {
		return runtimeVariants[key];
	}
	return buildTimeFlags[key] ? "treatment" : CONTROL;
}

/**
 * All flags as a read-only record (for debugging or bulk checks).
 */
export function getFeatureFlags(): Readonly<Record<string, boolean>> {
	return runtimeFlags ? { ...buildTimeFlags, ...runtimeFlags } : buildTimeFlags;
}

/** All resolved arms, keyed by experiment. Empty before assignments arrive. */
export function getVariants(): Readonly<Record<string, string>> {
	return runtimeVariants ?? {};
}

/** The deprecated build-time layer on its own, for the admin panel's "fallback" column. */
export function getBuildTimeFlags(): Readonly<Record<string, boolean>> {
	return buildTimeFlags;
}
