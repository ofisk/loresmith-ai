import { isGMRole } from "@/constants/campaign-roles";
import {
	gmEncounterBuilderToolsBundle,
	playerEncounterBuilderToolsBundle,
} from "@/tools/campaign-context/encounter-builder-tools-bundle";
import type { CampaignRole } from "@/types/campaign";
import { BaseAgent } from "./base-agent";
import {
	buildSystemPrompt,
	createToolMappingFromObjects,
} from "./system-prompts";

const ENCOUNTER_BUILDER_AGENT_SYSTEM_PROMPT = buildSystemPrompt({
	agentName: "Encounter builder agent",
	responsibilities: [
		"Encounter generation: Build campaign-grounded combat encounters from location, faction, and monster relationship context.",
		"Encounter scaling: Adjust existing encounter specs for new party level, party size, and desired challenge.",
		"Stat block retrieval: Fetch stat block excerpts and citations for creatures included in an encounter.",
		"GM tactical coaching: Explain how to run each monster by combat role, plus general encounter-running advice.",
		"Session planning handoff: Prepare encounter output so it can be used directly in session planning.",
	],
	tools: createToolMappingFromObjects(gmEncounterBuilderToolsBundle),
	workflowGuidelines: [
		"For fresh encounter requests, call generateEncounterTool first and present composition, per-monster role usage advice, and general combat guidance.",
		"For difficulty changes, call scaleEncounterTool using the existing encounter spec before giving recommendations, and refresh GM tactical guidance for the new threat level.",
		"For creature mechanics references, call getEncounterStatBlocksTool and include source-backed citations when available.",
		"Never ask for campaignId. The runtime injects the currently selected campaign.",
		"Do not expose GM-only encounter details to player roles.",
	],
	importantNotes: [
		"Use system-agnostic difficulty guidance; avoid hardcoded system-specific CR math unless explicit source data demands it.",
		"Keep encounter plans grounded in campaign entities and relationships whenever possible.",
	],
});

export class EncounterBuilderAgent extends BaseAgent {
	static readonly agentMetadata = {
		type: "encounter-builder",
		description:
			"Builds and scales campaign-grounded combat encounters, and retrieves stat block references for encounter creatures.",
		systemPrompt: ENCOUNTER_BUILDER_AGENT_SYSTEM_PROMPT,
		tools: gmEncounterBuilderToolsBundle,
	};

	constructor(ctx: DurableObjectState, env: any, model: any) {
		super(ctx, env, model, gmEncounterBuilderToolsBundle);
	}

	protected getToolsForRole(role: CampaignRole | null): Record<string, any> {
		return isGMRole(role)
			? gmEncounterBuilderToolsBundle
			: playerEncounterBuilderToolsBundle;
	}
}
