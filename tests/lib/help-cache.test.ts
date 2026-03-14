// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCachedHelp, setCachedHelp } from "@/lib/help-cache";

describe("help-cache", () => {
	beforeEach(() => {
		sessionStorage.clear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("getCachedHelp returns null when nothing cached", () => {
		expect(getCachedHelp("open_help")).toBeNull();
	});

	it("setCachedHelp and getCachedHelp roundtrip", () => {
		setCachedHelp("open_help", "Hello, this is help content.");
		expect(getCachedHelp("open_help")).toBe("Hello, this is help content.");
	});

	it("getCachedHelp returns null for expired cache", () => {
		vi.useFakeTimers();
		try {
			setCachedHelp("open_help", "Content");
			vi.advanceTimersByTime(11 * 60 * 1000); // 11 minutes
			expect(getCachedHelp("open_help")).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it("getCachedHelp returns null for invalid JSON", () => {
		sessionStorage.setItem("loresmith-help-cache-open_help", "not-json");
		expect(getCachedHelp("open_help")).toBeNull();
	});

	it("getCachedHelp returns null when content is missing", () => {
		sessionStorage.setItem(
			"loresmith-help-cache-open_help",
			JSON.stringify({ timestamp: Date.now() })
		);
		expect(getCachedHelp("open_help")).toBeNull();
	});

	it("getCachedHelp returns null when content is not string", () => {
		sessionStorage.setItem(
			"loresmith-help-cache-open_help",
			JSON.stringify({ content: 123, timestamp: Date.now() })
		);
		expect(getCachedHelp("open_help")).toBeNull();
	});
});
