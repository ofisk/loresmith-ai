/**
 * Pure helpers for player handout tools.
 */

/** Sanitize a string for use as a filename. */
export function sanitizeFileName(raw: string): string {
	const safe = raw
		.toLowerCase()
		.replace(/[^a-z0-9\-_\s]/g, "")
		.trim()
		.replace(/\s+/g, "-");
	return safe.length > 0 ? safe : "handout";
}
