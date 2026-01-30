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
} as const;

export type AppEventType = (typeof APP_EVENT_TYPE)[keyof typeof APP_EVENT_TYPE];
