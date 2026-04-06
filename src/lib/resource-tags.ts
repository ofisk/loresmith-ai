import { getDisplayName } from "@/lib/display-name-utils";

/**
 * Safely parse tags from JSON string, array, or comma-separated text.
 */
export function parseTags(tags: string | string[] | undefined): string[] {
	if (!tags) return [];
	if (Array.isArray(tags)) return tags;
	if (typeof tags === "string") {
		try {
			const parsed = JSON.parse(tags);
			if (Array.isArray(parsed)) {
				return parsed;
			}
		} catch {
			return tags
				.split(",")
				.map((t) => t.trim())
				.filter((t) => t.length > 0);
		}
	}
	return [];
}

export type ResourceSearchableFile = {
	display_name?: string;
	file_name?: string;
	name?: string;
	description?: string;
	tags?: string[] | string;
};

/**
 * Combined searchable text for client-side library search (display name, filename, description, tags).
 */
export function getResourceSearchHaystack(
	file: ResourceSearchableFile
): string {
	const parts = [
		getDisplayName(file),
		file.file_name ?? "",
		file.description ?? "",
		...parseTags(file.tags),
	];
	return parts.join(" ");
}

export function matchesResourceSearch(
	file: ResourceSearchableFile,
	query: string
): boolean {
	const q = query.trim();
	if (!q) return true;
	return getResourceSearchHaystack(file)
		.toLowerCase()
		.includes(q.toLowerCase());
}
