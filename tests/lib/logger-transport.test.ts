import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger, logger } from "@/lib/logger";

/**
 * Regression guard for PR #552, which removed the console.* calls from tslog's
 * `transportFormatted` overwrite in src/lib/logger.ts. Because that overwrite
 * REPLACES tslog's built-in transport, every branch became a bare `return` and
 * the application emitted no logs at all -- for ~5 months, across every level.
 *
 * The failure mode is silence, so it is invisible to any test that only checks
 * that logging doesn't throw. These assert that log calls actually reach console.
 */
describe("logger transport", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("writes error-level logs to console.error", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});

		createLogger({}, "[Test]").error("upload exploded");

		expect(spy).toHaveBeenCalled();
		expect(
			spy.mock.calls.flat().some((a) => String(a).includes("upload exploded"))
		).toBe(true);
	});

	it("keeps Error objects inspectable in the argument list", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const boom = new Error("no such column: id");

		createLogger({}, "[Test]").error("insert failed", boom);

		expect(spy.mock.calls.flat()).toContain(boom);
	});

	it("writes warn-level logs to console.warn", () => {
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

		createLogger({}, "[Test]").warn("heads up");

		expect(spy).toHaveBeenCalled();
	});

	it("writes info-level logs to console.info", () => {
		const spy = vi.spyOn(console, "info").mockImplementation(() => {});

		createLogger({}, "[Test]").info("hello");

		expect(spy).toHaveBeenCalled();
	});

	it("writes each log exactly once", () => {
		// The module owns the sink twice over: the pretty middleware ends tslog's
		// pipeline, and `type: "hidden"` silences its built-in output. Remove both and
		// every line is written twice, so count across all four console channels
		// rather than just the one this level is expected to use.
		const calls: string[] = [];
		for (const method of ["log", "info", "warn", "error"] as const) {
			vi.spyOn(console, method).mockImplementation(() => {
				calls.push(method);
			});
		}

		createLogger({}, "[Test]").error("only once");

		expect(calls).toEqual(["error"]);
	});

	it("writes scoped-logger errors to console.error", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});

		logger.scope("[DirectUpload]").error("Failed to insert file metadata");

		expect(spy).toHaveBeenCalled();
		expect(
			spy.mock.calls
				.flat()
				.some((a) => String(a).includes("Failed to insert file metadata"))
		).toBe(true);
	});
});
