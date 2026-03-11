import { isGMRole } from "@/constants/campaign-roles";
import {
	gmRulesReferenceToolsBundle,
	playerRulesReferenceToolsBundle,
} from "@/tools/campaign-context/rules-reference-tools-bundle";
import type { CampaignRole } from "@/types/campaign";
import { BaseAgent } from "./base-agent";
import {
	buildSystemPrompt,
	createToolMappingFromObjects,
} from "./system-prompts";

const RULES_REFERENCE_AGENT_SYSTEM_PROMPT = buildSystemPrompt({
	agentName: "Rules reference agent",
	responsibilities: [
		"Rules lookup: Answer system mechanics questions using indexed campaign rule resources and rules entities.",
		"Citation-first answers: Always ground answers in cited source excerpts or house rules from tool results.",
		"Conflict handling: Check house rules versus source rules and clearly explain which rule takes precedence.",
		"Stat block lookup: Find creature or NPC stat block excerpts from indexed resources when requested.",
	],
	tools: createToolMappingFromObjects(gmRulesReferenceToolsBundle),
	workflowGuidelines: [
		"For rules questions, call searchRulesTool first and answer from returned excerpts plus citations.",
		"For creature or NPC mechanics, call lookupStatBlockTool and include the best citation in your response.",
		"When official rules and house rules may conflict, call resolveRulesConflictTool before final guidance.",
		"If no source is found, explicitly say the needed rulebook is not indexed and suggest uploading it.",
		"Never ask for campaignId. The runtime injects the selected campaign automatically.",
	],
	importantNotes: [
		"Never invent rules text. Use only retrieved sources and house rules.",
		"When house rules conflict with source rules, state that the house rule takes precedence.",
	],
});

export class RulesReferenceAgent extends BaseAgent {
	static readonly agentMetadata = {
		type: "rules-reference",
		description:
			"Answers rules questions using indexed rulebooks and campaign house rules, cites sources, and resolves rule conflicts.",
		systemPrompt: RULES_REFERENCE_AGENT_SYSTEM_PROMPT,
		tools: gmRulesReferenceToolsBundle,
	};

	constructor(ctx: DurableObjectState, env: any, model: any) {
		super(ctx, env, model, gmRulesReferenceToolsBundle);
	}

	protected getToolsForRole(role: CampaignRole | null): Record<string, any> {
		return isGMRole(role)
			? gmRulesReferenceToolsBundle
			: playerRulesReferenceToolsBundle;
	}
}
