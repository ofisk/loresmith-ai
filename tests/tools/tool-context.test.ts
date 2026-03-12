import { describe, expect, it } from "vitest";
import { resolveToolContext } from "@/tools/tool-context";

describe("tool-context", () => {
	describe("resolveToolContext", () => {
		it("returns error when env is not available", () => {
			const result = resolveToolContext({}, "test-id");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.message).toBe("Environment not available");
				expect(result.error.code).toBe(500);
			}
		});

		it("uses custom error messages when provided", () => {
			const result = resolveToolContext({}, "test-id", {
				notAvailable: "Custom message",
				detail: "Custom detail",
			});
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.message).toBe("Custom message");
				expect(result.error.detail).toBe("Custom detail");
			}
		});

		it("returns context when env is present in options", () => {
			const mockEnv = { DB: {}, VECTORIZE: {} } as any;
			const result = resolveToolContext({ env: mockEnv }, "test-id");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.context.env).toBe(mockEnv);
				expect(result.context.daoFactory).toBeDefined();
			}
		});
	});
});
