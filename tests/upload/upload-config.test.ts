import { describe, expect, it } from "vitest";
import { PROCESSING_LIMITS, UPLOAD_CONFIG } from "../../src/app-constants";

describe("Upload config", () => {
	it("MAX_FILE_SIZE allows uploads up to 500MB", () => {
		const fiveHundredMB = 500 * 1024 * 1024;
		expect(UPLOAD_CONFIG.MAX_FILE_SIZE).toBe(fiveHundredMB);
	});
});

describe("Processing limits", () => {
	it("MEMORY_LIMIT_MB is 128 for single-buffer limits (chunking uses R2 range)", () => {
		expect(PROCESSING_LIMITS.MEMORY_LIMIT_MB).toBe(128);
	});
});
