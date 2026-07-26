/**
 * Deep links from a cited source in a chat response into the app surface that
 * shows it: the library side panel for files, the entity details view for
 * graph entities.
 *
 * Uses window CustomEvents (the pattern already established by app-events.ts)
 * so a chat message can reach the sidebar and modal layer without either side
 * importing the other.
 */
import { APP_EVENT_TYPE } from "@/lib/app-events";

export interface OpenSourceResourceDetail {
	fileKey?: string;
	/** Used to filter the library list when the key alone can't locate it. */
	fileName?: string;
}

export interface OpenSourceEntityDetail {
	campaignId: string;
	entityId: string;
	entityName?: string;
}

export function openSourceResource(detail: OpenSourceResourceDetail): void {
	if (typeof window === "undefined") return;
	window.dispatchEvent(
		new CustomEvent<OpenSourceResourceDetail>(
			APP_EVENT_TYPE.OPEN_SOURCE_RESOURCE,
			{ detail }
		)
	);
}

export function openSourceEntity(detail: OpenSourceEntityDetail): void {
	if (typeof window === "undefined") return;
	window.dispatchEvent(
		new CustomEvent<OpenSourceEntityDetail>(APP_EVENT_TYPE.OPEN_SOURCE_ENTITY, {
			detail,
		})
	);
}
