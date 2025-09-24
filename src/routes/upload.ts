import type { Context } from "hono";
import { getDAOFactory } from "../dao/dao-factory";
import { FileDAO } from "../dao/file-dao";
import {
  notifyFileUploadCompleteWithData,
  notifyFileUploadFailed,
  notifyIndexingStarted,
  notifyIndexingCompleted,
  notifyIndexingFailed,
  notifyFileStatusUpdated,
  notifyFileUpdated,
} from "../lib/notifications";
import type { Env } from "../middleware/auth";
import type { AuthPayload } from "../services/auth-service";
import { API_CONFIG } from "../shared-config";
import { SyncQueueService } from "../services/sync-queue-service";
import { buildAutoRAGFileKey, buildStagingFileKey } from "../utils/file-keys";
import { nanoid } from "../utils/nanoid";

/**
 * Helper function to process a file with AutoRAG and send notifications
 */
async function processFileWithAutoRAG(
  env: Env,
  autoragKey: string,
  userId: string,
  filename: string,
  fileKey: string,
  logPrefix: string,
  jwt?: string
): Promise<void> {
  try {
    console.log(`${logPrefix} Starting AutoRAG processing for:`, filename);
    console.log(`${logPrefix} AutoRAG processing params:`, {
      autoragKey,
      userId,
      filename,
      fileKey,
      jwtPresent: jwt ? "yes" : "no",
    });

    // Send indexing started notification (fire-and-forget)
    notifyIndexingStarted(env, userId, filename).catch((notifyError) => {
      console.error(
        `${logPrefix} Indexing started notification failed:`,
        notifyError
      );
    });
    console.log(
      `${logPrefix} Indexing started notification sent (fire-and-forget)`
    );

    // Update database status - mark as uploaded (ready for AutoRAG)
    const fileDAO = getDAOFactory(env).fileDAO;
    const r2File = await env.R2.get(fileKey);
    await fileDAO.updateFileRecord(
      autoragKey,
      FileDAO.STATUS.UPLOADED,
      r2File?.size || 0
    );
    console.log(`${logPrefix} File marked as uploaded for:`, filename);

    // Trigger AutoRAG processing using the same pattern as retry
    const result = await SyncQueueService.processFileUpload(
      env,
      userId,
      autoragKey,
      filename,
      jwt
    );

    console.log(`${logPrefix} AutoRAG processing initiated for:`, filename);
    console.log(`${logPrefix} SyncQueueService result:`, result);

    // Send status update notification with complete file data (fire-and-forget)
    const fileRecord = await fileDAO.getFileForRag(autoragKey, userId);
    if (fileRecord) {
      notifyFileUpdated(env, userId, fileRecord).catch((notifyError) => {
        console.error(
          `${logPrefix} File updated notification failed:`,
          notifyError
        );
      });
    } else {
      // Fallback to basic notification if file record not found
      notifyFileStatusUpdated(
        env,
        userId,
        autoragKey,
        filename,
        FileDAO.STATUS.UPLOADED,
        r2File?.size || 0
      ).catch((notifyError) => {
        console.error(`${logPrefix} Status notification failed:`, notifyError);
      });
    }

    // Send file upload completion notification with complete data (fire-and-forget)
    if (fileRecord) {
      notifyFileUploadCompleteWithData(env, userId, fileRecord).catch(
        (notifyError) => {
          console.error(
            `${logPrefix} Upload complete notification failed:`,
            notifyError
          );
        }
      );
    }

    // Send indexing completed notification (fire-and-forget)
    notifyIndexingCompleted(env, userId, filename).catch((notifyError) => {
      console.error(
        `${logPrefix} Indexing completed notification failed:`,
        notifyError
      );
    });
  } catch (error) {
    console.error(
      `${logPrefix} AutoRAG processing failed for ${filename}:`,
      error
    );

    // Update file status to error
    const fileDAO = getDAOFactory(env).fileDAO;
    await fileDAO.updateFileRecord(autoragKey, FileDAO.STATUS.ERROR);

    // Send error notifications (fire-and-forget)
    notifyFileStatusUpdated(
      env,
      userId,
      autoragKey,
      filename,
      FileDAO.STATUS.ERROR
    ).catch((notifyError) => {
      console.error(
        `${logPrefix} Error status notification failed:`,
        notifyError
      );
    });

    // Send indexing failed notification (fire-and-forget)
    notifyIndexingFailed(
      env,
      userId,
      filename,
      (error as Error)?.message
    ).catch((notifyError) => {
      console.error(
        `${logPrefix} Indexing failed notification failed:`,
        notifyError
      );
    });

    throw error;
  }
}

/**
 * Helper function to start AutoRAG processing in background
 */
function startAutoRAGProcessing(
  env: Env,
  autoragKey: string,
  userId: string,
  filename: string,
  fileKey: string,
  logPrefix: string,
  jwt?: string
): void {
  console.log(
    `${logPrefix} startAutoRAGProcessing called for file: ${filename}`
  );

  // Execute AutoRAG processing immediately instead of using setTimeout
  // Cloudflare Workers don't reliably support setTimeout with async callbacks
  console.log(
    `${logPrefix} Starting AutoRAG processing immediately for file: ${filename}`
  );

  processFileWithAutoRAG(
    env,
    autoragKey,
    userId,
    filename,
    fileKey,
    logPrefix,
    jwt
  )
    .then(() => {
      console.log(
        `${logPrefix} processFileWithAutoRAG completed successfully for file: ${filename}`
      );
    })
    .catch((error) => {
      console.error(
        `${logPrefix} processFileWithAutoRAG failed for file ${filename}:`,
        error
      );
    });

  console.log(
    `${logPrefix} AutoRAG processing started (no setTimeout) for file: ${filename}`
  );
}

// Extend the context to include userAuth
type ContextWithAuth = Context<{
  Bindings: Env;
  Variables: { userAuth: AuthPayload };
}>;

// Type for upload session from Durable Object
interface UploadSessionData {
  id: string;
  userId: string;
  fileKey: string;
  uploadId: string;
  filename: string;
  fileSize: number;
  totalParts: number;
  uploadedParts: number;
  status: "pending" | "uploading" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  autoRAGChunking?: boolean;
}

/**
 * GET /upload/status/:tenant/:filename
 * Check if a file exists in staging
 */
export async function handleUploadStatus(c: ContextWithAuth) {
  try {
    const tenant = c.req.param("tenant");
    const filename = c.req.param("filename");
    const userAuth = (c as any).userAuth as AuthPayload;
    console.log("[handleUploadStatus] userAuth:", userAuth);

    if (!tenant || !filename) {
      return c.json({ error: "tenant and filename are required" }, 400);
    }

    // Check if R2 is available by trying to list objects
    try {
      await c.env.R2.list({ limit: 1 });
    } catch (error) {
      console.error("[Upload] R2 not available:", error);
      return c.json({ error: "Storage not available" }, 503);
    }

    const key = buildStagingFileKey(tenant, filename);
    const object = await c.env.R2.head(key);
    const exists = object
      ? {
          size: object.size,
          contentType: object.httpMetadata?.contentType,
          uploaded: object.uploaded,
        }
      : null;
    const metadata = exists
      ? {
          size: exists.size,
          contentType: exists.contentType,
          uploaded: exists.uploaded,
        }
      : null;

    return c.json({
      success: true,
      exists: !!exists,
      metadata,
    });
  } catch (error) {
    console.error("[Upload] Error checking upload status:", error);
    return c.json({ error: "Failed to check upload status" }, 500);
  }
}

/**
 * PUT /upload/direct/:tenant/:filename
 * Handle direct file upload to R2 (for local development)
 */
export async function handleDirectUpload(c: ContextWithAuth) {
  try {
    const tenant = c.req.param("tenant");
    const filename = c.req.param("filename");
    const userAuth = (c as any).userAuth as AuthPayload;

    if (!tenant || !filename) {
      return c.json({ error: "tenant and filename are required" }, 400);
    }

    // Validate tenant matches authenticated user
    if (tenant !== userAuth?.username) {
      return c.json({ error: "Access denied" }, 403);
    }

    // Get the file content
    const fileBuffer = await c.req.arrayBuffer();
    const key = buildStagingFileKey(tenant, filename);

    // Upload directly to R2
    await c.env.R2.put(key, fileBuffer, {
      httpMetadata: {
        contentType: c.req.header("Content-Type") || "application/octet-stream",
      },
    });

    console.log(
      `[DirectUpload] File uploaded: ${key} (${fileBuffer.byteLength} bytes)`
    );

    // Insert file metadata into database
    const fileDAO = getDAOFactory(c.env).fileDAO;
    const autoragKey = buildAutoRAGFileKey(tenant, filename);

    try {
      await fileDAO.insertFileForProcessing(
        autoragKey,
        filename,
        "", // description
        "[]", // tags (empty array as JSON string)
        tenant,
        fileBuffer.byteLength
      );
      console.log(`[DirectUpload] Inserted file metadata: ${autoragKey}`);
    } catch (error) {
      console.error(`[DirectUpload] Failed to insert file metadata: ${error}`);
      // Don't fail the upload if metadata insertion fails
    }

    // Extract JWT token from Authorization header
    const authHeader = c.req.header("Authorization");
    const jwt = authHeader?.replace(/^Bearer\s+/i, "");

    console.log(
      `[DirectUpload] About to start AutoRAG processing with params:`,
      {
        autoragKey,
        userId: userAuth.username,
        filename,
        fileKey: key,
        jwtPresent: jwt ? "yes" : "no",
        jwtLength: jwt?.length || 0,
      }
    );

    // Start AutoRAG processing in background
    startAutoRAGProcessing(
      c.env,
      autoragKey,
      userAuth.username,
      filename,
      key,
      "[DirectUpload]",
      jwt
    );

    console.log(
      `[DirectUpload] AutoRAG processing scheduled for file: ${filename}`
    );

    return c.json({
      success: true,
      key,
      size: fileBuffer.byteLength,
      uploadedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[DirectUpload] Upload error:", error);
    try {
      const tenant = c.req.param("tenant");
      const filename = c.req.param("filename");
      const userAuth = (c as any).userAuth as AuthPayload;
      if (tenant && filename && userAuth?.username === tenant) {
        await notifyFileUploadFailed(
          c.env,
          userAuth.username,
          filename,
          (error as Error)?.message
        );
      }
    } catch (_e) {}
    return c.json({ error: "Internal server error" }, 500);
  }
}

/**
 * GET /library/files
 * Get all files for the authenticated user
 */
export async function handleGetFiles(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth as AuthPayload;

    if (!userAuth || !userAuth.username) {
      return c.json({ error: "User authentication required" }, 401);
    }

    const fileDAO = getDAOFactory(c.env).fileDAO;
    const files = await fileDAO.getFilesByUser(userAuth.username);

    return c.json({ files: files || [] });
  } catch (error) {
    console.error("Error fetching files:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

/**
 * PUT /library/files/:fileKey/metadata
 * Update file metadata
 */
export async function handleUpdateFileMetadata(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth as AuthPayload;
    const fileKey = c.req.param("fileKey");
    const { description, tags } = await c.req.json();

    if (!fileKey) {
      return c.json({ error: "File key is required" }, 400);
    }

    if (!userAuth || !userAuth.username) {
      return c.json({ error: "User authentication required" }, 401);
    }

    // Verify the fileKey belongs to the authenticated user
    if (
      !fileKey.startsWith(`${userAuth.username}/`) &&
      !fileKey.startsWith(`uploads/${userAuth.username}/`)
    ) {
      return c.json({ error: "Access denied to this file" }, 403);
    }

    const fileDAO = getDAOFactory(c.env).fileDAO;

    // Try to update both tables to ensure consistency
    try {
      await fileDAO.updateFileMetadata(fileKey, { description, tags });
    } catch (error) {
      console.warn(
        `[handleUpdateFileMetadata] Failed to update file_metadata table: ${error}`
      );
    }

    try {
      await fileDAO.updateFileMetadataForRag(
        fileKey,
        userAuth.username,
        description || "",
        tags ? JSON.stringify(tags) : "[]"
      );
    } catch (error) {
      console.warn(
        `[handleUpdateFileMetadata] Failed to update files table: ${error}`
      );
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("Error updating file metadata:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

/**
 * GET /library/files/:fileKey/status
 * Get file status information
 */
export async function handleGetFileStatus(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth as AuthPayload;
    const fileKey = c.req.param("fileKey");

    if (!fileKey) {
      return c.json({ error: "File key is required" }, 400);
    }

    if (!userAuth || !userAuth.username) {
      return c.json({ error: "User authentication required" }, 401);
    }

    // Verify the fileKey belongs to the authenticated user
    if (
      !fileKey.startsWith(`${userAuth.username}/`) &&
      !fileKey.startsWith(`uploads/${userAuth.username}/`)
    ) {
      return c.json({ error: "Access denied to this file" }, 403);
    }

    const fileDAO = getDAOFactory(c.env).fileDAO;
    const file = await fileDAO.getFileStatusInfo(fileKey, userAuth.username);

    if (!file) {
      return c.json({ error: "File not found" }, 404);
    }

    return c.json({
      fileKey,
      status: file.status,
      createdAt: file.created_at,
      updatedAt: file.updated_at,
      fileSize: file.file_size,
    });
  } catch (error) {
    console.error("Error getting file status:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Large file upload constants
const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100MB
const PART_SIZE = 50 * 1024 * 1024; // 50MB parts

/**
 * POST /upload/start-large
 * Start a large file upload session with multipart upload
 */
export async function handleStartLargeUpload(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth as AuthPayload;
    const { filename, fileSize, contentType } = await c.req.json();

    if (!filename || !fileSize || !contentType) {
      return c.json(
        { error: "filename, fileSize, and contentType are required" },
        400
      );
    }

    if (!userAuth?.username) {
      return c.json({ error: "User authentication required" }, 401);
    }

    // Validate file size
    if (fileSize < LARGE_FILE_THRESHOLD) {
      return c.json(
        {
          error: `File size must be at least ${LARGE_FILE_THRESHOLD / (1024 * 1024)}MB for large file uploads`,
        },
        400
      );
    }

    const tenant = userAuth.username;
    const sessionId = nanoid();
    const fileKey = `staging/${tenant}/${filename}`;

    // Create multipart upload in R2
    const multipartUpload = await c.env.R2.createMultipartUpload(fileKey, {
      httpMetadata: {
        contentType: contentType,
      },
    });

    // Calculate total parts
    const totalParts = Math.ceil(fileSize / PART_SIZE);

    // Create upload session in Durable Object
    const uploadSessionId = c.env.UPLOAD_SESSION.idFromName(sessionId);
    const uploadSession = c.env.UPLOAD_SESSION.get(uploadSessionId);

    const sessionData = {
      userId: tenant,
      fileKey: fileKey,
      uploadId: multipartUpload.uploadId,
      filename: filename,
      fileSize: fileSize,
      totalParts: totalParts,
      autoRAGChunking: true,
    };

    const sessionResponse = await uploadSession.fetch(
      API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.UPLOAD.SESSION_CREATE),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sessionData),
      }
    );

    if (!sessionResponse.ok) {
      // Clean up the multipart upload if session creation fails
      await multipartUpload.abort();
      return c.json({ error: "Failed to create upload session" }, 500);
    }

    // For large files, we'll use server-side part uploads instead of presigned URLs
    // This provides better security and control

    console.log(
      `[LargeUpload] Started session: ${sessionId} for file: ${filename} (${fileSize} bytes, ${totalParts} parts)`
    );

    return c.json({
      success: true,
      sessionId: sessionId,
      uploadId: multipartUpload.uploadId,
      fileKey: fileKey,
      totalParts: totalParts,
      partSize: PART_SIZE,
      uploadMethod: "server-side", // Indicates parts should be uploaded via server endpoints
    });
  } catch (error) {
    console.error("[LargeUpload] Error starting upload:", error);
    return c.json({ error: "Failed to start large file upload" }, 500);
  }
}

/**
 * POST /upload/part/:sessionId/:partNumber
 * Upload a file part (alternative to presigned URLs for server-side processing)
 */
export async function handleUploadPart(c: ContextWithAuth) {
  try {
    const sessionId = c.req.param("sessionId");
    const partNumber = parseInt(c.req.param("partNumber"), 10);
    const userAuth = (c as any).userAuth as AuthPayload;

    if (!sessionId || !partNumber || partNumber < 1) {
      return c.json(
        { error: "Valid sessionId and partNumber are required" },
        400
      );
    }

    if (!userAuth?.username) {
      return c.json({ error: "User authentication required" }, 401);
    }

    // Get upload session
    const uploadSessionId = c.env.UPLOAD_SESSION.idFromName(sessionId);
    const uploadSession = c.env.UPLOAD_SESSION.get(uploadSessionId);

    const sessionResponse = await uploadSession.fetch(
      API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.UPLOAD.SESSION_GET),
      {
        method: "GET",
      }
    );

    if (!sessionResponse.ok) {
      return c.json({ error: "Upload session not found" }, 404);
    }

    const session = (await sessionResponse.json()) as UploadSessionData;

    // Verify user owns this session
    if (session.userId !== userAuth.username) {
      return c.json({ error: "Access denied to this upload session" }, 403);
    }

    // Get the part data
    const partData = await c.req.arrayBuffer();

    // Upload part to R2
    const multipartUpload = c.env.R2.resumeMultipartUpload(
      session.fileKey,
      session.uploadId
    );
    const uploadedPart = await multipartUpload.uploadPart(partNumber, partData);

    // Update session with uploaded part
    const updateResponse = await uploadSession.fetch(
      API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.UPLOAD.SESSION_ADD_PART),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partNumber: partNumber,
          etag: uploadedPart.etag,
          size: partData.byteLength,
        }),
      }
    );

    if (!updateResponse.ok) {
      return c.json({ error: "Failed to update upload session" }, 500);
    }

    console.log(
      `[LargeUpload] Uploaded part ${partNumber} for session ${sessionId} (${partData.byteLength} bytes)`
    );

    return c.json({
      success: true,
      partNumber: partNumber,
      etag: uploadedPart.etag,
      size: partData.byteLength,
    });
  } catch (error) {
    console.error("[LargeUpload] Error uploading part:", error);
    return c.json({ error: "Failed to upload part" }, 500);
  }
}

/**
 * POST /upload/complete-large/:sessionId
 * Complete the multipart upload
 */
export async function handleCompleteLargeUpload(c: ContextWithAuth) {
  try {
    const sessionId = c.req.param("sessionId");
    const userAuth = (c as any).userAuth as AuthPayload;

    if (!sessionId) {
      return c.json({ error: "sessionId is required" }, 400);
    }

    if (!userAuth?.username) {
      return c.json({ error: "User authentication required" }, 401);
    }

    // Get upload session
    const uploadSessionId = c.env.UPLOAD_SESSION.idFromName(sessionId);
    const uploadSession = c.env.UPLOAD_SESSION.get(uploadSessionId);

    const sessionResponse = await uploadSession.fetch(
      API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.UPLOAD.SESSION_GET),
      {
        method: "GET",
      }
    );

    if (!sessionResponse.ok) {
      return c.json({ error: "Upload session not found" }, 404);
    }

    const session = (await sessionResponse.json()) as UploadSessionData;

    // Verify user owns this session
    if (session.userId !== userAuth.username) {
      return c.json({ error: "Access denied to this upload session" }, 403);
    }

    // Check if all parts are uploaded
    if (session.uploadedParts < session.totalParts) {
      return c.json(
        {
          error: `Upload incomplete. ${session.uploadedParts}/${session.totalParts} parts uploaded`,
        },
        400
      );
    }

    // Get uploaded parts from session
    const partsResponse = await uploadSession.fetch(
      API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.UPLOAD.SESSION_GET_PARTS),
      {
        method: "GET",
      }
    );

    if (!partsResponse.ok) {
      return c.json({ error: "Failed to get uploaded parts" }, 500);
    }

    const { parts } = (await partsResponse.json()) as { parts: any[] };

    // Complete multipart upload
    const multipartUpload = c.env.R2.resumeMultipartUpload(
      session.fileKey,
      session.uploadId
    );
    await multipartUpload.complete(parts);

    // Insert file metadata into database
    const fileDAO = getDAOFactory(c.env).fileDAO;
    const autoragKey = buildAutoRAGFileKey(session.userId, session.filename);

    try {
      await fileDAO.insertFileForProcessing(
        autoragKey,
        session.filename,
        "", // description
        "[]", // tags (empty array as JSON string)
        session.userId,
        session.fileSize
      );
      console.log(`[LargeUpload] Inserted file metadata: ${autoragKey}`);
    } catch (error) {
      console.error(`[LargeUpload] Failed to insert file metadata: ${error}`);
      // Don't fail the upload if metadata insertion fails
    }

    // Extract JWT token from Authorization header
    const authHeader = c.req.header("Authorization");
    const jwt = authHeader?.replace(/^Bearer\s+/i, "");

    // Start AutoRAG processing in background
    startAutoRAGProcessing(
      c.env,
      autoragKey,
      session.userId,
      session.filename,
      session.fileKey,
      "[LargeUpload]",
      jwt
    );

    // Mark session as completed
    await uploadSession.fetch(
      API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.UPLOAD.SESSION_COMPLETE),
      {
        method: "POST",
      }
    );

    console.log(
      `[LargeUpload] Completed upload: ${sessionId} -> ${session.fileKey}`
    );

    return c.json({
      success: true,
      fileKey: session.fileKey,
      size: session.fileSize,
      uploadedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[LargeUpload] Error completing upload:", error);
    try {
      const sessionId = c.req.param("sessionId");
      if (sessionId) {
        // Best-effort fetch to get filename and user
        const uploadSessionId = c.env.UPLOAD_SESSION.idFromName(sessionId);
        const uploadSession = c.env.UPLOAD_SESSION.get(uploadSessionId);
        const sessionResponse = await uploadSession.fetch(
          API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.UPLOAD.SESSION_GET),
          { method: "GET" }
        );
        if (sessionResponse.ok) {
          const s = (await sessionResponse.json()) as UploadSessionData;
          await notifyFileUploadFailed(
            c.env,
            s.userId,
            s.filename,
            (error as Error)?.message
          );
        }
      }
    } catch (_e) {}
    return c.json({ error: "Failed to complete upload" }, 500);
  }
}

/**
 * GET /upload/progress/:sessionId
 * Get upload progress for a session
 */
export async function handleGetUploadProgress(c: ContextWithAuth) {
  try {
    const sessionId = c.req.param("sessionId");
    const userAuth = (c as any).userAuth as AuthPayload;

    if (!sessionId) {
      return c.json({ error: "sessionId is required" }, 400);
    }

    if (!userAuth?.username) {
      return c.json({ error: "User authentication required" }, 401);
    }

    // Get upload session
    const uploadSessionId = c.env.UPLOAD_SESSION.idFromName(sessionId);
    const uploadSession = c.env.UPLOAD_SESSION.get(uploadSessionId);

    const sessionResponse = await uploadSession.fetch(
      API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.UPLOAD.SESSION_GET),
      {
        method: "GET",
      }
    );

    if (!sessionResponse.ok) {
      return c.json({ error: "Upload session not found" }, 404);
    }

    const session = (await sessionResponse.json()) as UploadSessionData;

    // Verify user owns this session
    if (session.userId !== userAuth.username) {
      return c.json({ error: "Access denied to this upload session" }, 403);
    }

    const progress = {
      sessionId: session.id,
      filename: session.filename,
      fileSize: session.fileSize,
      totalParts: session.totalParts,
      uploadedParts: session.uploadedParts,
      status: session.status,
      progress:
        session.totalParts > 0
          ? (session.uploadedParts / session.totalParts) * 100
          : 0,
      uploadedBytes: session.uploadedParts * PART_SIZE,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };

    return c.json({
      success: true,
      progress: progress,
    });
  } catch (error) {
    console.error("[LargeUpload] Error getting progress:", error);
    return c.json({ error: "Failed to get upload progress" }, 500);
  }
}

/**
 * DELETE /upload/abort-large/:sessionId
 * Abort the multipart upload and clean up
 */
export async function handleAbortLargeUpload(c: ContextWithAuth) {
  try {
    const sessionId = c.req.param("sessionId");
    const userAuth = (c as any).userAuth as AuthPayload;

    if (!sessionId) {
      return c.json({ error: "sessionId is required" }, 400);
    }

    if (!userAuth?.username) {
      return c.json({ error: "User authentication required" }, 401);
    }

    // Get upload session
    const uploadSessionId = c.env.UPLOAD_SESSION.idFromName(sessionId);
    const uploadSession = c.env.UPLOAD_SESSION.get(uploadSessionId);

    const sessionResponse = await uploadSession.fetch(
      API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.UPLOAD.SESSION_GET),
      {
        method: "GET",
      }
    );

    if (!sessionResponse.ok) {
      return c.json({ error: "Upload session not found" }, 404);
    }

    const session = (await sessionResponse.json()) as UploadSessionData;

    // Verify user owns this session
    if (session.userId !== userAuth.username) {
      return c.json({ error: "Access denied to this upload session" }, 403);
    }

    // Abort multipart upload in R2
    const multipartUpload = c.env.R2.resumeMultipartUpload(
      session.fileKey,
      session.uploadId
    );
    await multipartUpload.abort();

    // Delete session
    await uploadSession.fetch(
      API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.UPLOAD.SESSION_DELETE),
      {
        method: "DELETE",
      }
    );

    console.log(`[LargeUpload] Aborted upload: ${sessionId}`);

    return c.json({
      success: true,
      message: "Upload aborted successfully",
    });
  } catch (error) {
    console.error("[LargeUpload] Error aborting upload:", error);
    return c.json({ error: "Failed to abort upload" }, 500);
  }
}
