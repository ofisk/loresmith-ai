import { describe, expect, it } from "vitest";
import {
	estimateProcessingTime,
	evaluateTimeout,
	formatProcessingTime,
	getChatAgentEstimate,
	getProcessingTimeMessage,
	getTimeoutSeconds,
} from "@/lib/file/processing-time-estimator";

describe("processing-time-estimator", () => {
	describe("estimateProcessingTime", () => {
		it("returns small for < 1MB", () => {
			const result = estimateProcessingTime(500 * 1024); // 500KB
			expect(result.category).toBe("small");
			expect(result.estimatedMinutes).toBe(0.75);
			expect(result.description).toContain("Small file");
		});

		it("returns medium for 1-10MB", () => {
			const result = estimateProcessingTime(5 * 1024 * 1024); // 5MB
			expect(result.category).toBe("medium");
			expect(result.estimatedMinutes).toBe(2);
		});

		it("returns large for 10-50MB", () => {
			const result = estimateProcessingTime(25 * 1024 * 1024); // 25MB
			expect(result.category).toBe("large");
			expect(result.estimatedMinutes).toBe(6);
		});

		it("returns very-large for > 50MB", () => {
			const result = estimateProcessingTime(100 * 1024 * 1024); // 100MB
			expect(result.category).toBe("very-large");
			expect(result.estimatedMinutes).toBe(15);
		});
	});

	describe("getTimeoutSeconds", () => {
		it("applies buffer multiplier", () => {
			const result = getTimeoutSeconds(500 * 1024, 1.5);
			expect(result).toBeGreaterThan(0);
			expect(result).toBe(Math.floor(result));
		});

		it("clamps to min 120s for very small files", () => {
			const result = getTimeoutSeconds(100, 1);
			expect(result).toBeGreaterThanOrEqual(120);
		});
	});

	describe("evaluateTimeout", () => {
		it("returns timedOut true when age exceeds timeout", () => {
			// Small file: timeout is clamped to min 120s. Use 200s ago to exceed it.
			const past = Date.now() - 200 * 1000; // 200 seconds ago
			const result = evaluateTimeout(100, past, 1); // 100 bytes = tiny file
			expect(result.timedOut).toBe(true);
			expect(result.ageSeconds).toBeGreaterThan(result.timeoutSeconds);
		});

		it("accepts Date as referenceTime", () => {
			const past = new Date(Date.now() - 1000);
			const result = evaluateTimeout(500 * 1024, past);
			expect(result.ageSeconds).toBeGreaterThan(0);
		});
	});

	describe("formatProcessingTime", () => {
		it("formats seconds when under 1 minute", () => {
			expect(
				formatProcessingTime({
					estimatedMinutes: 0.5,
					estimatedSeconds: 30,
					category: "small",
					description: "",
				})
			).toBe("30 seconds");
		});

		it("formats minutes when under 60", () => {
			expect(
				formatProcessingTime({
					estimatedMinutes: 5,
					estimatedSeconds: 300,
					category: "medium",
					description: "",
				})
			).toBe("5 minutes");
		});

		it("formats hours when 60+ minutes", () => {
			expect(
				formatProcessingTime({
					estimatedMinutes: 90,
					estimatedSeconds: 5400,
					category: "very-large",
					description: "",
				})
			).toBe("1h 30m");
		});
	});

	describe("getProcessingTimeMessage", () => {
		it("returns message with description and time", () => {
			const msg = getProcessingTimeMessage(500 * 1024, "test.pdf");
			expect(msg).toContain("Estimated processing time");
			expect(msg).toContain("Small file");
		});
	});

	describe("getChatAgentEstimate", () => {
		it("includes file name and size", () => {
			const msg = getChatAgentEstimate(
				5 * 1024 * 1024, // 5MB
				"document.pdf"
			);
			expect(msg).toContain("document.pdf");
			expect(msg).toContain("5.0");
			expect(msg).toContain("MB");
		});
	});
});
