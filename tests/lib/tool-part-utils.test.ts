import { describe, expect, it } from "vitest";
import {
	getToolPartInfo,
	isComplete,
	isPendingConfirmation,
	isToolPart,
} from "@/lib/tool-part-utils";

describe("isToolPart", () => {
	it("returns false for null", () => {
		expect(isToolPart(null)).toBe(false);
	});

	it("returns false for non-object", () => {
		expect(isToolPart("string")).toBe(false);
		expect(isToolPart(42)).toBe(false);
	});

	it("returns false when type is missing", () => {
		expect(isToolPart({})).toBe(false);
	});

	it("returns true for legacy tool-invocation with toolInvocation", () => {
		expect(
			isToolPart({
				type: "tool-invocation",
				toolInvocation: { toolName: "x", toolCallId: "1", state: "call" },
			})
		).toBe(true);
	});

	it("returns false for tool-invocation without toolInvocation", () => {
		expect(isToolPart({ type: "tool-invocation" })).toBe(false);
	});

	it("returns true for typed tool part (tool-{name})", () => {
		expect(isToolPart({ type: "tool-searchCampaignContext" })).toBe(true);
	});
});

describe("getToolPartInfo", () => {
	it("returns null for null or non-object", () => {
		expect(getToolPartInfo(null)).toBeNull();
		expect(getToolPartInfo(undefined)).toBeNull();
		expect(getToolPartInfo("x")).toBeNull();
	});

	it("extracts legacy tool-invocation with state call", () => {
		const info = getToolPartInfo({
			type: "tool-invocation",
			toolInvocation: {
				toolName: "createCampaign",
				toolCallId: "tc-1",
				state: "call",
				args: { name: "Test" },
			},
		});
		expect(info).toEqual({
			toolName: "createCampaign",
			toolCallId: "tc-1",
			state: "input-available",
			input: { name: "Test" },
			output: undefined,
		});
	});

	it("extracts legacy tool-invocation with state result", () => {
		const info = getToolPartInfo({
			type: "tool-invocation",
			toolInvocation: {
				toolName: "createCampaign",
				toolCallId: "tc-1",
				state: "result",
				args: { name: "Test" },
				result: { success: true },
			},
		});
		expect(info).toEqual({
			toolName: "createCampaign",
			toolCallId: "tc-1",
			state: "output-available",
			input: { name: "Test" },
			output: { success: true },
		});
	});

	it("extracts legacy tool-invocation with other state", () => {
		const info = getToolPartInfo({
			type: "tool-invocation",
			toolInvocation: {
				toolName: "x",
				toolCallId: "1",
				state: "partial-call",
			},
		});
		expect(info?.state).toBe("partial-call");
	});

	it("extracts typed tool part with input-available", () => {
		const info = getToolPartInfo({
			type: "tool-searchCampaignContext",
			toolName: "searchCampaignContext",
			toolCallId: "tc-2",
			state: "input-available",
			input: { query: "monsters", campaignId: "c1" },
		});
		expect(info).toEqual({
			toolName: "searchCampaignContext",
			toolCallId: "tc-2",
			state: "input-available",
			input: { query: "monsters", campaignId: "c1" },
			output: undefined,
		});
	});

	it("extracts typed tool part with output-available", () => {
		const info = getToolPartInfo({
			type: "tool-searchCampaignContext",
			toolName: "searchCampaignContext",
			toolCallId: "tc-2",
			state: "output-available",
			input: { query: "monsters" },
			output: { results: [] },
		});
		expect(info?.state).toBe("output-available");
		expect(info?.output).toEqual({ results: [] });
	});

	it("derives toolName from type when toolName missing", () => {
		const info = getToolPartInfo({
			type: "tool-searchCampaignContext",
			toolCallId: "tc-3",
			state: "input-available",
		});
		expect(info?.toolName).toBe("searchCampaignContext");
	});

	it("returns null for non-tool part", () => {
		expect(getToolPartInfo({ type: "text", text: "hello" })).toBeNull();
	});
});

describe("isPendingConfirmation", () => {
	it("returns true for call and input-available", () => {
		expect(isPendingConfirmation("call")).toBe(true);
		expect(isPendingConfirmation("input-available")).toBe(true);
	});

	it("returns false for result and output-available", () => {
		expect(isPendingConfirmation("result")).toBe(false);
		expect(isPendingConfirmation("output-available")).toBe(false);
	});
});

describe("isComplete", () => {
	it("returns true for result and output-available", () => {
		expect(isComplete("result")).toBe(true);
		expect(isComplete("output-available")).toBe(true);
	});

	it("returns false for call and input-available", () => {
		expect(isComplete("call")).toBe(false);
		expect(isComplete("input-available")).toBe(false);
	});
});
