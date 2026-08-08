import { describe, expect, it } from "vitest";
import {
	collectTouchedIds,
	MAX_SUMMARY_BYTES,
	parseSummary,
	serializeSummary,
	summarizeToolInput,
	summarizeToolResult,
} from "@/lib/agent-activity-summary";

describe("summarizeToolInput", () => {
	it("redacts the JWT the tool wrapper injects, and keeps the key", () => {
		const summary = summarizeToolInput({
			jwt: "eyJhbGciOiJIUzI1NiJ9.real.token",
			campaignId: "camp-1",
		});

		expect(summary.jwt).toBe("[redacted]");
		expect(summary.campaignId).toBe("camp-1");
	});

	it("redacts secret-shaped keys it has never seen before", () => {
		const summary = summarizeToolInput({
			stripeApiKey: "sk_live_123",
			refreshToken: "rt_123",
			userPassword: "hunter2",
			name: "Gandalf",
		});

		expect(summary.stripeApiKey).toBe("[redacted]");
		expect(summary.refreshToken).toBe("[redacted]");
		expect(summary.userPassword).toBe("[redacted]");
		expect(summary.name).toBe("Gandalf");
	});

	it("truncates long values instead of storing them whole", () => {
		const summary = summarizeToolInput({ query: "x".repeat(500) });
		expect(summary.query.length).toBeLessThan(200);
		expect(summary.query.endsWith("…")).toBe(true);
	});

	it("describes arrays and objects by shape, not content", () => {
		const summary = summarizeToolInput({ ids: ["a", "b", "c"] });
		expect(summary.ids).toBe("[3 items]");
	});

	it("returns an empty map for non-object input", () => {
		expect(summarizeToolInput(null)).toEqual({});
		expect(summarizeToolInput("text")).toEqual({});
		expect(summarizeToolInput([1, 2])).toEqual({});
	});
});

describe("collectTouchedIds", () => {
	it("finds ids nested inside a tool result envelope", () => {
		const touched = collectTouchedIds({
			result: {
				data: {
					entities: [{ id: "ent-1" }, { id: "ent-2" }],
					fileKey: "uploads/book.pdf",
				},
			},
		});

		expect(touched?.entityIds).toEqual(["ent-1", "ent-2"]);
		expect(touched?.fileKeys).toEqual(["uploads/book.pdf"]);
	});

	it("caps how many ids one bulk action can contribute", () => {
		const touched = collectTouchedIds({
			entities: Array.from({ length: 50 }, (_, i) => ({ id: `ent-${i}` })),
		});
		expect(touched?.entityIds?.length).toBe(10);
	});

	it("returns undefined when nothing identifiable is present", () => {
		expect(collectTouchedIds({ message: "done" })).toBeUndefined();
		expect(collectTouchedIds(null)).toBeUndefined();
	});

	it("terminates on a self-referential result", () => {
		const cyclic: Record<string, unknown> = { id: "ent-1" };
		cyclic.self = cyclic;
		expect(collectTouchedIds(cyclic)?.entityIds).toEqual(["ent-1"]);
	});
});

describe("summarizeToolResult", () => {
	it("keeps the start-time input summary and adds what the result revealed", () => {
		const merged = summarizeToolResult(
			{ result: { success: true, message: "Created", data: { id: "ent-9" } } },
			{ input: { name: "Gandalf" } }
		);

		expect(merged.input).toEqual({ name: "Gandalf" });
		expect(merged.message).toBe("Created");
		expect(merged.touched?.entityIds).toEqual(["ent-9"]);
	});
});

describe("serializeSummary", () => {
	it("sheds the input map rather than exceeding the cap", () => {
		const json = serializeSummary({
			input: Object.fromEntries(
				Array.from({ length: 12 }, (_, i) => [`key${i}`, "y".repeat(120)])
			),
			message: "kept",
		});

		expect(json).not.toBeNull();
		expect((json as string).length).toBeLessThanOrEqual(MAX_SUMMARY_BYTES);
		// Whatever survives must still be parseable — the read path JSON.parses it.
		expect(parseSummary(json)?.message).toBe("kept");
	});

	it("round-trips a normal summary", () => {
		const summary = { input: { a: "1" }, message: "ok" };
		expect(parseSummary(serializeSummary(summary))).toEqual(summary);
	});

	it("treats malformed stored JSON as absent", () => {
		expect(parseSummary("{not json")).toBeNull();
		expect(parseSummary(null)).toBeNull();
	});
});
