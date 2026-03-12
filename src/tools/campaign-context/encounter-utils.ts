/**
 * Pure helper functions for encounter generation and scaling.
 * No env, DAO, or LLM dependencies – safe to unit test.
 */

import type { Entity } from "@/dao/entity-dao";
import type { Difficulty } from "./encounter-difficulty-utils";
import { getEntityText } from "./encounter-difficulty-utils";

export const DIFFICULTY_RANK: Record<Difficulty, number> = {
	easy: 1,
	medium: 2,
	hard: 3,
	deadly: 4,
};

export function toWordSet(input: string | undefined): Set<string> {
	return new Set(
		(input ?? "")
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter((token) => token.length >= 3)
	);
}

export function inferRole(entity: Entity): string {
	//TODO: low likelihood that entity name is enough to infer role. let's expand this more in the future
	const text = `${entity.name} ${getEntityText(entity)}`.toLowerCase();
	if (/sniper|archer|ranged/.test(text)) return "ranged pressure";
	if (/brute|ogre|giant|crusher/.test(text)) return "frontline brute";
	if (/mage|caster|shaman|priest/.test(text)) return "spell support";
	if (/assassin|skirmish|stalker/.test(text)) return "mobile skirmisher";
	if (/leader|captain|chief|boss/.test(text)) return "command leader";
	return "general combatant";
}

export function buildRoleBasedUsageAdvice(params: {
	role: string;
	threatBand: "low" | "standard" | "high";
	linkedFactions: string[];
	linkedLocations: string[];
}): string[] {
	const { role, threatBand, linkedFactions, linkedLocations } = params;
	const advice: string[] = [];

	switch (role) {
		case "ranged pressure":
			advice.push(
				"Open from cover and force movement with line-of-sight pressure.",
				"Keep this unit 30-60 feet from frontliners and reposition after focus fire."
			);
			break;
		case "frontline brute":
			advice.push(
				"Use this monster to hold the center and deny access to fragile allies.",
				"Spend early rounds on shoves, grapples, or area denial instead of pure damage."
			);
			break;
		case "spell support":
			advice.push(
				"Start with control or debuff effects that split the party's action economy.",
				"Protect this unit with blockers and retreat if concentration is pressured."
			);
			break;
		case "mobile skirmisher":
			advice.push(
				"Attack isolated targets, then break line of sight to avoid focus fire.",
				"Use terrain loops and alternate entry points to create crossfire."
			);
			break;
		case "command leader":
			advice.push(
				"Issue objectives to allies (pin, flank, protect) and act as morale anchor.",
				"Trigger a tactical shift when this monster is bloodied (reinforce, retreat, or escalate)."
			);
			break;
		default:
			advice.push(
				"Pair this unit with another role to avoid one-dimensional combat turns.",
				"Give it a concrete battlefield objective beyond dealing damage."
			);
	}

	if (threatBand === "high") {
		advice.push(
			"Telegraph major abilities one beat ahead so danger feels fair but serious."
		);
	}
	if (threatBand === "low") {
		advice.push(
			"Use in groups to create pressure through positioning, not individual damage."
		);
	}
	if (linkedFactions.length > 0) {
		advice.push(
			`Play this unit as acting on ${linkedFactions[0]}'s agenda, not random aggression.`
		);
	}
	if (linkedLocations.length > 0) {
		advice.push(
			`Let local terrain in ${linkedLocations[0]} shape how this unit fights.`
		);
	}

	return advice.slice(0, 4);
}

export function buildGeneralCombatAdvice(params: {
	targetDifficulty: Difficulty;
	partySize: number;
	composition: Array<{ role?: string; count: number; threatEstimate?: string }>;
}): string[] {
	const { targetDifficulty, partySize, composition } = params;
	const roleSet = new Set(
		composition.map((entry) => entry.role ?? "general combatant")
	);
	const hasLeader = composition.some((entry) =>
		(entry.role ?? "").includes("leader")
	);
	const highThreatCount = composition.filter(
		(entry) => (entry.threatEstimate ?? "").toLowerCase() === "high"
	).length;

	const advice = [
		"Run enemies with a clear objective each round (delay, capture, protect, or escape), not only damage.",
		"Change battlefield state by round 3 with reinforcements, hazards, or shifting objectives.",
	];

	if (roleSet.size >= 3) {
		advice.push(
			"Sequence turns by role: controllers first, pressure units second, finishers last."
		);
	}
	if (!hasLeader) {
		advice.push(
			"Use a visible signal system (horn, chant, banner) so non-leader enemies still coordinate believably."
		);
	}
	if (highThreatCount > 0) {
		advice.push(
			"Give high-threat monsters clear telegraphs before peak actions to keep challenge fair."
		);
	}
	if (targetDifficulty === "deadly") {
		advice.push(
			"Prepare a fail-forward off-ramp (retreat terms, objective compromise, or capture) to avoid hard dead ends."
		);
	}
	if (partySize >= 5) {
		advice.push(
			"Use layered threats in different lanes so the party cannot solve the fight with one formation."
		);
	}

	return advice.slice(0, 6);
}

export function splitKeywords(input: string | undefined): string[] {
	return Array.from(toWordSet(input));
}

export function formatPlanningSignal(result: unknown): string {
	const section = String(
		(result as { sectionType?: string })?.sectionType ?? "note"
	);
	const snippet = String(
		(result as { sectionContent?: string })?.sectionContent ?? ""
	)
		.replace(/\s+/g, " ")
		.slice(0, 220);
	return `${section}: ${snippet}`;
}
