import { describe, expect, it } from "vitest";
import {
	armsOf,
	BUCKET_COUNT,
	bucketFor,
	clampRolloutPct,
	isVariantEnabled,
	resolveVariant,
} from "@/lib/experiment-bucketing";
import type { Experiment } from "@/types/experiments";

function experiment(
	overrides: Partial<
		Pick<Experiment, "key" | "status" | "rolloutPct" | "variants">
	> = {}
): Pick<Experiment, "key" | "status" | "rolloutPct" | "variants"> {
	return {
		key: "newDashboard",
		status: "experiment",
		rolloutPct: 50,
		variants: ["control", "treatment"],
		...overrides,
	};
}

const USERS = Array.from({ length: 5000 }, (_, i) => `user-${i}`);

describe("bucketFor", () => {
	it("always lands in 0-99", () => {
		for (const username of USERS.slice(0, 500)) {
			const bucket = bucketFor("someKey", username);
			expect(bucket).toBeGreaterThanOrEqual(0);
			expect(bucket).toBeLessThan(BUCKET_COUNT);
			expect(Number.isInteger(bucket)).toBe(true);
		}
	});

	it("is sticky: the same (key, user) always gives the same bucket", () => {
		for (const username of USERS.slice(0, 200)) {
			expect(bucketFor("someKey", username)).toBe(
				bucketFor("someKey", username)
			);
		}
	});

	it("spreads users roughly evenly across buckets", () => {
		const counts = new Array<number>(BUCKET_COUNT).fill(0);
		for (const username of USERS) {
			counts[bucketFor("newDashboard", username)] += 1;
		}

		// 5000 users over 100 buckets is 50 expected per bucket. A wide band —
		// this asserts the hash is not degenerate, not that it is a CSPRNG.
		const expected = USERS.length / BUCKET_COUNT;
		for (const count of counts) {
			expect(count).toBeGreaterThan(expected * 0.4);
			expect(count).toBeLessThan(expected * 1.8);
		}
	});

	it("decorrelates experiments: a user's bucket differs across keys", () => {
		const sameBucket = USERS.filter(
			(u) => bucketFor("experimentA", u) === bucketFor("experimentB", u)
		);
		// Independent hashes collide ~1% of the time; anything near 100% would mean
		// the key is not actually part of the hash input.
		expect(sameBucket.length).toBeLessThan(USERS.length * 0.05);
	});
});

describe("resolveVariant", () => {
	it("gives everyone control when off", () => {
		for (const username of USERS.slice(0, 100)) {
			expect(resolveVariant(experiment({ status: "off" }), username)).toBe(
				"control"
			);
		}
	});

	it("gives everyone treatment when on, regardless of rollout percentage", () => {
		for (const username of USERS.slice(0, 100)) {
			expect(
				resolveVariant(experiment({ status: "on", rolloutPct: 0 }), username)
			).toBe("treatment");
		}
	});

	it("splits traffic near the configured percentage", () => {
		const treated = USERS.filter(
			(u) => resolveVariant(experiment({ rolloutPct: 25 }), u) === "treatment"
		);
		const ratio = treated.length / USERS.length;
		expect(ratio).toBeGreaterThan(0.2);
		expect(ratio).toBeLessThan(0.3);
	});

	it("puts nobody in treatment at 0% and everybody at 100%", () => {
		const none = USERS.filter(
			(u) => resolveVariant(experiment({ rolloutPct: 0 }), u) === "treatment"
		);
		const all = USERS.filter(
			(u) => resolveVariant(experiment({ rolloutPct: 100 }), u) === "treatment"
		);
		expect(none).toHaveLength(0);
		expect(all).toHaveLength(USERS.length);
	});

	it("ramps monotonically: raising the percentage never removes a user from treatment", () => {
		let previous = new Set<string>();

		for (const pct of [0, 5, 10, 25, 50, 75, 90, 100]) {
			const current = new Set(
				USERS.filter(
					(u) =>
						resolveVariant(experiment({ rolloutPct: pct }), u) === "treatment"
				)
			);

			// This is the property that makes a gradual rollout safe, and the reason
			// there is no assignments table: everyone already in treatment stays.
			for (const user of previous) {
				expect(current.has(user)).toBe(true);
			}
			expect(current.size).toBeGreaterThanOrEqual(previous.size);
			previous = current;
		}
	});

	it("is sticky across sessions for the same user", () => {
		const exp = experiment({ rolloutPct: 37 });
		for (const username of USERS.slice(0, 300)) {
			const first = resolveVariant(exp, username);
			expect(resolveVariant(exp, username)).toBe(first);
			expect(resolveVariant({ ...exp }, username)).toBe(first);
		}
	});

	it("honours custom arm names", () => {
		const exp = experiment({
			status: "on",
			variants: ["old-copy", "new-copy"],
		});
		expect(resolveVariant(exp, "someone")).toBe("new-copy");
	});

	it("falls back to the default arms for a malformed variants array rather than throwing", () => {
		// An empty array carries no arm names, so the default pair is used and the
		// row's status still decides — an admin who set `on` gets treatment.
		expect(
			resolveVariant(
				experiment({ status: "on", variants: [] as unknown as string[] }),
				"someone"
			)
		).toBe("treatment");
		// A single-arm row has no treatment to give, so everyone stays on control.
		expect(
			resolveVariant(
				experiment({ status: "on", variants: ["solo"] }),
				"someone"
			)
		).toBe("solo");
		expect(
			resolveVariant(
				experiment({
					status: "experiment",
					rolloutPct: 100,
					variants: ["solo"],
				}),
				"someone"
			)
		).toBe("solo");
	});
});

describe("clampRolloutPct", () => {
	it.each([
		[-10, 0],
		[0, 0],
		[42, 42],
		[100, 100],
		[5000, 100],
		[42.9, 42],
		[Number.NaN, 0],
		[Number.POSITIVE_INFINITY, 0],
	])("clamps %s to %s", (input, expected) => {
		expect(clampRolloutPct(input)).toBe(expected);
	});
});

describe("armsOf / isVariantEnabled", () => {
	it("treats index 0 as control and index 1 as treatment", () => {
		expect(armsOf(["a", "b", "c"])).toEqual({ control: "a", treatment: "b" });
	});

	it("falls back to the default arms when given nothing", () => {
		expect(armsOf(undefined)).toEqual({
			control: "control",
			treatment: "treatment",
		});
	});

	it("counts any non-control arm as enabled", () => {
		expect(isVariantEnabled("treatment", ["control", "treatment"])).toBe(true);
		expect(isVariantEnabled("control", ["control", "treatment"])).toBe(false);
		expect(isVariantEnabled("old", ["old", "new"])).toBe(false);
	});
});
