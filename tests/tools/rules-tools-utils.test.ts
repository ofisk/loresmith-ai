import { describe, expect, it } from "vitest";
import { RULES_CONTEXT_ERRORS } from "@/tools/campaign-context/rules-tools-utils";

describe("rules-tools-utils", () => {
	it("exports error message constants", () => {
		expect(RULES_CONTEXT_ERRORS.envNotAvailable).toBe(
			"Environment not available"
		);
		expect(RULES_CONTEXT_ERRORS.envNotAvailableDetail).toContain(
			"Direct database access"
		);
		expect(RULES_CONTEXT_ERRORS.resolveFailed).toBe(
			"Failed to resolve campaign rules context"
		);
	});
});
