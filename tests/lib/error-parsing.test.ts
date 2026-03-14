import { describe, expect, it } from "vitest";
import {
	formatErrorForNotification,
	formatErrorMessage,
	type ParsedError,
	parseErrorResponse,
} from "@/lib/error-parsing";

describe("error-parsing", () => {
	describe("parseErrorResponse", () => {
		it("parses JSON error with error field", () => {
			const result = parseErrorResponse(
				JSON.stringify({ error: "Something went wrong" })
			);
			expect(result.message).toBe("Something went wrong");
			expect(result.isActionable).toBe(true);
		});

		it("parses JSON error with message field", () => {
			const result = parseErrorResponse(
				JSON.stringify({ message: "Server error" })
			);
			expect(result.message).toBe("Server error");
			expect(result.isActionable).toBe(true);
		});

		it("extracts string from JSON error when error field is object", () => {
			const result = parseErrorResponse(
				JSON.stringify({
					error: { code: "ERR", message: "File indexing in progress" },
				})
			);
			expect(result.message).toBe("File indexing in progress");
		});

		it("parses HTML memory limit error", () => {
			const html = "<html><body>Worker exceeded memory limit</body></html>";
			const result = parseErrorResponse(html);
			expect(result.message).toBe("The file is too large to process");
			expect(result.isActionable).toBe(true);
			expect(result.suggestion).toBeDefined();
		});

		it("parses HTML timeout error", () => {
			const html = "<html><body>Worker error: timeout occurred</body></html>";
			const result = parseErrorResponse(html);
			expect(result.message).toBe("The operation took too long to complete");
			expect(result.isActionable).toBe(true);
		});

		it("returns 413 message for status 413", () => {
			const html = "<html><body>Error</body></html>";
			const result = parseErrorResponse(html, 413);
			expect(result.message).toBe("The file is too large to upload");
		});

		it("returns 429 message for status 429", () => {
			const html = "<html><body>Error</body></html>";
			const result = parseErrorResponse(html, 429);
			expect(result.message).toBe("Too many requests - please wait a moment");
		});

		it("extracts title from HTML when no special case", () => {
			const html = "<html><head><title>Custom Error Page</title></head></html>";
			const result = parseErrorResponse(html);
			expect(result.message).toBe("Custom Error Page");
		});

		it("truncates long plain text to 200 chars", () => {
			const longText = "x".repeat(300);
			const result = parseErrorResponse(longText);
			expect(result.message.length).toBe(203); // 200 + "..."
			expect(result.message.endsWith("...")).toBe(true);
		});

		it("handles plain text error", () => {
			const result = parseErrorResponse("Simple error message");
			expect(result.message).toBe("Simple error message");
			expect(result.isActionable).toBe(false);
		});
	});

	describe("formatErrorForNotification", () => {
		it("combines message and suggestion when both present", () => {
			const parsed: ParsedError = {
				message: "Upload failed",
				isActionable: true,
				suggestion: "Try again later",
			};
			expect(formatErrorForNotification(parsed)).toBe(
				"Upload failed. Try again later"
			);
		});

		it("returns only message when no suggestion", () => {
			const parsed: ParsedError = {
				message: "Upload failed",
				isActionable: false,
			};
			expect(formatErrorForNotification(parsed)).toBe("Upload failed");
		});
	});

	describe("formatErrorMessage", () => {
		it("extracts message from Error instance", () => {
			expect(formatErrorMessage(new Error("Something failed"))).toBe(
				"Something failed"
			);
		});

		it("avoids [object Object] for plain objects", () => {
			expect(formatErrorMessage({ code: "ERR" })).not.toBe("[object Object]");
			expect(formatErrorMessage({ code: "ERR" })).toBe('{"code":"ERR"}');
		});
	});
});
