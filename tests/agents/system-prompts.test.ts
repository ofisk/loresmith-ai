import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../../src/agents/system-prompts";
import { estimateTokenCount } from "../../src/lib/token-utils";

const MINIMAL_CONFIG = {
	agentName: "Test Agent",
	responsibilities: ["Test responsibility"],
	tools: { "test action": "testTool" },
	workflowGuidelines: ["Test guideline"],
};

const ALL_PRESETS = ["minimal", "dataRetrieval"] as const;

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
		// Document expected savings: dataRetrieval adds NO IMPROVISATION (~150 tokens)
		expect(dataRetrievalTokens - minimalTokens).toBeGreaterThan(100);
	});

	it("default (dataRetrieval) includes NO IMPROVISATION", () => {
		const defaultPrompt = buildSystemPrompt(MINIMAL_CONFIG);
		expect(defaultPrompt).toContain("NO IMPROVISATION");
	});

	it("minimal excludes NO IMPROVISATION", () => {
		const minimalPrompt = buildSystemPrompt({
			...MINIMAL_CONFIG,
			conversationRules: "minimal",
		});
		expect(minimalPrompt).not.toContain("NO IMPROVISATION");
	});

	// The user is a storyteller, not an engineer. These rules are not optional
	// per-agent, because any agent can hit a failure and try to explain it.
	describe("user-facing voice rules apply to every preset", () => {
		it.each(ALL_PRESETS)("%s includes PLAIN LANGUAGE", (preset) => {
			const prompt = buildSystemPrompt({
				...MINIMAL_CONFIG,
				conversationRules: preset,
			});
			expect(prompt).toContain("PLAIN LANGUAGE");
		});

		it.each(ALL_PRESETS)("%s hides how LoreSmith is built", (preset) => {
			const prompt = buildSystemPrompt({
				...MINIMAL_CONFIG,
				conversationRules: preset,
			});
			expect(prompt).toContain("NEVER REVEAL HOW LORESMITH IS BUILT");
		});

		it("names the specific things that must not be mentioned", () => {
			const prompt = buildSystemPrompt(MINIMAL_CONFIG);
			for (const forbidden of [
				"hosting platforms",
				"AI vendors",
				"API keys",
				"databases",
				"tool names",
				"stack traces",
			]) {
				expect(prompt).toContain(forbidden);
			}
		});

		it("forbids inventing a support escalation path", () => {
			const prompt = buildSystemPrompt(MINIMAL_CONFIG);
			expect(prompt).toContain("escalate to");
			expect(prompt).toContain("You have no way to contact anyone");
		});
	});
});
