import { test as base, expect } from "@playwright/test";

/**
 * Log when a test passes on retry (flaky test detection).
 * Helps identify tests that need stabilization.
 */
base.afterEach(async (_fixtures, testInfo) => {
	if (testInfo.retry > 0 && testInfo.status === "passed") {
		console.warn(
			`FLAKY: ${testInfo.titlePath.join(" > ")} passed on retry ${testInfo.retry}`
		);
	}
});

export const test = base;
export { expect };
