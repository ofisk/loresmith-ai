/**
 * Human-readable titles for staged entities shown as "shards" in the UI.
 * Handles id-like entity.name values and prefers content.title / filenames.
 */

import { prettifyLibraryImageFilename } from "@/lib/display-name-utils";

/** True when a string looks like a DB entity id (UUID or campaignId_uuid). */
export function looksLikeStagedEntityId(str: string): boolean {
	if (!str) return false;
	return (
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(
			str
		) ||
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i.test(
			str
		) ||
		(str.includes("_") && str.length > 30)
	);
}

function stripVisualInspirationBoilerplate(text: string): string {
	let s = text.trim();
	if (s.startsWith("Visual inspiration reference")) {
		const idx = s.indexOf("\n\n");
		if (idx !== -1) {
			s = s.slice(idx + 2).trim();
		}
	}
	return s;
}

function firstSentenceOrTruncation(text: string, maxLen: number): string {
	const first = text.split(/[.!?]\s/)[0]?.trim() ?? "";
	if (!first) return "";
	return first.length > maxLen ? `${first.slice(0, maxLen - 3)}...` : first;
}

/**
 * Pick the title shown on staged shard cards for an entity row.
 */
export function resolveStagedShardDisplayTitle(entity: {
	name: string;
	entityType: string;
	content: unknown;
	metadata: Record<string, unknown> | null;
}): string {
	const metadata = entity.metadata || {};

	if (typeof metadata.title === "string" && metadata.title.trim()) {
		return metadata.title.trim();
	}

	let contentTitle: string | undefined;
	if (
		entity.content &&
		typeof entity.content === "object" &&
		entity.content !== null
	) {
		const c = entity.content as Record<string, unknown>;
		if (typeof c.title === "string" && c.title.trim()) {
			contentTitle = c.title.trim();
		}
	}

	const rawName = (entity.name || "").trim();

	if (contentTitle && (!rawName || looksLikeStagedEntityId(rawName))) {
		return contentTitle;
	}

	if (rawName && !looksLikeStagedEntityId(rawName)) {
		return rawName;
	}

	if (contentTitle) {
		return contentTitle;
	}

	const resourceName =
		typeof metadata.resourceName === "string" ? metadata.resourceName : "";
	if (resourceName && resourceName !== "unknown") {
		return prettifyLibraryImageFilename(resourceName);
	}

	if (
		entity.entityType === "visual_inspiration" &&
		entity.content &&
		typeof entity.content === "object"
	) {
		const t = (entity.content as { text?: string }).text;
		if (typeof t === "string" && t.trim()) {
			const body = stripVisualInspirationBoilerplate(t);
			const short = firstSentenceOrTruncation(body, 72);
			if (short.length >= 8) {
				return short;
			}
		}
	}

	if (entity.entityType === "visual_inspiration") {
		return "Visual inspiration";
	}

	return rawName || "Unnamed";
}
