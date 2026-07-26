import { describe, expect, it } from "vitest";
import { buildExplainabilityFromSteps } from "@/lib/explainability-builder";
import { MAX_CONTEXT_SOURCES } from "@/types/explainability";

function searchStep(results: unknown[]) {
	return {
		toolCalls: [{ toolName: "searchCampaignContext", args: {} }],
		toolResults: [{ result: { success: true, data: { results } } }],
	};
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
			const steps = [
				{
					toolCalls: [{ toolName: "otherTool", args: {} }],
					toolResults: [{ result: { success: true } }],
				},
			];
			expect(buildExplainabilityFromSteps(steps)).toBe(null);
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
				{
					toolCalls: [{ toolName: "searchRulesTool", args: {} }],
					toolResults: [
						{
							result: {
								success: true,
								data: {
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
								},
							},
						},
					],
				},
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
				{
					toolCalls: [{ toolName: "getDocumentContent", args: {} }],
					toolResults: [
						{
							result: {
								success: true,
								data: {
									fileKey: "f9",
									displayName: "Session Prep.pdf",
									chunks: [
										{ index: 0, text: "Chapter one." },
										{ index: 1, text: "Chapter two." },
									],
								},
							},
						},
					],
				},
			]);
			expect(result?.contextSources).toHaveLength(2);
			expect(result?.contextSources[0].fileKey).toBe("f9");
			expect(result?.contextSources[0].title).toBe("Session Prep.pdf");
			expect(result?.contextSources.map((s) => s.chunkIndex).sort()).toEqual([
				0, 1,
			]);
		});
	});
});
