import { describe, expect, it } from "vitest";
import {
	AgentNotRegisteredError,
	AuthenticationRequiredError,
	EntityNotFoundError,
	EnvironmentVariableError,
	FileNotFoundError,
	LLMProviderAPIKeyError,
	MemoryLimitError,
	SearchPathValidationError,
} from "@/lib/errors";

describe("Error classes", () => {
	it("LLMProviderAPIKeyError has default message", () => {
		const err = new LLMProviderAPIKeyError();
		expect(err.message).toContain("API key");
		expect(err.name).toBe("LLMProviderAPIKeyError");
	});

	it("LLMProviderAPIKeyError accepts custom message", () => {
		const err = new LLMProviderAPIKeyError("Custom");
		expect(err.message).toBe("Custom");
	});

	it("AuthenticationRequiredError has default message", () => {
		const err = new AuthenticationRequiredError();
		expect(err.message).toContain("Authentication required");
	});

	it("FileNotFoundError includes fileKey when provided", () => {
		const err = new FileNotFoundError("my-file.pdf");
		expect(err.message).toContain("my-file.pdf");
	});

	it("FileNotFoundError has default when no fileKey", () => {
		const err = new FileNotFoundError();
		expect(err.message).toContain("File not found");
	});

	it("EntityNotFoundError formats with entityId and campaignId", () => {
		const err = new EntityNotFoundError("e1", "c1");
		expect(err.message).toContain("e1");
		expect(err.message).toContain("c1");
	});

	it("EntityNotFoundError formats with entityId only", () => {
		const err = new EntityNotFoundError("e1");
		expect(err.message).toContain("e1");
	});

	it("SearchPathValidationError includes path and optional reason", () => {
		const err = new SearchPathValidationError("/bad/path", "invalid");
		expect(err.message).toContain("/bad/path");
		expect(err.message).toContain("invalid");
	});

	it("AgentNotRegisteredError includes agent type", () => {
		const err = new AgentNotRegisteredError("myAgent");
		expect(err.message).toContain("myAgent");
	});

	it("MemoryLimitError has fileSizeMB and memoryLimitMB", () => {
		const err = new MemoryLimitError(50, 128, "key", "file.pdf");
		expect(err.fileSizeMB).toBe(50);
		expect(err.memoryLimitMB).toBe(128);
		expect(err.fileKey).toBe("key");
		expect(err.fileName).toBe("file.pdf");
	});

	it("MemoryLimitError.isMemoryLimitError detects instance", () => {
		const err = new MemoryLimitError(10, 128);
		expect(MemoryLimitError.isMemoryLimitError(err)).toBe(true);
		expect(MemoryLimitError.isMemoryLimitError(new Error("other"))).toBe(false);
	});

	it("MemoryLimitError.fromRuntimeError returns existing MemoryLimitError", () => {
		const err = new MemoryLimitError(10, 128);
		expect(MemoryLimitError.fromRuntimeError(err, 10, 128)).toBe(err);
	});

	it("MemoryLimitError.fromRuntimeError converts TypeError with memory message", () => {
		const typeErr = new TypeError("Memory limit would be exceeded");
		const result = MemoryLimitError.fromRuntimeError(
			typeErr,
			50,
			128,
			"key",
			"file.pdf"
		);
		expect(result).not.toBeNull();
		expect(result).toBeInstanceOf(MemoryLimitError);
		expect(result?.fileSizeMB).toBe(50);
	});

	it("MemoryLimitError.fromRuntimeError returns null for other errors", () => {
		expect(
			MemoryLimitError.fromRuntimeError(new Error("other"), 10, 128)
		).toBeNull();
	});

	it("EnvironmentVariableError includes var name", () => {
		const err = new EnvironmentVariableError("MY_VAR");
		expect(err.message).toContain("MY_VAR");
	});
});
