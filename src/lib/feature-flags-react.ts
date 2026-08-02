import { useExperimentContext } from "@/contexts/ExperimentContext";
import { getVariant, isFeatureEnabled } from "./feature-flags.js";

/**
 * React hook: returns whether the feature flag is enabled for the current user.
 *
 * Reads the context first so the component re-renders when assignments land,
 * and falls back to the module-level resolution (runtime map if present, else
 * the deprecated build-time `VITE_FEATURES`) when no provider is mounted — which
 * keeps this usable in unit tests and Storybook without extra wrapping.
 *
 * Signature is unchanged from the build-time implementation on purpose: existing
 * call sites compile untouched. See docs/FEATURE_FLAGS.md.
 */
export function useFeatureFlag(flag: string): boolean {
	const context = useExperimentContext();
	if (context && flag in context.flags) {
		return context.flags[flag];
	}
	return isFeatureEnabled(flag);
}

/**
 * React hook: returns the current user's arm for an experiment, e.g. `"control"`
 * or `"treatment"`.
 *
 * Use this instead of `useFeatureFlag` when the two arms are different
 * experiences rather than on/off, so the branch reads as a comparison rather
 * than as a negation.
 */
export function useVariant(key: string): string {
	const context = useExperimentContext();
	if (context && key in context.assignments) {
		return context.assignments[key];
	}
	return getVariant(key);
}
