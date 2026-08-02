import { beforeEach, describe, expect, it } from "vitest";
import { AgentRouter, type AgentType } from "../../src/lib/agent-router";
import { AgentNotRegisteredError } from "../../src/lib/errors";

const gmTools = { gmOnlyTool: { description: "gm" } };
const playerTools = { sharedTool: { description: "shared" } };
const flatTools = { flatTool: { description: "flat" } };

class RoleAwareAgent {
	protected getToolsForRole(role: string | null) {
		return role === "gm" ? gmTools : playerTools;
	}
}

class FlatAgent {}

function resetRegistry() {
	for (const agentType of AgentRouter.getRegisteredAgentTypes()) {
		delete (AgentRouter as any).agentRegistry[agentType];
	}
}

describe("AgentRouter delegation support", () => {
	beforeEach(() => {
		resetRegistry();
		AgentRouter.registerAgent(
			"rules-reference" as AgentType,
			RoleAwareAgent,
			gmTools,
			"rules prompt",
			"Answers rules questions from indexed rulebooks."
		);
		AgentRouter.registerAgent(
			"resources" as AgentType,
			FlatAgent,
			flatTools,
			"resource prompt",
			"Manages uploaded files."
		);
	});

	describe("getAgentToolsForRole", () => {
		// Delegation must not become a way for a player to reach GM-only tools by
		// asking an agent that happens to hold them.
		it("applies the target agent's own role filtering", () => {
			expect(
				Object.keys(AgentRouter.getAgentToolsForRole("rules-reference", "gm"))
			).toEqual(["gmOnlyTool"]);
			expect(
				Object.keys(
					AgentRouter.getAgentToolsForRole("rules-reference", "player" as any)
				)
			).toEqual(["sharedTool"]);
		});

		it("falls back to registered tools when the agent has no role filter", () => {
			expect(
				Object.keys(AgentRouter.getAgentToolsForRole("resources", "gm"))
			).toEqual(["flatTool"]);
		});

		it("throws for an unregistered agent", () => {
			expect(() => AgentRouter.getAgentToolsForRole("nope", "gm")).toThrow(
				AgentNotRegisteredError
			);
		});
	});

	describe("getDelegationCatalog", () => {
		it("excludes the calling agent so it cannot delegate to itself", () => {
			const catalog = AgentRouter.getDelegationCatalog("resources");

			expect(catalog.map((entry) => entry.agent)).toEqual(["rules-reference"]);
		});

		it("carries the descriptions the router already routes on", () => {
			const catalog = AgentRouter.getDelegationCatalog("rules-reference");

			expect(catalog).toEqual([
				{ agent: "resources", description: "Manages uploaded files." },
			]);
		});

		it("returns an empty catalog when nothing is registered", () => {
			resetRegistry();

			expect(AgentRouter.getDelegationCatalog("resources")).toEqual([]);
		});
	});
});
