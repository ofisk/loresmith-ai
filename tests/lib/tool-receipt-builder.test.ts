import { describe, expect, it } from "vitest";
import {
	buildToolReceipts,
	buildToolReceiptsFromParts,
	buildToolReceiptsFromSteps,
	classifyToolEffect,
	humanizeToolName,
} from "@/lib/tool-receipt-builder";
import { createToolError, createToolSuccess } from "@/tools/tool-utils";
import { MAX_RECEIPT_CALLS } from "@/types/tool-receipt";

let nextCallId = 0;

/**
 * A step in the shape `streamText` actually produces.
 *
 * The envelope comes from the real `createToolSuccess`/`createToolError` so the
 * fixture cannot drift from what tools return, and the AI SDK's own nesting is
 * reproduced: a tool's return value lands in `output`, not `result`.
 */
function toolStep(
	toolName: string,
	input: Record<string, unknown>,
	output: unknown
) {
	const toolCallId = `call-${nextCallId++}`;
	return {
		toolCalls: [{ toolCallId, toolName, input }],
		toolResults: [{ toolCallId, toolName, output }],
	};
}

function successStep(
	toolName: string,
	input: Record<string, unknown>,
	message: string,
	data: Record<string, unknown> = {}
) {
	const toolCallId = `call-${nextCallId++}`;
	return {
		toolCalls: [{ toolCallId, toolName, input }],
		toolResults: [
			{
				toolCallId,
				toolName,
				output: createToolSuccess(message, data, toolCallId),
			},
		],
	};
}

function errorStep(
	toolName: string,
	input: Record<string, unknown>,
	message: string
) {
	const toolCallId = `call-${nextCallId++}`;
	return {
		toolCalls: [{ toolCallId, toolName, input }],
		toolResults: [
			{
				toolCallId,
				toolName,
				output: createToolError(message, "boom", 500, toolCallId),
			},
		],
	};
}

describe("tool-receipt-builder", () => {
	describe("humanizeToolName", () => {
		it("drops the Tool suffix and spaces out camelCase", () => {
			expect(humanizeToolName("updateEntityWorldStateTool")).toBe(
				"Update entity world state"
			);
			expect(humanizeToolName("searchCampaignContext")).toBe(
				"Search campaign context"
			);
		});

		it("keeps acronyms intact", () => {
			expect(humanizeToolName("generateGMContextRecapTool")).toBe(
				"Generate GM context recap"
			);
		});
	});

	describe("classifyToolEffect", () => {
		it("reads from read verbs and writes from write verbs", () => {
			expect(classifyToolEffect("listAllEntities")).toBe("read");
			expect(classifyToolEffect("searchCampaignContext")).toBe("read");
			expect(classifyToolEffect("createEntityRelationshipTool")).toBe("write");
			expect(classifyToolEffect("deleteCampaign")).toBe("write");
			expect(classifyToolEffect("updateEntityWorldStateTool")).toBe("write");
		});

		it("declines to guess for an unrecognised verb", () => {
			expect(classifyToolEffect("stitchSessionReadout")).toBe("action");
			expect(classifyToolEffect("brandNewMysteryTool")).toBe("action");
		});

		it("uses overrides where the verb lies", () => {
			// "Resolve a campaign name to its UUID" — a lookup, not a change.
			expect(classifyToolEffect("resolveCampaignIdentifier")).toBe("read");
			// "corrections are written back to campaign world state"
			expect(classifyToolEffect("resolveContinuityFindingTool")).toBe("write");
			// "returning precedence and conflict notes"
			expect(classifyToolEffect("resolveRulesConflictTool")).toBe("read");
		});
	});

	describe("buildToolReceiptsFromSteps", () => {
		it("returns null when no tools ran", () => {
			expect(buildToolReceiptsFromSteps(undefined)).toBe(null);
			expect(buildToolReceiptsFromSteps([])).toBe(null);
			expect(
				buildToolReceiptsFromSteps([{ toolCalls: [], toolResults: [] }])
			).toBe(null);
		});

		it("summarises a read by how much it found", () => {
			const receipts = buildToolReceiptsFromSteps([
				successStep(
					"searchCampaignContext",
					{ query: "sea captain", jwt: "secret" },
					"Found matches",
					{ results: [{}, {}, {}] }
				),
			]);

			expect(receipts?.calls).toHaveLength(1);
			expect(receipts?.calls[0]).toMatchObject({
				toolName: "searchCampaignContext",
				label: "Search campaign context",
				effect: "read",
				status: "ok",
				detail: "sea captain",
				outcome: "3 matches",
			});
			expect(receipts?.writeCount).toBe(0);
		});

		it("says so when a search came back empty", () => {
			const receipts = buildToolReceiptsFromSteps([
				successStep("searchCampaignContext", { query: "kraken" }, "Done", {
					results: [],
				}),
			]);
			expect(receipts?.calls[0].outcome).toBe("no matches");
		});

		it("summarises a write by what it did, and counts it as a change", () => {
			const receipts = buildToolReceiptsFromSteps([
				successStep(
					"createEntityRelationshipTool",
					{
						fromEntityId: "e1",
						toEntityId: "e2",
						relationshipType: "member_of",
					},
					"Relationship created successfully",
					{ relationships: [{}] }
				),
			]);

			expect(receipts?.calls[0]).toMatchObject({
				effect: "write",
				detail: "member of",
				outcome: "Relationship created successfully",
			});
			expect(receipts?.writeCount).toBe(1);
		});

		it("never leaks the jwt into the detail line", () => {
			const receipts = buildToolReceiptsFromSteps([
				successStep("listCampaigns", { jwt: "header.payload.sig" }, "ok", {
					campaigns: [{}],
				}),
			]);
			expect(receipts?.calls[0].detail).toBeUndefined();
			expect(JSON.stringify(receipts)).not.toContain("header.payload.sig");
		});

		it("surfaces a failed tool rather than swallowing it", () => {
			const receipts = buildToolReceiptsFromSteps([
				errorStep(
					"updateEntityWorldStateTool",
					{ entityName: "Captain Vane" },
					"Entity not found"
				),
			]);

			expect(receipts?.calls[0]).toMatchObject({
				status: "error",
				outcome: "Entity not found",
			});
			expect(receipts?.errorCount).toBe(1);
		});

		it("treats a call with no result as a thrown tool", () => {
			const receipts = buildToolReceiptsFromSteps([
				{
					toolCalls: [
						{ toolCallId: "c1", toolName: "listAllEntities", input: {} },
					],
					toolResults: [],
				},
			]);

			expect(receipts?.calls[0]).toMatchObject({
				status: "error",
				outcome: "Tool call failed",
			});
		});

		it("pairs results to calls by id, not position", () => {
			// The first tool threw, so only the second has a result. A positional
			// match would credit the surviving result to the tool that failed.
			const receipts = buildToolReceiptsFromSteps([
				{
					toolCalls: [
						{ toolCallId: "a", toolName: "listAllEntities", input: {} },
						{
							toolCallId: "b",
							toolName: "searchCampaignContext",
							input: { query: "docks" },
						},
					],
					toolResults: [
						{
							toolCallId: "b",
							toolName: "searchCampaignContext",
							output: createToolSuccess("ok", { results: [{}] }, "b"),
						},
					],
				},
			]);

			expect(receipts?.calls[0]).toMatchObject({
				toolName: "listAllEntities",
				status: "error",
			});
			expect(receipts?.calls[1]).toMatchObject({
				toolName: "searchCampaignContext",
				status: "ok",
				outcome: "1 match",
			});
		});

		it("collapses identical repeated calls into one row", () => {
			const steps = [
				successStep("listAllEntities", {}, "ok", { entities: [{}] }),
				successStep("listAllEntities", {}, "ok", { entities: [{}] }),
			];
			const receipts = buildToolReceiptsFromSteps(steps);

			expect(receipts?.calls).toHaveLength(1);
			expect(receipts?.calls[0].attempts).toBe(2);
			expect(receipts?.totalCallCount).toBe(2);
		});

		it("keeps a failure visible when a retry succeeded", () => {
			const receipts = buildToolReceiptsFromSteps([
				errorStep("updateCampaign", { name: "Salt & Iron" }, "Timed out"),
				successStep(
					"updateCampaign",
					{ name: "Salt & Iron" },
					"Campaign updated"
				),
			]);

			expect(receipts?.calls).toHaveLength(2);
			expect(receipts?.calls[0].status).toBe("error");
			expect(receipts?.calls[1].status).toBe("ok");
			expect(receipts?.errorCount).toBe(1);
		});

		it("links entities a call touched, and only those", () => {
			const receipts = buildToolReceiptsFromSteps([
				successStep(
					"updateEntityMetadataTool",
					{ entityId: "e1", entityName: "Captain Vane" },
					"Entity updated",
					{
						entity: { id: "e1", name: "Captain Vane" },
						// Search hits belong to the Sources panel, not the receipt.
						results: [{ entityId: "e9", title: "Iron Coast" }],
					}
				),
			]);

			expect(receipts?.calls[0].entities).toEqual([
				{ id: "e1", name: "Captain Vane" },
			]);
		});

		it("drops an entity that has no name to link", () => {
			const receipts = buildToolReceiptsFromSteps([
				successStep("updateEntityTypeTool", { entityId: "e1" }, "Updated", {
					entityId: "e1",
				}),
			]);
			expect(receipts?.calls[0].entities).toBeUndefined();
		});

		it("caps the rows carried per message but reports the true total", () => {
			const steps = Array.from({ length: MAX_RECEIPT_CALLS + 5 }, (_, i) =>
				successStep("searchCampaignContext", { query: `q${i}` }, "ok", {
					results: [{}],
				})
			);
			const receipts = buildToolReceiptsFromSteps(steps);

			expect(receipts?.calls).toHaveLength(MAX_RECEIPT_CALLS);
			expect(receipts?.totalCallCount).toBe(MAX_RECEIPT_CALLS + 5);
		});

		it("truncates a long detail rather than carrying an essay", () => {
			const receipts = buildToolReceiptsFromSteps([
				successStep("searchCampaignContext", { query: "a".repeat(500) }, "ok", {
					results: [],
				}),
			]);
			expect(receipts?.calls[0].detail?.length).toBeLessThanOrEqual(140);
		});

		it("tolerates a result shape it does not recognise", () => {
			const receipts = buildToolReceiptsFromSteps([
				toolStep("mysteryTool", { name: "thing" }, "just a string"),
			]);
			expect(receipts?.calls[0]).toMatchObject({
				toolName: "mysteryTool",
				effect: "action",
				status: "ok",
				detail: "thing",
			});
		});
	});

	describe("buildToolReceiptsFromParts", () => {
		it("builds the same receipt from streamed message parts", () => {
			const receipts = buildToolReceiptsFromParts([
				{ type: "text", text: "Done." },
				{
					type: "tool-searchCampaignContext",
					toolName: "searchCampaignContext",
					toolCallId: "c1",
					state: "output-available",
					input: { query: "sea captain" },
					output: createToolSuccess("ok", { results: [{}, {}] }, "c1"),
				},
			]);

			expect(receipts?.calls).toHaveLength(1);
			expect(receipts?.calls[0]).toMatchObject({
				toolName: "searchCampaignContext",
				detail: "sea captain",
				outcome: "2 matches",
			});
		});

		it("reads the legacy tool-invocation shape too", () => {
			const receipts = buildToolReceiptsFromParts([
				{
					type: "tool-invocation",
					toolInvocation: {
						state: "result",
						toolName: "createCampaign",
						toolCallId: "c1",
						args: { name: "Salt & Iron" },
						result: createToolSuccess("Campaign created", {}, "c1"),
					},
				},
			]);

			expect(receipts?.calls[0]).toMatchObject({
				toolName: "createCampaign",
				effect: "write",
				detail: "Salt & Iron",
				outcome: "Campaign created",
			});
		});

		it("skips calls that have not finished", () => {
			expect(
				buildToolReceiptsFromParts([
					{
						type: "tool-createCampaign",
						toolName: "createCampaign",
						toolCallId: "c1",
						state: "input-streaming",
						input: {},
					},
					{
						type: "tool-createCampaign",
						toolName: "createCampaign",
						toolCallId: "c2",
						state: "input-available",
						input: { name: "Pending" },
					},
				])
			).toBe(null);
		});

		it("reports a streamed tool error with its message", () => {
			const receipts = buildToolReceiptsFromParts([
				{
					type: "tool-deleteCampaign",
					toolName: "deleteCampaign",
					toolCallId: "c1",
					state: "output-error",
					input: { campaignName: "Salt & Iron" },
					errorText: "Permission denied",
				},
			]);

			expect(receipts?.calls[0]).toMatchObject({
				status: "error",
				outcome: "Permission denied",
			});
			expect(receipts?.errorCount).toBe(1);
		});

		it("ignores non-tool parts entirely", () => {
			expect(buildToolReceiptsFromParts([{ type: "text", text: "hi" }])).toBe(
				null
			);
			expect(buildToolReceiptsFromParts([])).toBe(null);
			expect(buildToolReceiptsFromParts(undefined)).toBe(null);
		});
	});

	describe("buildToolReceipts", () => {
		it("ignores records with no tool name", () => {
			expect(buildToolReceipts([{ toolName: "" }])).toBe(null);
		});
	});
});
