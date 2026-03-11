/**
 * Feature flags baked at build time from GitHub Actions variable FEATURES (JSON).
 * Manage in GitHub: Settings → Environments → [environment] → Environment variables,
 * or Settings → Secrets and variables → Actions → Variables. Add variable FEATURES
 * with value e.g. {"newDashboard": true, "betaSearch": false}.
 */

const raw =
	typeof import.meta !== "undefined" &&
	import.meta.env &&
	typeof (import.meta.env as unknown as { VITE_FEATURES?: string })
		.VITE_FEATURES === "string"
		? (import.meta.env as unknown as { VITE_FEATURES: string }).VITE_FEATURES
		: "{}";

let parsed: Record<string, boolean> = {};
try {
	parsed = JSON.parse(raw) as Record<string, boolean>;
} catch {
	// ignore invalid JSON
}

/**
 * Returns true if the feature flag is enabled. Flags are set in GitHub (FEATURES JSON).
 */
export function isFeatureEnabled(flag: string): boolean {
	return Boolean(parsed[flag]);
}

/**
 * All flags as a read-only record (for debugging or bulk checks).
 */
export function getFeatureFlags(): Readonly<Record<string, boolean>> {
	return parsed;
}
