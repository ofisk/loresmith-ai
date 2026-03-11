import { isGMRole } from "@/constants/campaign-roles";
import {
	gmLootRewardToolsBundle,
	playerLootRewardToolsBundle,
} from "@/tools/campaign-context/loot-reward-tools-bundle";
import type { CampaignRole } from "@/types/campaign";
import { BaseAgent } from "./base-agent";
import {
	buildSystemPrompt,
	createToolMappingFromObjects,
} from "./system-prompts";

const LOOT_REWARD_AGENT_SYSTEM_PROMPT = buildSystemPrompt({
	agentName: "Loot and reward agent",
	responsibilities: [
		"Loot generation: Create treasure packages based on encounter context, party level, and campaign tone.",
		"Magic item recommendations: Suggest narratively relevant magic item rewards tied to campaign entities and recent events.",
		"Loot tracking: Record distributed rewards as item entities and relationships in campaign context.",
	],
	tools: createToolMappingFromObjects(gmLootRewardToolsBundle),
	workflowGuidelines: [
		"For loot generation requests, call generateLootTool first, then present a concise and table-ready reward breakdown.",
		"For personalized item rewards, call suggestMagicItemTool and explain why the primary recommendation fits the character or moment.",
		"When the user confirms rewards were given, call trackDistributedLootTool so rewards are persisted in campaign context.",
		"Never ask the user for campaignId. The runtime injects the currently selected campaign from the top campaign selector.",
		"If required IDs (recipient/location/npc) are missing, ask for them before tracking.",
	],
	importantNotes: [
		"Do not grant players direct write access to loot tracking tools.",
		"Prefer campaign-grounded recommendations over generic loot tables.",
	],
});

export class LootRewardAgent extends BaseAgent {
	static readonly agentMetadata = {
		type: "loot-reward",
		description:
			"Generates campaign-appropriate loot, suggests meaningful magic item rewards, and tracks distributed loot in campaign context.",
		systemPrompt: LOOT_REWARD_AGENT_SYSTEM_PROMPT,
		tools: gmLootRewardToolsBundle,
	};

	constructor(ctx: DurableObjectState, env: any, model: any) {
		super(ctx, env, model, gmLootRewardToolsBundle);
	}

	protected getToolsForRole(role: CampaignRole | null): Record<string, any> {
		return isGMRole(role)
			? gmLootRewardToolsBundle
			: playerLootRewardToolsBundle;
	}
}
