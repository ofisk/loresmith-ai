import { isFeatureEnabled } from "./feature-flags.js";

/**
 * React hook: returns whether the feature flag is enabled.
 * Flags are set in GitHub (FEATURES variable, JSON).
 */
export function useFeatureFlag(flag: string): boolean {
	return isFeatureEnabled(flag);
}
