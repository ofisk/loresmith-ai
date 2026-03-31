/**
 * File lifecycle values persisted on `file_metadata.status` and used across UI + DAO.
 * Keep aligned with DB expectations and `FileDAO.STATUS`.
 */
export const FILE_UPLOAD_STATUS = {
	UPLOADING: "uploading",
	UPLOADED: "uploaded",
	SYNCING: "syncing",
	PROCESSING: "processing",
	INDEXING: "indexing",
	COMPLETED: "completed",
	ERROR: "error",
	UNINDEXED: "unindexed",
} as const;

export type FileUploadStatusValue =
	(typeof FILE_UPLOAD_STATUS)[keyof typeof FILE_UPLOAD_STATUS];
