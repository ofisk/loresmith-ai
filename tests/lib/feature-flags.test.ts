import { afterEach, describe, expect, it } from "vitest";
import {
	clearRuntimeAssignments,
	getBuildTimeFlags,
	getFeatureFlags,
	getVariant,
	getVariants,
	hasRuntimeAssignments,
	isFeatureEnabled,
	setRuntimeAssignments,
} from "@/lib/feature-flags";

/**
 * `VITE_FEATURES` is not set under Vitest, so the build-time layer is empty and
 * these tests exercise the runtime layer and the fallback boundary between them.
 */
afterEach(() => {
	clearRuntimeAssignments();
});

describe("before assignments arrive", () => {
	it("reports that no runtime layer is installed", () => {
		expect(hasRuntimeAssignments()).toBe(false);
	});

	it("falls back to the build-time flags", () => {
		expect(isFeatureEnabled("anything")).toBe(
			Boolean(getBuildTimeFlags().anything)
		);
	});

	it("projects a build-time boolean onto the default arms", () => {
		expect(getVariant("anything")).toBe("control");
	});

	it("has no variants to report", () => {
		expect(getVariants()).toEqual({});
	});
});

describe("after assignments arrive", () => {
	it("serves the server-resolved value", () => {
		setRuntimeAssignments(
			{ newDashboard: "treatment", betaSearch: "control" },
			{ newDashboard: true, betaSearch: false }
		);

		expect(hasRuntimeAssignments()).toBe(true);
		expect(isFeatureEnabled("newDashboard")).toBe(true);
		expect(isFeatureEnabled("betaSearch")).toBe(false);
		expect(getVariant("newDashboard")).toBe("treatment");
	});

	it("exposes custom arm names, not just booleans", () => {
		setRuntimeAssignments({ copyTest: "new-copy" }, { copyTest: true });

		expect(getVariant("copyTest")).toBe("new-copy");
		expect(getVariants()).toEqual({ copyTest: "new-copy" });
	});

	it("layers over the build-time flags rather than replacing them", () => {
		setRuntimeAssignments({ knownKey: "treatment" }, { knownKey: true });

		// A key the server has an opinion about wins...
		expect(isFeatureEnabled("knownKey")).toBe(true);
		// ...and one it has never heard of still reads from the build-time layer,
		// which is what lets flags migrate to the table one row at a time.
		expect(isFeatureEnabled("neverMigrated")).toBe(
			Boolean(getBuildTimeFlags().neverMigrated)
		);
	});

	it("merges both layers in getFeatureFlags", () => {
		setRuntimeAssignments({ a: "treatment" }, { a: true });

		expect(getFeatureFlags()).toMatchObject({
			...getBuildTimeFlags(),
			a: true,
		});
	});

	it("keeps a server-disabled flag disabled even if it is on at build time", () => {
		setRuntimeAssignments({ a: "control" }, { a: false });

		// This is the kill switch: the DB says off, so off it is.
		expect(isFeatureEnabled("a")).toBe(false);
		expect(getVariant("a")).toBe("control");
	});
});

describe("clearRuntimeAssignments", () => {
	it("drops back to the build-time layer", () => {
		setRuntimeAssignments({ a: "treatment" }, { a: true });
		expect(isFeatureEnabled("a")).toBe(true);

		clearRuntimeAssignments();

		expect(hasRuntimeAssignments()).toBe(false);
		expect(isFeatureEnabled("a")).toBe(Boolean(getBuildTimeFlags().a));
	});
});
