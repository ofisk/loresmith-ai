import { describe, expect, it } from "vitest";
import { buildExplainabilityFromSteps } from "@/lib/explainability-builder";
import { createToolSuccess } from "@/tools/tool-utils";
import { MAX_CONTEXT_SOURCES } from "@/types/explainability";

let nextCallId = 0;

/**
 * A step in the shape `streamText` actually produces.
 *
 * The envelope comes from the real `createToolSuccess` so the fixture cannot
 * drift from what tools return, and the AI SDK's own nesting is reproduced
 * here: the tool's return value lands in `output`, not `result`. Hand-written
 * fixtures previously flattened that away, which hid a bug where every
 * retrieval turn reported "no campaign sources".
 */
function toolStep(toolName: string, data: Record<string, unknown>) {
	const toolCallId = `call-${nextCallId++}`;
	return {
		toolCalls: [{ toolCallId, toolName, args: {} }],
		toolResults: [
			{
				type: "tool-result" as const,
				toolCallId,
				toolName,
				input: {},
				output: createToolSuccess("ok", data, toolCallId),
			},
		],
	};
}

function searchStep(results: unknown[]) {
	return toolStep("searchCampaignContext", { results });
}

/** Mirrors the banner the search tools wrap around entity content. */
function entityText(content: unknown, worldState?: string) {
	const divider = `${"═".repeat(55)}\n`;
	return (
		`${divider}EXPLICIT ENTITY RELATIONSHIPS (FROM ENTITY GRAPH)\n${divider}` +
		`ALLY:\n  Mara allied_with Corvin\n\n` +
		`${divider}ENTITY CONTENT (may contain unverified mentions):\n${divider}` +
		JSON.stringify(content) +
		(worldState
			? `\n\n${divider}WORLD STATE UPDATES (FROM CHANGELOG)\n${divider}${worldState}\n`
			: "")
	);
}

describe("explainability-builder", () => {
	describe("buildExplainabilityFromSteps", () => {
		it("returns null for empty steps", () => {
			expect(buildExplainabilityFromSteps(undefined)).toBe(null);
			expect(buildExplainabilityFromSteps([])).toBe(null);
		});

		it("returns null when no retrieval tool ran", () => {
			expect(buildExplainabilityFromSteps([toolStep("otherTool", {})])).toBe(
				null
			);
		});

		it("builds explainability from searchCampaignContext results", () => {
			const result = buildExplainabilityFromSteps([
				searchStep([
					{
						type: "entity",
						source: "entity_graph",
						entityId: "e1",
						title: "NPC 1",
					},
					{
						type: "file_content",
						source: "original_file",
						fileKey: "f1",
						fileName: "doc.pdf",
					},
				]),
			]);
			expect(result).not.toBe(null);
			expect(result?.contextSources).toHaveLength(2);
			const entity = result?.contextSources.find((s) => s.type === "entity");
			const file = result?.contextSources.find(
				(s) => s.type === "file_content"
			);
			expect(entity?.id).toBe("e1");
			expect(file?.id).toBe("f1");
			expect(file?.fileKey).toBe("f1");
			expect(result?.rationale).toContain("1 entity");
			expect(result?.rationale).toContain("1 file excerpt");
		});

		it("pluralizes entity/entities correctly", () => {
			const result = buildExplainabilityFromSteps([
				searchStep([
					{ type: "entity", source: "entity_graph", entityId: "e1" },
					{ type: "entity", source: "entity_graph", entityId: "e2" },
				]),
			]);
			expect(result?.rationale).toContain("2 entities");
		});

		it("marks a retrieval that found nothing as ungrounded", () => {
			const result = buildExplainabilityFromSteps([searchStep([])]);
			expect(result).not.toBe(null);
			expect(result?.grounding).toBe("ungrounded");
			expect(result?.contextSources).toHaveLength(0);
			expect(result?.rationale).toContain("not grounded");
		});

		it("reports a strong semantic hit as grounded", () => {
			const result = buildExplainabilityFromSteps([
				searchStep([
					{
						type: "entity",
						source: "entity_graph",
						entityId: "e1",
						score: 0.82,
					},
				]),
			]);
			expect(result?.grounding).toBe("grounded");
			expect(result?.topScore).toBe(0.82);
			expect(result?.contextSources[0].scoreIsSemantic).toBe(true);
		});

		it("reports a low-scoring semantic hit as a weak match", () => {
			const result = buildExplainabilityFromSteps([
				searchStep([
					{
						type: "entity",
						source: "entity_graph",
						entityId: "e1",
						score: 0.31,
					},
				]),
			]);
			expect(result?.grounding).toBe("weak");
			expect(result?.rationale).toContain("Nothing matched");
		});

		it("does not treat placeholder scores as semantic relevance", () => {
			const result = buildExplainabilityFromSteps([
				searchStep([
					// 0.8 is the fixed fallback for a non-semantic entity match.
					{
						type: "entity",
						source: "entity_graph",
						entityId: "e1",
						score: 0.8,
					},
					// 0.5 is arithmetic (0.7 - depth*0.1), not a similarity.
					{
						type: "entity",
						source: "graph_traversal",
						entityId: "e2",
						score: 0.5,
						traversalDepth: 2,
					},
					// 1.0 is a lexical substring hit.
					{
						type: "file_content",
						source: "original_file",
						fileKey: "f1",
						score: 1.0,
					},
				]),
			]);
			expect(result?.topScore).toBeUndefined();
			expect(result?.grounding).toBe("weak");
			for (const source of result?.contextSources ?? []) {
				expect(source.scoreIsSemantic).toBeFalsy();
			}
		});

		it("extracts a readable snippet from banner-wrapped entity content", () => {
			const result = buildExplainabilityFromSteps([
				searchStep([
					{
						type: "entity",
						source: "entity_graph",
						entityId: "e1",
						title: "Mara",
						text: entityText({
							description: "A retired smuggler running the dock tavern.",
							secrets: "unused",
						}),
					},
				]),
			]);
			expect(result?.contextSources[0].snippet).toBe(
				"A retired smuggler running the dock tavern."
			);
		});

		it("never leaks the world-state changelog block into a snippet", () => {
			const result = buildExplainabilityFromSteps([
				searchStep([
					{
						type: "entity",
						source: "entity_graph",
						entityId: "e1",
						text: entityText(
							{ description: "The harbour district." },
							'Metadata: {"betrayal":"the mayor is a doppelganger"}'
						),
					},
				]),
			]);
			const snippet = result?.contextSources[0].snippet ?? "";
			expect(snippet).toBe("The harbour district.");
			expect(snippet).not.toContain("doppelganger");
			expect(snippet).not.toContain("WORLD STATE");
		});

		it("keys digest sections on digestId and carries the session date", () => {
			const result = buildExplainabilityFromSteps([
				searchStep([
					{
						type: "planning_context",
						source: "session_digest",
						digestId: "d1",
						sessionNumber: 4,
						sessionDate: "2026-02-11",
						sectionType: "key_events",
						text: "The party burned the ledger.",
						score: 0.64,
					},
				]),
			]);
			const source = result?.contextSources[0];
			expect(source?.id).toBe("d1");
			expect(source?.sessionDate).toBe("2026-02-11");
			expect(source?.snippet).toBe("The party burned the ledger.");
		});

		it("collapses duplicates across steps, keeping the best score", () => {
			const result = buildExplainabilityFromSteps([
				searchStep([
					{
						type: "entity",
						source: "entity_graph",
						entityId: "e1",
						score: 0.4,
					},
				]),
				searchStep([
					{
						type: "entity",
						source: "entity_graph",
						entityId: "e1",
						score: 0.9,
					},
				]),
			]);
			expect(result?.contextSources).toHaveLength(1);
			expect(result?.contextSources[0].score).toBe(0.9);
		});

		it("caps carried sources but still reports the total found", () => {
			const many = Array.from({ length: MAX_CONTEXT_SOURCES + 8 }, (_, i) => ({
				type: "entity",
				source: "entity_graph",
				entityId: `e${i}`,
				score: 0.9 - i * 0.01,
			}));
			const result = buildExplainabilityFromSteps([searchStep(many)]);
			expect(result?.contextSources).toHaveLength(MAX_CONTEXT_SOURCES);
			expect(result?.totalSourceCount).toBe(MAX_CONTEXT_SOURCES + 8);
			// Highest-scoring survive the cap.
			expect(result?.contextSources[0].id).toBe("e0");
		});

		it("maps rules citations onto context sources", () => {
			const result = buildExplainabilityFromSteps([
				toolStep("searchRulesTool", {
					results: [
						{
							id: "r1",
							title: "Grappling",
							excerpt: "You can use the Attack action to grapple.",
							score: 0.77,
							citation: {
								source: "PHB",
								fileKey: "phb-key",
								chunkIndex: 12,
							},
						},
					],
				}),
			]);
			const source = result?.contextSources[0];
			expect(source?.type).toBe("file_content");
			expect(source?.fileKey).toBe("phb-key");
			expect(source?.chunkIndex).toBe(12);
			expect(source?.scoreIsSemantic).toBe(true);
			expect(result?.grounding).toBe("grounded");
		});

		it("maps getDocumentContent chunks onto context sources", () => {
			const result = buildExplainabilityFromSteps([
				toolStep("getDocumentContent", {
					fileKey: "f9",
					displayName: "Session Prep.pdf",
					chunks: [
						{ index: 0, text: "Chapter one." },
						{ index: 1, text: "Chapter two." },
					],
				}),
			]);
			expect(result?.contextSources).toHaveLength(2);
			expect(result?.contextSources[0].fileKey).toBe("f9");
			expect(result?.contextSources[0].title).toBe("Session Prep.pdf");
			expect(result?.contextSources.map((s) => s.chunkIndex).sort()).toEqual([
				0, 1,
			]);
		});

		it("reads the payload from the SDK's `output` envelope, not `result`", () => {
			// Regression: the builder read `toolResults[i].result.data`, one level
			// above where the AI SDK puts a tool's return value. Every retrieval
			// turn therefore harvested nothing and was labelled ungrounded.
			const step = searchStep([
				{
					type: "entity",
					source: "entity_graph",
					entityId: "e1",
					title: "Big Bosta",
					score: 0.71,
				},
			]);
			expect(step.toolResults[0]).not.toHaveProperty("result");
			expect(step.toolResults[0].output).toHaveProperty("result.data.results");

			const result = buildExplainabilityFromSteps([step]);
			expect(result?.grounding).toBe("grounded");
			expect(result?.contextSources[0].title).toBe("Big Bosta");
		});

		it("still reads an already-unwrapped result envelope", () => {
			const result = buildExplainabilityFromSteps([
				{
					toolCalls: [{ toolName: "searchCampaignContext", args: {} }],
					toolResults: [
						{
							result: {
								success: true,
								data: {
									results: [
										{ type: "entity", source: "entity_graph", entityId: "e1" },
									],
								},
							},
						},
					],
				},
			]);
			expect(result?.contextSources).toHaveLength(1);
		});

		it("pairs calls with results by toolCallId, not position", () => {
			// A tool that threw contributes no entry to `toolResults`, so the
			// surviving result sits at an index that belongs to another call.
			const result = buildExplainabilityFromSteps([
				{
					toolCalls: [
						{ toolCallId: "c1", toolName: "recordWorldEventTool", args: {} },
						{ toolCallId: "c2", toolName: "searchCampaignContext", args: {} },
					],
					toolResults: [
						{
							toolCallId: "c2",
							toolName: "searchCampaignContext",
							output: createToolSuccess(
								"ok",
								{
									results: [
										{
											type: "entity",
											source: "entity_graph",
											entityId: "e1",
											title: "Splinter",
										},
									],
								},
								"c2"
							),
						},
					],
				},
			]);
			expect(result?.contextSources).toHaveLength(1);
			expect(result?.contextSources[0].title).toBe("Splinter");
		});

		it("counts listAllEntities rows as entity sources", () => {
			const result = buildExplainabilityFromSteps([
				toolStep("listAllEntities", {
					entityType: "npcs",
					results: [
						{
							id: "e1",
							type: "npc",
							name: "Dur the Anchorhorn",
							title: "Dur the Anchorhorn",
							text: JSON.stringify({
								description: "Structural engineer of the Platform.",
							}),
							// listAllEntities stamps every row with this placeholder.
							score: 1.0,
						},
						{
							id: "e2",
							type: "npc",
							name: "Mael Firstburn",
							title: "Mael Firstburn",
							text: JSON.stringify({ description: "Keeper of the shrine." }),
							score: 1.0,
						},
					],
				}),
			]);
			expect(result?.contextSources).toHaveLength(2);
			expect(result?.rationale).toContain("2 entities");
			expect(result?.contextSources[0].entityType).toBe("npc");
			expect(result?.contextSources[0].snippet).toBe(
				"Structural engineer of the Platform."
			);
			// The placeholder score must not read as a perfect semantic match.
			expect(result?.topScore).toBeUndefined();
			expect(result?.grounding).toBe("weak");
		});
	});
});
