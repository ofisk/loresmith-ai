import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../../src/agents/system-prompts";
import { estimateTokenCount } from "../../src/lib/token-utils";

const MINIMAL_CONFIG = {
	agentName: "Test Agent",
	responsibilities: ["Test responsibility"],
	tools: { "test action": "testTool" },
	workflowGuidelines: ["Test guideline"],
};

describe("buildSystemPrompt", () => {
	it("produces valid prompt with minimal config", () => {
		const prompt = buildSystemPrompt(MINIMAL_CONFIG);
		expect(prompt).toContain("You are a specialized Test Agent");
		expect(prompt).toContain("Test responsibility");
		expect(prompt).toContain("CRITICAL CONVERSATION RULES");
	});

	it("conversationRules minimal has fewer tokens than dataRetrieval", () => {
		const minimalPrompt = buildSystemPrompt({
			...MINIMAL_CONFIG,
			conversationRules: "minimal",
		});
		const dataRetrievalPrompt = buildSystemPrompt({
			...MINIMAL_CONFIG,
			conversationRules: "dataRetrieval",
		});
		const minimalTokens = estimateTokenCount(minimalPrompt);
		const dataRetrievalTokens = estimateTokenCount(dataRetrievalPrompt);
		expect(minimalTokens).toBeLessThan(dataRetrievalTokens);
		// Document expected savings: dataRetrieval adds NO IMPROVISATION + PLAIN LANGUAGE (~220 tokens)
		expect(dataRetrievalTokens - minimalTokens).toBeGreaterThan(100);
	});

	it("default (dataRetrieval) includes NO IMPROVISATION and PLAIN LANGUAGE", () => {
		const defaultPrompt = buildSystemPrompt(MINIMAL_CONFIG);
		expect(defaultPrompt).toContain("NO IMPROVISATION");
		expect(defaultPrompt).toContain("PLAIN LANGUAGE");
	});

	it("minimal excludes NO IMPROVISATION and PLAIN LANGUAGE", () => {
		const minimalPrompt = buildSystemPrompt({
			...MINIMAL_CONFIG,
			conversationRules: "minimal",
		});
		expect(minimalPrompt).not.toContain("NO IMPROVISATION");
		expect(minimalPrompt).not.toContain("PLAIN LANGUAGE");
	});
});
