import { normalizeEntityType } from "@/lib/entity/entity-types";

/**
 * Stable synthetic "campaign id" used only for entity ID formatting during
 * library-scoped extraction (`${synthetic}_${baseId}`). Must contain no `_`
 * so the first `_` in a full entity id separates prefix from id_suffix.
 */
export function getLibrarySyntheticCampaignId(fileKey: string): string {
	let h1 = 0;
	for (let i = 0; i < fileKey.length; i++) {
		h1 = (Math.imul(31, h1) + fileKey.charCodeAt(i)) | 0;
	}
	let h2 = 1;
	for (let i = fileKey.length - 1; i >= 0; i--) {
		h2 = (Math.imul(17, h2) + fileKey.charCodeAt(i)) | 0;
	}
	const hex = (h1 >>> 0).toString(16).padStart(8, "0");
	const hex2 = (h2 >>> 0).toString(16).padStart(8, "0");
	return `libfp${hex}${hex2}`;
}

/** Part after first `_` in extraction_entity_id (used when remapping to real campaign ids). */
export function extractionIdSuffix(extractionEntityId: string): string {
	const i = extractionEntityId.indexOf("_");
	if (i === -1) return extractionEntityId;
	return extractionEntityId.slice(i + 1);
}

export function buildLibraryEntityMergeKey(
	entityType: string,
	name: string
): string {
	const t = normalizeEntityType(entityType || "").toLowerCase();
	const n = (name || "").trim().toLowerCase().replace(/\s+/g, " ");
	return `${t}|${n}`;
}

export function buildLibraryContentFingerprint(
	fileSize: number | null | undefined,
	updatedAt: string | null | undefined
): string {
	return `${fileSize ?? 0}|${updatedAt ?? ""}`;
}
