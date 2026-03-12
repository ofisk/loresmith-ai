import { describe, expect, it } from "vitest";
import { buildExplainabilityFromSteps } from "@/lib/explainability-builder";

describe("explainability-builder", () => {
	describe("buildExplainabilityFromSteps", () => {
		it("returns null for empty steps", () => {
			expect(buildExplainabilityFromSteps(undefined)).toBe(null);
			expect(buildExplainabilityFromSteps([])).toBe(null);
		});

		it("returns null when no searchCampaignContext results", () => {
			const steps = [
				{
					toolCalls: [{ toolName: "otherTool", args: {} }],
					toolResults: [{ result: { success: true } }],
				},
			];
			expect(buildExplainabilityFromSteps(steps)).toBe(null);
		});

		it("builds explainability from searchCampaignContext results", () => {
			const steps = [
				{
					toolCalls: [{ toolName: "searchCampaignContext", args: {} }],
					toolResults: [
						{
							result: {
								success: true,
								data: {
									results: [
										{
											type: "entity",
											source: "npc",
											entityId: "e1",
											title: "NPC 1",
										},
										{
											type: "file_content",
											source: "file",
											fileKey: "f1",
											fileName: "doc.pdf",
										},
									],
								},
							},
						},
					],
				},
			];
			const result = buildExplainabilityFromSteps(steps);
			expect(result).not.toBe(null);
			expect(result!.contextSources).toHaveLength(2);
			expect(result!.contextSources[0].type).toBe("entity");
			expect(result!.contextSources[0].id).toBe("e1");
			expect(result!.contextSources[1].type).toBe("file_content");
			expect(result!.contextSources[1].id).toBe("f1");
			expect(result!.rationale).toContain("1 entity");
			expect(result!.rationale).toContain("1 file chunk");
		});

		it("pluralizes entity/entities correctly", () => {
			const steps = [
				{
					toolCalls: [{ toolName: "searchCampaignContext", args: {} }],
					toolResults: [
						{
							result: {
								data: {
									results: [
										{ type: "entity", source: "npc", entityId: "e1" },
										{ type: "entity", source: "npc", entityId: "e2" },
									],
								},
							},
						},
					],
				},
			];
			const result = buildExplainabilityFromSteps(steps);
			expect(result!.rationale).toContain("2 entities");
		});
	});
});
