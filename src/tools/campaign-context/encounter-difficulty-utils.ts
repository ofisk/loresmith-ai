import type { Entity } from "@/dao/entity-dao";

export type Difficulty = "easy" | "medium" | "hard" | "deadly";

export function getEntityText(entity: Entity): string {
	const content = entity.content;
	if (!content || typeof content !== "object" || Array.isArray(content)) {
		return "";
	}
	try {
		return JSON.stringify(content);
	} catch {
		return "";
	}
}

/**
 * Parse numeric challenge rating from entity content.
 * Checks cr, challengeRating, challenge_rating, challenge, level.
 * Handles fractions like "1/2".
 */
export function parseNumericChallenge(entity: Entity): number | null {
	const content = entity.content;
	if (!content || typeof content !== "object" || Array.isArray(content)) {
		return null;
	}
	const raw = content as Record<string, unknown>;
	const candidates = [
		raw.challengeRating,
		raw.challenge_rating,
		raw.challenge,
		raw.cr,
		raw.level,
	];
	for (const value of candidates) {
		if (typeof value === "number" && Number.isFinite(value)) {
			return value;
		}
		if (typeof value === "string") {
			const normalized = value.trim();
			if (!normalized) continue;
			if (normalized.includes("/")) {
				const [a, b] = normalized.split("/");
				const numerator = Number.parseFloat(a);
				const denominator = Number.parseFloat(b);
				if (
					Number.isFinite(numerator) &&
					Number.isFinite(denominator) &&
					denominator
				) {
					return numerator / denominator;
				}
			}
			const parsed = Number.parseFloat(normalized);
			if (Number.isFinite(parsed)) {
				return parsed;
			}
		}
	}
	return null;
}

/**
 * Infer threat band from entity (low/standard/high) based on CR or name/content keywords.
 *
 * CR-based bands: CR ≤ 2 → low, CR 3–7 → standard, CR ≥ 8 → high.
 * Fallback when CR is missing: keyword match in name/content
 * (e.g. legendary, ancient, boss → high; minion, scout, weak → low).
 */
export function inferThreatBand(entity: Entity): "low" | "standard" | "high" {
	const numeric = parseNumericChallenge(entity);
	if (numeric !== null) {
		if (numeric <= 2) return "low";
		if (numeric >= 8) return "high";
		return "standard";
	}

	const text = `${entity.name} ${getEntityText(entity)}`.toLowerCase();
	if (/legendary|ancient|arch|behemoth|boss|warlord|avatar|mythic/.test(text)) {
		return "high";
	}
	if (/minion|scout|weak|young|servant|cultist/.test(text)) {
		return "low";
	}
	return "standard";
}

/**
 * Get slot counts (low, standard, high) for a target difficulty and party size.
 *
 * Slots per difficulty: easy/medium use mostly low slots; hard adds standard;
 * deadly adds one high slot. Party size scales low-slot count (e.g. easy:
 * max(1, partySize-1) low, 1 standard, 0 high).
 */
export function getDifficultySlots(
	targetDifficulty: Difficulty,
	partySize: number
): { low: number; standard: number; high: number } {
	switch (targetDifficulty) {
		case "easy":
			return { low: Math.max(1, partySize - 1), standard: 1, high: 0 };
		case "medium":
			return { low: Math.max(1, partySize), standard: 1, high: 0 };
		case "hard":
			return { low: Math.max(2, partySize), standard: 2, high: 0 };
		case "deadly":
			return { low: Math.max(2, partySize), standard: 2, high: 1 };
		default:
			return { low: partySize, standard: 1, high: 0 };
	}
}

/**
 * Bump creature count up or down by steps for difficulty scaling.
 *
 * Up: +1 when base ≤ 2, else +ceil(base * 0.4) per step.
 * Down: -1 when base ≤ 2, else -ceil(base * 0.3) per step.
 * Result is clamped to minimum 1.
 */
export function bumpCount(base: number, steps: number): number {
	if (steps === 0) return Math.max(1, base);
	let next = Math.max(1, base);
	if (steps > 0) {
		for (let i = 0; i < steps; i += 1) {
			next += next <= 2 ? 1 : Math.ceil(next * 0.4);
		}
		return next;
	}
	for (let i = 0; i < Math.abs(steps); i += 1) {
		next = Math.max(1, next - (next <= 2 ? 1 : Math.ceil(next * 0.3)));
	}
	return Math.max(1, next);
}
