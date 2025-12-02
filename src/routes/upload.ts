import type { Context } from "hono";
import { getDAOFactory } from "@/dao/dao-factory";
import { notifyFileUploadFailed } from "@/lib/notifications";
import { logger } from "@/lib/logger";
import type { Env } from "@/middleware/auth";
import type { AuthPayload } from "@/services/core/auth-service";
import { API_CONFIG } from "@/shared-config";
import { buildLibraryFileKey } from "@/lib/file-keys";
import { nanoid } from "@/lib/nanoid";
import { startFileProcessing } from "@/routes/upload-processing";
import { extractJwtFromContext } from "@/lib/auth-utils";

const log = logger.scope("[Upload]");

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
    log.debug("Checking upload status", { userAuth: userAuth?.username });

    if (!tenant || !filename) {
      return c.json({ error: "tenant and filename are required" }, 400);
    }

    // Check if R2 is available by trying to list objects
    try {
      await c.env.R2.list({ limit: 1 });
    } catch (error) {
      log.error("R2 not available", error);
      return c.json({ error: "Storage not available" }, 503);
    }

    const key = await buildLibraryFileKey(tenant || "", filename || "");
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
    log.error("Error checking upload status", error);
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
    const key = await buildLibraryFileKey(tenant || "", filename || "");

    // Upload directly to R2
    await c.env.R2.put(key, fileBuffer, {
      httpMetadata: {
        contentType: c.req.header("Content-Type") || "application/octet-stream",
      },
      customMetadata: {
        file_key: key,
        user: tenant,
        original_name: filename,
      },
    });

    const directUploadLog = logger.scope("[DirectUpload]");
    directUploadLog.debug("File uploaded", {
      key,
      size: fileBuffer.byteLength,
    });

    // Insert file metadata into database
    const fileDAO = getDAOFactory(c.env).fileDAO;

    try {
      await fileDAO.insertFileForProcessing(
        key,
        filename,
        "",
        "[]",
        tenant,
        fileBuffer.byteLength
      );
      directUploadLog.debug("Inserted file metadata", { key });
    } catch (error) {
      directUploadLog.error("Failed to insert file metadata", error);
      // Don't fail the upload if metadata insertion fails
    }

    // Extract JWT token from Authorization header
    const jwt = extractJwtFromContext(c);
    directUploadLog.debug("Starting file processing", {
      fileKey: key,
      userId: userAuth.username,
      filename,
      jwtPresent: !!jwt,
    });

    // Start file processing (awaited to ensure completion)
    await startFileProcessing(
      c.env,
      key,
      userAuth.username,
      filename,
      "[DirectUpload]",
      jwt
    );

    directUploadLog.debug("File processing scheduled", { filename });

    return c.json({
      success: true,
      key,
      size: fileBuffer.byteLength,
      uploadedAt: new Date().toISOString(),
    });
  } catch (error) {
    log.error("Direct upload error", error);
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
    log.error("Error fetching files", error);
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
    const { display_name, description, tags } = await c.req.json();

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
      const metadataUpdates: {
        display_name?: string;
        description?: string;
        tags?: string;
      } = {};
      if (display_name !== undefined)
        metadataUpdates.display_name = display_name;
      if (description !== undefined) metadataUpdates.description = description;
      if (tags !== undefined) metadataUpdates.tags = JSON.stringify(tags);

      await fileDAO.updateFileMetadata(fileKey, metadataUpdates);
    } catch (error) {
      log.warn("Failed to update file_metadata table", { error });
    }

    try {
      await fileDAO.updateFileMetadataForRag(
        fileKey,
        userAuth.username,
        description || "",
        tags ? JSON.stringify(tags) : "[]",
        display_name
      );
    } catch (error) {
      log.warn("Failed to update files table", { error });
    }

    return c.json({ success: true });
  } catch (error) {
    log.error("Error updating file metadata", error);
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
    log.error("Error getting file status", error);
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
    const fileKey = await buildLibraryFileKey(tenant, filename);

    // Create multipart upload in R2
    const multipartUpload = await c.env.R2.createMultipartUpload(fileKey, {
      httpMetadata: {
        contentType: contentType,
      },
      // Ensure the final object carries precise identity metadata
      customMetadata: {
        file_key: fileKey,
        user: tenant,
        original_name: filename,
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

    log.debug("Started large upload session", {
      sessionId,
      filename,
      fileSize,
      totalParts,
    });

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
    log.error("Error starting large upload", error);
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

    log.debug("Uploaded part", {
      partNumber,
      sessionId,
      size: partData.byteLength,
    });

    return c.json({
      success: true,
      partNumber: partNumber,
      etag: uploadedPart.etag,
      size: partData.byteLength,
    });
  } catch (error) {
    log.error("Error uploading part", error);
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

    try {
      await fileDAO.insertFileForProcessing(
        session.fileKey, // Use staging key
        session.filename,
        "", // description
        "[]", // tags (empty array as JSON string)
        session.userId,
        session.fileSize
      );
      log.debug("Inserted file metadata", { fileKey: session.fileKey });
    } catch (error) {
      log.error("Failed to insert file metadata", error);
      // Don't fail the upload if metadata insertion fails
    }

    // Extract JWT token from Authorization header
    const jwt = extractJwtFromContext(c);

    // Start file processing (awaited to ensure completion)
    await startFileProcessing(
      c.env,
      session.fileKey,
      session.userId,
      session.filename,
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

    log.debug("Completed upload", {
      sessionId,
      fileKey: session.fileKey,
    });

    return c.json({
      success: true,
      fileKey: session.fileKey,
      size: session.fileSize,
      uploadedAt: new Date().toISOString(),
    });
  } catch (error) {
    log.error("Error completing upload", error);
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
    log.error("Error getting upload progress", error);
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

    log.debug("Aborted upload", { sessionId });

    return c.json({
      success: true,
      message: "Upload aborted successfully",
    });
  } catch (error) {
    log.error("Error aborting upload", error);
    return c.json({ error: "Failed to abort upload" }, 500);
  }
}
