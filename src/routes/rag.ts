import type { Context } from "hono";
import { MEMORY_LIMIT_COPY } from "@/app-constants";
import { FileDAO } from "@/dao";
import { getDAOFactory } from "@/dao/dao-factory";
import { extractJwtFromContext } from "@/lib/auth-utils";
import { FileNotFoundError } from "@/lib/errors";
import {
	notifyFileIndexingStatus,
	notifyFileStatusUpdated,
	notifyFileUploadCompleteWithData,
	notifyIndexingCompleted,
	notifyIndexingFailed,
	notifyIndexingStarted,
} from "@/lib/notifications";
import { requireParam } from "@/lib/route-utils";
import type { Env } from "@/middleware/auth";
import type { AuthPayload } from "@/services/core/auth-service";
import { completeProgress } from "@/services/core/progress-service";
import { SyncQueueService } from "@/services/file/sync-queue-service";
import { LibraryRAGService } from "@/services/rag/rag-service";
import { RetryLimitService } from "@/services/retry-limit-service";

// Extend the context to include userAuth
type ContextWithAuth = Context<{ Bindings: Env }> & {
	userAuth?: AuthPayload;
};

// Search RAG index
export async function handleRagSearch(c: ContextWithAuth) {
	try {
		const userAuth = (c as any).userAuth;
		const { query, limit = 10 } = await c.req.json();

		if (!query) {
			return c.json({ error: "Query is required" }, 400);
		}

		const ragService = new LibraryRAGService(c.env);
		const results = await ragService.searchContent(
			userAuth.username,
			query,
			limit
		);

		return c.json({
			results: Array.isArray(results) ? results : [],
		});
	} catch (_error) {
		return c.json({ error: "Internal server error" }, 500);
	}
}

// Process file for RAG
export async function handleProcessFileForRag(c: ContextWithAuth) {
	try {
		const userAuth = (c as any).userAuth;
		const { fileKey, filename, description, tags } = await c.req.json();

		if (!fileKey || !filename) {
			return c.json({ error: "File key and filename are required" }, 400);
		}

		// Store file metadata in database
		const fileId = crypto.randomUUID();

		// Get file size from R2
		let fileSize = 0;
		try {
			const file = await c.env.R2.get(fileKey);
			if (file) {
				fileSize = file.size;
			} else {
			}
		} catch (_error) {}

		const fileDAO = getDAOFactory(c.env).fileDAO;
		await fileDAO.createFileRecord(
			fileId,
			fileKey,
			filename,
			description || "",
			tags ? JSON.stringify(tags) : "[]",
			userAuth.username,
			"processing",
			fileSize
		);

		// Extract JWT before setTimeout (context may not be available inside)
		const jwt = extractJwtFromContext(c);

		// Start processing in background
		setTimeout(async () => {
			try {
				try {
					await notifyIndexingStarted(c.env, userAuth.username, filename);
				} catch (_e) {}
				// Get file from R2
				const file = await c.env.R2.get(fileKey);
				if (!file) {
					throw new FileNotFoundError(fileKey);
				}

				// Update database status and file size - mark as uploaded
				await fileDAO.updateFileRecord(fileKey, "uploaded", file.size);

				// Actually process the file with LibraryRAGService
				const processResult = await SyncQueueService.processFileUpload(
					c.env,
					userAuth.username,
					fileKey,
					filename,
					jwt
				);

				if (!processResult.success) {
					throw new Error(processResult.error || processResult.message);
				}

				// Send notifications
				try {
					// Get the complete file record for the notification
					const fileRecord = await fileDAO.getFileForRag(
						fileKey,
						userAuth.username
					);
					if (fileRecord) {
						await notifyFileUploadCompleteWithData(c.env, userAuth.username, {
							...fileRecord,
							status: fileRecord.status ?? "uploaded",
							tags: fileRecord.tags
								? (JSON.parse(fileRecord.tags) as string[])
								: [],
						});
					} else {
					}
					await notifyIndexingCompleted(c.env, userAuth.username, filename);
				} catch (_error) {}

				completeProgress(fileKey, true);
			} catch (error) {
				completeProgress(fileKey, false, (error as Error).message);

				// Update database status
				await fileDAO.updateFileRecord(fileKey, "error");

				try {
					// Log technical error for debugging
					const technicalError = (error as Error)?.message;
					if (technicalError) {
					}
					// Send user-friendly notification without technical details
					await notifyIndexingFailed(c.env, userAuth.username, filename);
				} catch (_e) {}
			}
		}, 100);

		return c.json({ success: true, fileKey, fileId });
	} catch (_error) {
		return c.json({ error: "Internal server error" }, 500);
	}
}

// Update file metadata for RAG - trigger indexing with LibraryRAGService
export async function handleTriggerIndexing(c: ContextWithAuth) {
	try {
		const userAuth = (c as any).userAuth;
		const { fileKey } = await c.req.json();

		if (!fileKey) {
			return c.json({
				success: false,
				message: "File key is required to trigger indexing",
			});
		}

		// Check if file exists in database
		const fileDAO = getDAOFactory(c.env).fileDAO;
		const file = await fileDAO.getFileForRag(fileKey, userAuth.username);

		if (!file) {
			return c.json({ error: "File not found" }, 404);
		}

		// Check if file exists in R2 storage
		const r2File = await c.env.R2.head(fileKey);
		if (!r2File) {
			return c.json({
				success: false,
				message: "File not found in storage. The file may have been deleted.",
			});
		}

		// Check if file has a non-retryable error (e.g., memory limit)
		const processingError = await fileDAO.getProcessingError(fileKey);
		if (processingError?.code === "MEMORY_LIMIT_EXCEEDED") {
			return c.json(
				{
					success: false,
					error: "MEMORY_LIMIT_EXCEEDED",
					message: MEMORY_LIMIT_COPY.fileTooLarge(file.file_name),
					retryable: false,
				},
				400
			);
		}

		// In-progress check: block retry until current indexing completes
		const inProgressStatuses = [
			FileDAO.STATUS.PROCESSING,
			FileDAO.STATUS.SYNCING,
			FileDAO.STATUS.INDEXING,
		];
		if (
			file.status &&
			(inProgressStatuses as readonly string[]).includes(file.status)
		) {
			return c.json(
				{
					success: false,
					message:
						"Please wait for the current indexing to complete before retrying.",
					error: "INDEXING_IN_PROGRESS",
				},
				409
			);
		}

		// Reset status from ERROR to UPLOADED before retrying
		if (file.status === FileDAO.STATUS.ERROR || file.status === "failed") {
			// Limit check: per-file daily and monthly retry limits
			const retryLimit = await RetryLimitService.checkAndIncrementRetry(
				userAuth.username,
				fileKey,
				userAuth.isAdmin ?? false,
				c.env
			);
			if (!retryLimit.allowed) {
				return c.json(
					{
						success: false,
						message: retryLimit.reason,
						error: "RETRY_LIMIT_EXCEEDED",
					},
					429
				);
			}
			// Clear processing error when retrying (if it was a retryable error)
			if (
				!processingError ||
				processingError.code !== "MEMORY_LIMIT_EXCEEDED"
			) {
				await fileDAO.updateFileRecord(fileKey, FileDAO.STATUS.UPLOADED);
				// Reset failed chunks to pending so processSyncQueue will retry them (chunked large files).
				await fileDAO.resetFailedChunksToPending(fileKey);
			}

			// Send status update notification so UI can update immediately
			try {
				await notifyFileStatusUpdated(
					c.env,
					userAuth.username,
					fileKey,
					file.file_name,
					FileDAO.STATUS.UPLOADED,
					file.file_size || undefined
				);
			} catch (_notifyError) {}
		}

		// Use sync queue service to handle indexing
		try {
			// Extract JWT token from Authorization header
			const jwt = extractJwtFromContext(c);

			// Send status-only notification BEFORE processing starts so UI updates immediately
			// We don't send user-facing notification here to avoid duplicate notifications if processing fails immediately
			try {
				await notifyFileIndexingStatus(
					c.env,
					userAuth.username,
					fileKey,
					file.file_name,
					FileDAO.STATUS.SYNCING,
					{
						visibility: "status-only",
						fileSize: file.file_size || undefined,
					}
				);
			} catch (_notifyError) {}

			const result = await SyncQueueService.processFileUpload(
				c.env,
				userAuth.username,
				fileKey,
				file.file_name,
				jwt
			);

			// Handle queued files - they're successfully queued, processing happens in background
			if (result.queued) {
				return c.json({
					success: true,
					message: result.message,
					queued: true,
					isIndexed: false,
				});
			}

			// Send user-facing notification only after processing completes (success or failure)
			if (!result.success) {
				// Send user-facing error notification (without technical details)
				try {
					await notifyFileIndexingStatus(
						c.env,
						userAuth.username,
						fileKey,
						file.file_name,
						FileDAO.STATUS.ERROR,
						{
							visibility: "both",
							fileSize: file.file_size || undefined,
							// Don't pass reason to avoid showing technical errors to users
						}
					);
				} catch (_notifyError) {}
			} else {
				// Processing succeeded - success notification will be sent by the processing pipeline
				// Just send a status update to ensure UI is current
				try {
					await notifyFileIndexingStatus(
						c.env,
						userAuth.username,
						fileKey,
						file.file_name,
						FileDAO.STATUS.COMPLETED,
						{
							visibility: "status-only",
							fileSize: file.file_size || undefined,
						}
					);
				} catch (_notifyError) {}
			}

			return c.json({
				success: result.success,
				message: result.message,
				queued: result.queued,
				isIndexed: result.success && !result.queued,
			});
		} catch (syncError) {
			return c.json({
				success: false,
				message: `Failed to trigger indexing: ${syncError instanceof Error ? syncError.message : "Unknown error"}`,
				isIndexed: false,
			});
		}
	} catch (error) {
		return c.json(
			{
				success: false,
				error: "Internal server error",
				message: error instanceof Error ? error.message : "Unknown error",
			},
			500
		);
	}
}

// Get files for RAG
export async function handleGetFilesForRag(c: ContextWithAuth) {
	try {
		const userAuth = (c as any).userAuth;

		const fileDAO = getDAOFactory(c.env).fileDAO;
		const files = await fileDAO.getFilesForRag(userAuth.username);

		// Metadata updates are handled by LibraryRAGService

		return c.json({ files });
	} catch (_error) {
		return c.json({ error: "Internal server error" }, 500);
	}
}

// Get file chunks for RAG
export async function handleGetFileChunksForRag(c: ContextWithAuth) {
	try {
		const userAuth = (c as any).userAuth;
		const fileKey = requireParam(c, "fileKey");
		if (fileKey instanceof Response) return fileKey;

		const fileDAO = getDAOFactory(c.env).fileDAO;
		const chunks = await fileDAO.getFileChunksForRag(
			fileKey,
			userAuth.username
		);

		return c.json({ chunks });
	} catch (_error) {
		return c.json({ error: "Internal server error" }, 500);
	}
}

// Check and update file indexing status
export async function handleCheckFileIndexingStatus(c: ContextWithAuth) {
	try {
		const userAuth = (c as any).userAuth;
		const { fileKey } = await c.req.json();

		if (!fileKey) {
			return c.json({ error: "fileKey is required" }, 400);
		}

		const fileDAO = getDAOFactory(c.env).fileDAO;

		// Check if file is indexed
		const { isIndexed, error } = await fileDAO.checkFileIndexingStatus(
			fileKey,
			userAuth.username,
			c.env
		);

		// Update file status based on indexing result
		if (!isIndexed) {
			await fileDAO.updateFileRecord(fileKey, FileDAO.STATUS.UNINDEXED);
		} else {
			await fileDAO.updateFileRecord(fileKey, FileDAO.STATUS.COMPLETED);
		}

		return c.json({
			success: true,
			fileKey,
			isIndexed,
			error: error || null,
			status: isIndexed ? FileDAO.STATUS.COMPLETED : FileDAO.STATUS.UNINDEXED,
		});
	} catch (_error) {
		return c.json({ error: "Internal server error" }, 500);
	}
}

// Bulk check and update file indexing statuses
export async function handleBulkCheckFileIndexingStatus(c: ContextWithAuth) {
	try {
		const userAuth = (c as any).userAuth;

		const fileDAO = getDAOFactory(c.env).fileDAO;

		// Get all files that might need checking (skip completed files as they're verified indexed)
		const files = await fileDAO.getFilesForRag(userAuth.username);
		const filesToCheck = files.filter(
			(f) =>
				f.status === FileDAO.STATUS.UPLOADED ||
				f.status === FileDAO.STATUS.SYNCING ||
				f.status === FileDAO.STATUS.PROCESSING ||
				f.status === FileDAO.STATUS.INDEXING
		);

		const results = [];
		let unindexedCount = 0;

		for (const file of filesToCheck) {
			try {
				const { isIndexed, error } = await fileDAO.checkFileIndexingStatus(
					file.file_key,
					userAuth.username,
					c.env
				);

				if (!isIndexed) {
					await fileDAO.updateFileRecord(
						file.file_key,
						FileDAO.STATUS.UNINDEXED
					);
					unindexedCount++;
				}

				results.push({
					fileKey: file.file_key,
					fileName: file.file_name,
					isIndexed,
					error: error || null,
				});
			} catch (error) {
				results.push({
					fileKey: file.file_key,
					fileName: file.file_name,
					isIndexed: false,
					error: error instanceof Error ? error.message : "Unknown error",
				});
			}
		}

		return c.json({
			success: true,
			totalChecked: filesToCheck.length,
			unindexedCount,
			results,
		});
	} catch (_error) {
		return c.json({ error: "Internal server error" }, 500);
	}
}

export const handleDeleteFileForRag = async (c: any) => {
	try {
		const fileKey = requireParam(c, "fileKey");
		if (fileKey instanceof Response) return fileKey;

		// Initialize DAO
		const fileDAO = new FileDAO(c.env.DB);

		// Check if file exists before deletion
		const existingFile = await fileDAO.getFileMetadata(fileKey);

		// If file doesn't exist in database, try to clean up any remaining chunks
		if (!existingFile) {
			// Delete any remaining chunks from database
			try {
				await fileDAO.deleteFile(fileKey, c.env.R2);
			} catch (_error) {}

			// Try to delete from R2 anyway (in case it still exists)
			try {
				await c.env.R2.delete(fileKey);
			} catch (_error) {}

			return c.json({
				success: true,
				message: "File was already deleted or cleaned up",
			});
		}
		// Delete from R2 - handle failures gracefully
		try {
			await c.env.R2.delete(fileKey);
		} catch (_error) {
			// Continue with database cleanup even if R2 deletion fails
		}
		// Delete all related data using DAO
		await fileDAO.deleteFile(fileKey, c.env.R2);

		// Verify deletion
		const verifyFile = await fileDAO.getFileMetadata(fileKey);

		if (verifyFile) {
			return c.json({ error: "File deletion failed" }, 500);
		}
		return c.json({ success: true });
	} catch (_error) {
		return c.json({ error: "Internal server error" }, 500);
	}
};
