/**
 * Pure helpers for loot/reward tools. Normalization and error detection.
 */

function nn(v: unknown) {
	return v === null || v === undefined ? undefined : v;
}

function toInt(v: unknown): number | undefined {
	if (typeof v === "number" && !Number.isNaN(v))
		return Math.max(0, Math.floor(v));
	if (typeof v === "string") {
		const n = Number(v);
		return !Number.isNaN(n) ? Math.max(0, Math.floor(n)) : undefined;
	}
	return undefined;
}

/** Normalize raw loot item from LLM output. */
export function normalizeLootItem(raw: unknown): unknown {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
	const o = raw as Record<string, unknown>;
	return {
		name: String(nn(o.name) ?? ""),
		itemType: String(nn(o.itemType) ?? nn(o.item_type) ?? "item"),
		rarity: String(nn(o.rarity) ?? "common"),
		description: String(nn(o.description) ?? ""),
		mechanicalNotes: nn(o.mechanicalNotes) ?? nn(o.mechanical_notes),
		storyHook: nn(o.storyHook) ?? nn(o.story_hook),
		estimatedValue:
			toInt(o.estimatedValue) ??
			toInt(o.estimated_value) ??
			toInt(o.estimatedValueGp) ??
			toInt(o.estimated_value_gp),
		valueUnit:
			typeof o.valueUnit === "string"
				? o.valueUnit
				: typeof o.value_unit === "string"
					? o.value_unit
					: undefined,
	};
}

/** Normalize currency to Record<unitName, amount>. Game-agnostic. */
export function normalizeCurrency(raw: unknown): Record<string, number> {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
	const o = raw as Record<string, unknown>;
	const num = (v: unknown) =>
		typeof v === "number"
			? Math.max(0, Math.floor(v))
			: typeof v === "string"
				? Math.max(0, Math.floor(Number(v)))
				: 0;
	const result: Record<string, number> = {};
	for (const [key, val] of Object.entries(o)) {
		if (typeof key === "string" && key.length > 0) {
			const n = num(val);
			if (n > 0) result[key] = n;
		}
	}
	return result;
}

/** Detect LLM no-output errors for fallback handling. */
export function isNoOutputError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return (
		message.includes("No output generated") ||
		message.includes("AI_NoOutputGeneratedError")
	);
}
