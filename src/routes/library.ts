// Library API routes for file management and search
// Handles file listing, search, metadata updates, and file operations

import { type Context, Hono } from "hono";
import { FileDAO } from "@/dao";
import { getDAOFactory } from "@/dao/dao-factory";
import { LibraryEntityDAO } from "@/dao/library-entity-dao";
import { getRequestLogger } from "@/lib/logger";
import { requireParam } from "@/lib/route-utils";
import { getLibraryService, LibraryRAGService } from "@/lib/service-factory";
import { requireUserJwt } from "@/middleware/auth";
import { LibraryEntityDiscoveryQueueService } from "@/services/campaign/library-entity-discovery-queue-service";
import type { AuthPayload } from "@/services/core/auth-service";
import { getLLMRateLimitService } from "@/services/llm/llm-rate-limit-service";
import type { SearchQuery } from "@/types/upload";

const library = new Hono<{
	Bindings: Env;
	Variables: { userAuth: AuthPayload };
}>();

library.use("*", requireUserJwt);

// Handler functions for library routes
export const handleGetFiles = async (
	c: Context<{ Bindings: any; Variables: { userAuth: AuthPayload } }>
) => {
	const log = getRequestLogger(c);
	try {
		const userAuth = (c as any).userAuth;
		const userId = userAuth?.username || "anonymous";
		const limit = parseInt(c.req.query("limit") || "20", 10);
		const offset = parseInt(c.req.query("offset") || "0", 10);

		// Get files directly from database instead of using old RAG service
		const fileDAO = getDAOFactory(c.env).fileDAO;
		const files = await fileDAO.getFilesForRag(userId);

		return c.json({
			success: true,
			files,
			pagination: {
				limit,
				offset,
				// Note: Using files.length as total count. For pagination support,
				// we should query the database for total count separately.
				total: files.length,
			},
		});
	} catch (error) {
		log.error("[handleGetFiles] Failed to get files", error);
		return c.json({ error: "Failed to get files" }, 500);
	}
};

export const handleSearchFiles = async (
	c: Context<{ Bindings: any; Variables: { userAuth: AuthPayload } }>
) => {
	const log = getRequestLogger(c);
	try {
		const userAuth = (c as any).userAuth;
		const userId = userAuth?.username || "anonymous";
		const query = c.req.query("q") || "";
		const limit = parseInt(c.req.query("limit") || "20", 10);
		const offset = parseInt(c.req.query("offset") || "0", 10);
		const includeTags = c.req.query("includeTags") !== "false";
		const includeSemantic = c.req.query("includeSemantic") !== "false";

		const searchQuery: SearchQuery = {
			query,
			userId,
			limit,
			offset,
			includeTags,
			includeSemantic,
		};

		const ragService = new LibraryRAGService(c.env);
		const results = await ragService.searchContent(
			userId,
			searchQuery.query,
			searchQuery.limit
		);

		return c.json({
			success: true,
			results: Array.isArray(results) ? results : [],
			query,
			pagination: {
				limit,
				offset,
				total: Array.isArray(results) ? results.length : 0,
			},
		});
	} catch (error) {
		log.error("[handleSearchFiles] Failed to search files", error);
		return c.json({ error: "Failed to search files" }, 500);
	}
};

export const handleGetStorageUsage = async (
	c: Context<{ Bindings: any; Variables: { userAuth: AuthPayload } }>
) => {
	const log = getRequestLogger(c);
	try {
		const userAuth = (c as any).userAuth;

		if (!userAuth) {
			return c.json({ error: "Authentication required" }, 401);
		}

		const libraryService = getLibraryService(c.env);
		const usage = await libraryService.getUserStorageUsage(
			userAuth.username,
			userAuth.isAdmin || false
		);

		return c.json({
			success: true,
			usage,
		});
	} catch (error) {
		log.error("[handleGetStorageUsage] Failed to get storage usage", error);
		return c.json({ error: "Failed to get storage usage" }, 500);
	}
};

export const handleGetLlmUsage = async (
	c: Context<{ Bindings: any; Variables: { userAuth: AuthPayload } }>
) => {
	const log = getRequestLogger(c);
	try {
		const userAuth = (c as any).userAuth;
		if (!userAuth) {
			return c.json({ error: "Authentication required" }, 401);
		}

		const rateLimitService = getLLMRateLimitService(c.env);
		const usage = await rateLimitService.getUsageStatus(
			userAuth.username,
			userAuth.isAdmin ?? false
		);

		const limits = {
			tph: usage.tphLimit,
			qph: usage.qphLimit,
			tpd: usage.tpdLimit,
			qpd: usage.qpdLimit,
		};

		return c.json({
			success: true,
			usage: {
				tph: usage.tph,
				qph: usage.qph,
				tpd: usage.tpd,
				qpd: usage.qpd,
				tphLimit: usage.tphLimit,
				qphLimit: usage.qphLimit,
				tpdLimit: usage.tpdLimit,
				qpdLimit: usage.qpdLimit,
				nextResetAt: usage.nextResetAt,
				atLimit: usage.atLimit,
				limitType: usage.limitType,
				monthlyUsage: usage.monthlyUsage,
				monthlyLimit: usage.monthlyLimit,
				creditsRemaining: usage.creditsRemaining,
			},
			limits,
		});
	} catch (error) {
		log.error("[handleGetLlmUsage] Failed to get LLM usage", error);
		return c.json({ error: "Failed to get LLM usage" }, 500);
	}
};

export const handleGetFileDetails = async (
	c: Context<{ Bindings: any; Variables: { userAuth: AuthPayload } }>
) => {
	const log = getRequestLogger(c);
	try {
		const fileId = requireParam(c, "fileId");
		if (fileId instanceof Response) return fileId;
		const userAuth = (c as any).userAuth;
		const userId = userAuth?.username || "anonymous";

		const fileDAO = getDAOFactory(c.env).fileDAO;
		const metadata = await fileDAO.getFileForRag(fileId, userId);

		if (!metadata) {
			return c.json({ error: "File not found" }, 404);
		}

		return c.json({
			success: true,
			metadata,
		});
	} catch (error) {
		log.error("[handleGetFileDetails] Failed to get file metadata", error);
		return c.json({ error: "Failed to get file metadata" }, 500);
	}
};

export const handleUpdateFile = async (
	c: Context<{ Bindings: any; Variables: { userAuth: AuthPayload } }>
) => {
	const log = getRequestLogger(c);
	try {
		const fileId = requireParam(c, "fileId");
		if (fileId instanceof Response) return fileId;
		await c.req.json(); // Consume request body
		const fileDAO = getDAOFactory(c.env).fileDAO;
		await fileDAO.updateFileRecord(fileId, "completed");
		const success = true;

		if (!success) {
			return c.json({ error: "Failed to update file metadata" }, 500);
		}

		return c.json({ success: true });
	} catch (error) {
		log.error("[handleUpdateFile] Failed to update file metadata", error);
		return c.json({ error: "Failed to update file metadata" }, 500);
	}
};

export const handleDeleteFile = async (
	c: Context<{ Bindings: any; Variables: { userAuth: AuthPayload } }>
) => {
	const log = getRequestLogger(c);
	try {
		let fileKey = requireParam(c, "fileId");
		if (fileKey instanceof Response) return fileKey;
		try {
			fileKey = decodeURIComponent(fileKey);
		} catch {
			// use as-is if decoding fails
		}
		const userAuth = (c as any).userAuth;
		const userId = userAuth?.username || "anonymous";

		const fileDAO = getDAOFactory(c.env).fileDAO;
		const metadata = await fileDAO.getFileForRag(fileKey, userId);

		if (!metadata) {
			return c.json({ error: "File not found" }, 404);
		}

		await c.env.R2.delete(metadata.file_key);
		await fileDAO.deleteFileProcessingChunks(fileKey);
		await fileDAO.removeFromSyncQueue(fileKey);
		await fileDAO.deleteFileForUser(fileKey, userId);

		return c.json({ success: true });
	} catch (error) {
		log.error("[handleDeleteFile] Failed to delete file", error);
		return c.json({ error: "Failed to delete file" }, 500);
	}
};

export const handleGetFileDownload = async (
	c: Context<{ Bindings: any; Variables: { userAuth: AuthPayload } }>
) => {
	const log = getRequestLogger(c);
	try {
		const fileId = requireParam(c, "fileId");
		if (fileId instanceof Response) return fileId;
		const userAuth = (c as any).userAuth;
		const userId = userAuth?.username || "anonymous";

		const fileDAO = getDAOFactory(c.env).fileDAO;
		const metadata = await fileDAO.getFileForRag(fileId, userId);

		if (!metadata) {
			return c.json({ error: "File not found" }, 404);
		}

		return c.json({
			success: true,
			fileKey: metadata.file_key,
			filename: metadata.file_name,
			fileSize: metadata.file_size,
		});
	} catch (error) {
		log.error("[handleGetFileDownload] Failed to generate download URL", error);
		return c.json({ error: "Failed to generate download URL" }, 500);
	}
};

export const handleRegenerateFileMetadata = async (
	c: Context<{ Bindings: any; Variables: { userAuth: AuthPayload } }>
) => {
	const log = getRequestLogger(c);
	try {
		const fileId = requireParam(c, "fileId");
		if (fileId instanceof Response) return fileId;
		const userAuth = (c as any).userAuth;
		const userId = userAuth?.username || "anonymous";

		const fileDAO = getDAOFactory(c.env).fileDAO;
		const metadata = await fileDAO.getFileForRag(fileId, userId);

		if (!metadata) {
			return c.json({ error: "File not found" }, 404);
		}

		return c.json({
			success: true,
			metadata,
		});
	} catch (error) {
		log.error(
			"[handleRegenerateFileMetadata] Failed to regenerate metadata",
			error
		);
		return c.json({ error: "Failed to regenerate metadata" }, 500);
	}
};

/**
 * POST /library/retry-entity-pipeline
 * Re-run library entity discovery after indexing completed (clears staged candidates and re-queues).
 */
export const handleRetryLibraryEntityPipeline = async (
	c: Context<{ Bindings: any; Variables: { userAuth: AuthPayload } }>
) => {
	const log = getRequestLogger(c);
	try {
		const userAuth = (c as any).userAuth;
		const userId = userAuth?.username || "anonymous";
		const body = (await c.req.json()) as { fileKey?: string };
		const fileKey = body?.fileKey;
		if (!fileKey) {
			return c.json({ error: "fileKey is required" }, 400);
		}

		const fileDAO = getDAOFactory(c.env).fileDAO;
		const file = await fileDAO.getFileForRag(fileKey, userId);
		if (!file) {
			return c.json({ error: "File not found" }, 404);
		}
		if (file.status !== FileDAO.STATUS.COMPLETED) {
			return c.json(
				{
					error: "File must finish indexing before retrying entity extraction",
					status: file.status,
				},
				400
			);
		}

		const libDao = new LibraryEntityDAO(c.env.DB);
		if (!(await libDao.isSchemaReady())) {
			return c.json({ error: "Library entity pipeline is not available" }, 503);
		}

		await libDao.resetForReExtraction(fileKey, userId);
		LibraryEntityDiscoveryQueueService.processQueue(c.env).catch(() => {});

		return c.json({
			success: true,
			message: "Library entity discovery re-queued",
		});
	} catch (error) {
		log.error("[handleRetryLibraryEntityPipeline] failed", error);
		return c.json({ error: "Internal server error" }, 500);
	}
};
