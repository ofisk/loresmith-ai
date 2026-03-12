import { describe, expect, it } from "vitest";
import {
	createAuthHeaders,
	createToolError,
	createToolSuccess,
	extractUsernameFromJwt,
	formatMessageWithCampaign,
} from "@/tools/tool-utils";

describe("tool-utils", () => {
	describe("formatMessageWithCampaign", () => {
		it("returns message unchanged when no campaign name", () => {
			expect(formatMessageWithCampaign("Done", null)).toBe("Done");
			expect(formatMessageWithCampaign("Done", undefined)).toBe("Done");
			expect(formatMessageWithCampaign("Done", "")).toBe("Done");
		});

		it("appends campaign context when campaign name provided", () => {
			expect(formatMessageWithCampaign("Done", "My Campaign")).toBe(
				'Done for campaign "My Campaign"'
			);
		});
	});

	describe("extractUsernameFromJwt", () => {
		function makeJwt(username: string): string {
			const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
			const payload = btoa(JSON.stringify({ username }));
			const sig = btoa("signature");
			return `${header}.${payload}.${sig}`;
		}

		it("returns empty string for null/undefined", () => {
			expect(extractUsernameFromJwt(null)).toBe("");
			expect(extractUsernameFromJwt(undefined)).toBe("");
		});

		it("extracts username from valid JWT", () => {
			const jwt = makeJwt("alice");
			expect(extractUsernameFromJwt(jwt)).toBe("alice");
		});

		it("returns empty for invalid JWT (wrong part count)", () => {
			expect(extractUsernameFromJwt("a.b")).toBe("");
			expect(extractUsernameFromJwt("a")).toBe("");
		});

		it("returns empty for invalid base64", () => {
			expect(extractUsernameFromJwt("a.!!!.c")).toBe("");
		});

		it("handles base64url padding", () => {
			// JWT uses base64url; payload may need padding
			const payload = JSON.stringify({ username: "bob" });
			const encoded = btoa(payload)
				.replace(/\+/g, "-")
				.replace(/\//g, "_")
				.replace(/=+$/, "");
			const jwt = `eyJhbGciOiJIUzI1NiJ9.${encoded}.sig`;
			expect(extractUsernameFromJwt(jwt)).toBe("bob");
		});
	});

	describe("createAuthHeaders", () => {
		it("includes Content-Type", () => {
			expect(createAuthHeaders()).toEqual({
				"Content-Type": "application/json",
			});
		});

		it("adds Authorization when JWT provided", () => {
			expect(createAuthHeaders("token123")).toEqual({
				"Content-Type": "application/json",
				Authorization: "Bearer token123",
			});
		});

		it("omits Authorization when JWT is null/undefined", () => {
			expect(createAuthHeaders(null)).toEqual({
				"Content-Type": "application/json",
			});
			expect(createAuthHeaders(undefined)).toEqual({
				"Content-Type": "application/json",
			});
		});
	});

	describe("createToolError", () => {
		it("returns error ToolResult with message and code", () => {
			const result = createToolError(
				"Failed",
				new Error("detail"),
				500,
				"tc-1"
			);
			expect(result.toolCallId).toBe("tc-1");
			expect(result.result.success).toBe(false);
			expect(result.result.message).toBe("Failed");
			expect(result.result.data.error).toBe("detail");
			expect(result.result.data.errorCode).toBe(500);
		});

		it("includes campaign name when provided", () => {
			const result = createToolError(
				"Failed",
				"err",
				404,
				"tc-2",
				null,
				"Campaign X"
			);
			expect(result.result.message).toBe('Failed for campaign "Campaign X"');
			expect(result.result.data.campaignName).toBe("Campaign X");
		});

		it("stringifies non-Error values", () => {
			const result = createToolError("Fail", 123, 400, "tc-3");
			expect(result.result.data.error).toBe("123");
		});
	});

	describe("createToolSuccess", () => {
		it("returns success ToolResult with data", () => {
			const result = createToolSuccess(
				"Done",
				{ id: "1", name: "test" },
				"tc-1"
			);
			expect(result.toolCallId).toBe("tc-1");
			expect(result.result.success).toBe(true);
			expect(result.result.message).toBe("Done");
			expect(result.result.data.id).toBe("1");
			expect(result.result.data.name).toBe("test");
		});

		it("includes campaign name when provided", () => {
			const result = createToolSuccess(
				"Done",
				{ count: 5 },
				"tc-2",
				null,
				"My Campaign"
			);
			expect(result.result.message).toBe('Done for campaign "My Campaign"');
			expect(result.result.data.campaignName).toBe("My Campaign");
			expect(result.result.data.count).toBe(5);
		});

		it("wraps primitive data in data key", () => {
			const result = createToolSuccess("OK", "raw string", "tc-3");
			expect(result.result.data.data).toBe("raw string");
		});
	});
});
