/**
 * Titles for visual_inspiration shards.
 *
 * The vision pass that describes an image is asked to name it in the same
 * response, and writes that name into a `Title:` header on the description
 * blob. Reading it back here is what lets the staging path skip a second
 * (ANALYSIS-tier) call whose only job was to re-read the description and
 * invent a title from it.
 */

/** Header line carrying the title the vision call already produced. */
export const VISION_TITLE_HEADER = "Title:";

/** Cap matching the length the title model's output was previously trimmed to. */
const MAX_TITLE_CHARS = 120;

/** Trim quotes/whitespace and cap length, shared by both title sources. */
export function normalizeVisualInspirationTitle(raw: string): string {
	let title = raw.trim().replace(/^["'\s]+|["'\s]+$/g, "");
	if (title.length > MAX_TITLE_CHARS) {
		title = `${title.slice(0, MAX_TITLE_CHARS - 3)}...`;
	}
	return title;
}

/**
 * Split a raw vision response into its `TITLE:` first line and the description
 * body. Returns `title: null` when the model ignored the instruction, in which
 * case the whole response is the description and the caller falls back to the
 * title model.
 */
export function splitVisionTitleAndDescription(visionText: string): {
	title: string | null;
	description: string;
} {
	const trimmed = visionText.trim();
	const firstNewline = trimmed.indexOf("\n");
	const firstLine =
		firstNewline === -1 ? trimmed : trimmed.slice(0, firstNewline);
	const match = firstLine.match(/^\s*TITLE\s*:\s*(.+?)\s*$/i);
	if (!match) {
		return { title: null, description: trimmed };
	}
	const title = normalizeVisualInspirationTitle(match[1]);
	if (!title) {
		return { title: null, description: trimmed };
	}
	return {
		title,
		description:
			firstNewline === -1 ? "" : trimmed.slice(firstNewline + 1).trim(),
	};
}

/**
 * Read the `Title:` header the vision pass wrote, if any.
 *
 * Content extracted before that pass started emitting one returns null, so
 * previously-uploaded images still route to the title model.
 */
export function readVisionTitleHeader(fullText: string): string | null {
	const trimmed = fullText.trim();
	if (!trimmed.startsWith("Visual inspiration reference")) {
		return null;
	}
	const headerEnd = trimmed.indexOf("\n\n");
	const headerBlock = headerEnd === -1 ? trimmed : trimmed.slice(0, headerEnd);
	for (const line of headerBlock.split("\n")) {
		const match = line.match(/^\s*Title\s*:\s*(.+?)\s*$/i);
		if (match) {
			const title = normalizeVisualInspirationTitle(match[1]);
			if (title) return title;
		}
	}
	return null;
}
