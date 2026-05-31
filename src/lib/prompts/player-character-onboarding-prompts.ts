import { CONTEXT_RECAP_PLACEHOLDER } from "@/app-constants";
import type { Entity } from "@/dao/entity-dao";
import type { PlayerCharacterClaim } from "@/dao/player-character-claim-dao";
import type { ResolvedClaimedPlayerContext } from "@/lib/agent-role-utils";
import type { PlayerPcOnboardingGap } from "@/lib/player-character-onboarding";

const ONBOARDING_PRIORITY_RULES = `CRITICAL — character onboarding is mandatory until the sheet is well-formed and well-connected:
- Do NOT open with a menu of other capabilities (session recap, roleplay support, rules help, etc.).
- Do NOT offer optional side quests like "we could work on your sheet if you'd like."
- Start immediately with the next onboarding question from the highest-priority gap.
- Ask one focused question at a time, then wait for the answer before moving on.
- Use generateCharacterWithAITool and updateCharacterInfo to save progress on their claimed PC only.
- When critical and important gaps are cleared, call completePlayerCharacterOnboarding.
- Only switch to other help if the user explicitly asks for something unrelated to finishing the character (e.g. "skip for now", "just give me a session recap").`;

export function isExplicitOffTopicPlayerRequest(message: string): boolean {
	const trimmed = message.trim();
	if (!trimmed || trimmed === CONTEXT_RECAP_PLACEHOLDER) {
		return false;
	}

	const lower = trimmed.toLowerCase();
	const explicitPatterns = [
		/\b(skip (character|onboarding|sheet)|finish (this|character|sheet) later|not now|maybe later)\b/,
		/\b(don't|do not)\b.*\b(help|work on)\b.*\b(character|sheet|onboarding)\b/,
		/\b(just|only)\b.*\b(recap|session summary|rules question|rules lookup)\b/,
		/\b(session recap|what happened last session|lookup (a )?rule|rules question)\b/,
		/\bignore (the )?(character|sheet|onboarding)\b/,
	];
	return explicitPatterns.some((pattern) => pattern.test(lower));
}

export function shouldForceCharacterOnboardingRouting(
	playerContext: ResolvedClaimedPlayerContext | null,
	userMessage: string
): boolean {
	if (!playerContext?.isPcOnboardingIncomplete) {
		return false;
	}
	return !isExplicitOffTopicPlayerRequest(userMessage);
}

export function buildPlayerCharacterOnboardingOpeningPrompt(
	entity: Entity,
	claim: PlayerCharacterClaim | null
): string {
	const pendingNote =
		claim?.claimStatus === "pending"
			? " Their claim is pending GM approval, but they can still build the sheet while waiting."
			: "";

	return `The player has an incomplete character sheet for "${entity.name}" (entity ID: ${entity.id}).${pendingNote} ${ONBOARDING_PRIORITY_RULES} Begin now with the first missing detail from the gap list below.`;
}

export function buildPlayerCharacterOnboardingGapPrompts(
	gaps: PlayerPcOnboardingGap[]
): string {
	if (gaps.length === 0) {
		return "No blocking onboarding gaps remain. Confirm the sheet with the player, then call completePlayerCharacterOnboarding.";
	}

	const lines = gaps.slice(0, 8).map((gap) => {
		return `- [${gap.category}/${gap.severity}] ${gap.description} → ${gap.suggestion}`;
	});

	return `Work through these gaps in order (highest severity first):\n${lines.join("\n")}`;
}

export function buildPlayerCharacterOnboardingAgentGuidelines(
	entity: Entity
): string {
	return `## Player character onboarding (active — priority over all other tasks)

You are finishing the claimed character "${entity.name}" (entity ID: ${entity.id}).

${ONBOARDING_PRIORITY_RULES}`;
}

export function buildPlayerCharacterOnboardingPriorityContext(
	entity: Entity
): string {
	return `## Mandatory player character onboarding

The claimed character "${entity.name}" (entity ID: ${entity.id}) is incomplete. ${ONBOARDING_PRIORITY_RULES}`;
}
