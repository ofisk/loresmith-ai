/**
 * Pure helpers for rules-context tools. Error messages and env-check logic.
 */

export const RULES_CONTEXT_ERRORS = {
	envNotAvailable: "Environment not available",
	envNotAvailableDetail:
		"Direct database access is required for campaign rules resolution.",
	resolveFailed: "Failed to resolve campaign rules context",
} as const;
