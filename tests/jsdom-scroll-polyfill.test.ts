// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

/**
 * jsdom ships no scroll methods, so `element.scrollTo(...)` throws
 * "scrollTo is not a function". Chat auto-scroll calls it from a 100ms timer
 * (src/hooks/useChatSession.ts), which can fire after the scheduling test has
 * finished — the throw then lands as an unhandled error that fails the whole
 * vitest run even when every test passed. tests/setup.ts installs a no-op so
 * that cannot happen; this locks the polyfill in place.
 */
describe("jsdom scroll polyfill", () => {
	it("makes scrollTo callable with the options form used by chat auto-scroll", () => {
		const container = document.createElement("div");
		document.body.appendChild(container);

		expect(typeof container.scrollTo).toBe("function");
		expect(() =>
			container.scrollTo({ top: container.scrollHeight, behavior: "smooth" })
		).not.toThrow();
	});

	it("survives a scroll scheduled by a timer that outlives its caller", async () => {
		const container = document.createElement("div");
		document.body.appendChild(container);

		let thrown: unknown = null;
		setTimeout(() => {
			try {
				container.scrollTo({ top: 100, behavior: "smooth" });
			} catch (error) {
				thrown = error;
			}
		}, 1);

		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(thrown).toBeNull();
	});
});
