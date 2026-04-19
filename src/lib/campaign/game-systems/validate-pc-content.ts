import type { D1Database } from "@cloudflare/workers-types";
import { genericPcContentSchema } from "./schemas";

export interface ValidatePcContentResult {
	ok: boolean;
	normalizedContent: unknown;
	errors?: string[];
}

/**
 * Validates `pcs` entity JSON with a **single permissive** schema (any object shape).
 * `campaignId` is kept for a stable API for callers; `game_system` does not restrict fields.
 */
export async function validateAndNormalizePcContent(
	_db: D1Database,
	_campaignId: string,
	content: unknown
): Promise<ValidatePcContentResult> {
	const parsed = genericPcContentSchema.safeParse(
		content === undefined || content === null ? {} : content
	);
	if (!parsed.success) {
		return {
			ok: false,
			normalizedContent: content,
			errors: parsed.error.issues.map(
				(i) => `${i.path.join(".") || "root"}: ${i.message}`
			),
		};
	}
	return { ok: true, normalizedContent: parsed.data };
}

/** Human-facing one-liner for roster UI from arbitrary PC content. */
export function publicPcSheetSummary(content: unknown): {
	displayName: string;
	subtitle?: string;
} {
	if (!content || typeof content !== "object" || Array.isArray(content)) {
		return { displayName: "Unknown" };
	}
	const c = content as Record<string, unknown>;
	const name =
		(typeof c.characterName === "string" && c.characterName.trim()) ||
		(typeof c.name === "string" && c.name.trim()) ||
		(typeof c.title === "string" && c.title.trim()) ||
		(typeof c.label === "string" && c.label.trim()) ||
		"Unnamed";
	const parts: string[] = [];
	if (typeof c.playbook === "string" && c.playbook.trim()) {
		parts.push(c.playbook.trim());
	}
	if (typeof c.characterClass === "string" && c.characterClass.trim()) {
		parts.push(c.characterClass.trim());
	}
	if (c.characterLevel !== undefined && c.characterLevel !== "") {
		parts.push(String(c.characterLevel));
	}
	if (typeof c.characterRace === "string" && c.characterRace.trim()) {
		parts.push(c.characterRace.trim());
	}
	return {
		displayName: name,
		subtitle: parts.length > 0 ? parts.join(" · ") : undefined,
	};
}
