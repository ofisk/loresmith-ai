/**
 * Centralized names for window CustomEvents used for app-level communication.
 * Use these constants for both addEventListener and dispatchEvent so listeners
 * and emitters stay in sync.
 */
export const APP_EVENT_TYPE = {
	UI_HINT: "ui-hint",
	CAMPAIGN_CREATED: "campaign-created",
	CAMPAIGN_DELETED: "campaign-deleted",
	CAMPAIGN_FILE_ADDED: "campaign-file-added",
	CAMPAIGN_FILE_REMOVED: "campaign-file-removed",
	SHARDS_GENERATED: "shards-generated",
	FILE_STATUS_UPDATED: "file-status-updated",
	FILE_CHANGED: "file-changed",
	ENTITY_EXTRACTION_COMPLETED: "entity-extraction-completed",
	REBUILD_STATUS_CHANGED: "rebuild-status-changed",
	JWT_CHANGED: "jwt-changed",
	JWT_EXPIRED: "jwt-expired",
	/** Focus a library file, e.g. from a citation in a chat response. */
	OPEN_SOURCE_RESOURCE: "open-source-resource",
	/** Open an entity's details, e.g. from a citation in a chat response. */
	OPEN_SOURCE_ENTITY: "open-source-entity",
	/** Reopen the Campaigns list dialog, e.g. after cancelling out of Create Campaign. */
	REOPEN_CAMPAIGNS_LIST: "reopen-campaigns-list",
	/** Reopen the Resources list dialog, e.g. after cancelling out of Add Resource. */
	REOPEN_RESOURCES_LIST: "reopen-resources-list",
} as const;

export type AppEventType = (typeof APP_EVENT_TYPE)[keyof typeof APP_EVENT_TYPE];
