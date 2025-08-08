import type { Context } from "hono";
import { PDF_PROCESSING_CONFIG } from "../constants";
import { AutoRAGService } from "../services/autorag-service";
import type { Env } from "../middleware/auth";
import type { AuthPayload } from "../services/auth-service";
import { PDF_SCHEMA } from "../types/pdf";

// Extend the context to include userAuth
type ContextWithAuth = Context<{
  Bindings: Env;
  Variables: { userAuth: AuthPayload };
}>;

// Generate upload URL for PDF
export async function handleGenerateUploadUrl(c: ContextWithAuth) {
  try {
    const userAuth = c.get("userAuth") as AuthPayload;
    const { filename, contentType, fileSize } = await c.req.json();

    if (!filename) {
      return c.json({ error: "Filename is required" }, 400);
    }

    if (!userAuth || !userAuth.username) {
      return c.json({ error: "User authentication required" }, 401);
    }

    // Generate a consistent file key based on filename to avoid duplicates
    const fileKey = `${userAuth.username}/${filename}`;

    // Create a multipart upload session
    const multipartUpload = await c.env.FILE_BUCKET.createMultipartUpload(
      fileKey,
      {
        httpMetadata: {
          contentType: contentType || "application/pdf",
        },
      }
    );

    // Calculate number of parts needed
    const chunkSize = PDF_PROCESSING_CONFIG.UPLOAD_CHUNK_SIZE;
    const totalParts = Math.ceil(fileSize / chunkSize);

    console.log(
      "[handleGenerateUploadUrl] Generated multipart upload session:",
      {
        fileKey,
        uploadId: multipartUpload.uploadId,
        chunkSize,
        totalParts,
        fileSize,
        sessionCreatedAt: new Date().toISOString(),
        sessionKey: multipartUpload.key,
        sessionUploadId: multipartUpload.uploadId,
      }
    );

    return c.json({
      uploadId: multipartUpload.uploadId,
      fileKey,
      chunkSize,
      totalParts,
    });
  } catch (error) {
    console.error("Error generating upload URL:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Complete PDF upload
export async function handleCompleteUpload(c: ContextWithAuth) {
  try {
    const fileKey = c.req.param("*");
    const { uploadId, parts } = await c.req.json();
    const userAuth = c.get("userAuth") as AuthPayload;

    console.log("[handleCompleteUpload] Request received:", {
      fileKey,
      uploadId,
      partsCount: parts?.length,
      hasParts: !!parts,
      requestHeaders: {
        contentType: c.req.header("content-type"),
        authorization: c.req.header("authorization")
          ? "Bearer [REDACTED]"
          : "none",
      },
    });

    if (!uploadId || !parts) {
      console.error("[handleCompleteUpload] Missing required fields:", {
        uploadId: !!uploadId,
        parts: !!parts,
      });
      return c.json({ error: "Upload ID and parts are required" }, 400);
    }

    if (!userAuth || !userAuth.username) {
      return c.json({ error: "User authentication required" }, 401);
    }

    // Complete the multipart upload
    console.log("[handleCompleteUpload] Attempting to complete upload:", {
      fileKey,
      uploadId,
      partsCount: parts.length,
      parts: parts.map((p: any) => ({
        partNumber: p.partNumber,
        etag: p.etag,
      })),
    });

    try {
      const multipartUpload = c.env.FILE_BUCKET.resumeMultipartUpload(
        fileKey,
        uploadId
      );

      console.log("[handleCompleteUpload] Resumed multipart upload session:", {
        fileKey,
        uploadId,
        sessionResumedAt: new Date().toISOString(),
        partsCount: parts.length,
        sessionKey: multipartUpload.key,
        sessionUploadId: multipartUpload.uploadId,
      });

      await multipartUpload.complete(parts);
      console.log("Upload completed for fileKey:", fileKey);

      return c.json({ success: true, fileKey });
    } catch (completeError) {
      console.error("Error completing upload:", completeError);

      // Check if it's a multipart upload not found error
      if (
        completeError instanceof Error &&
        completeError.message &&
        completeError.message.includes("does not exist")
      ) {
        console.error("Multipart upload session expired or invalid");

        // Check if the file already exists (parts were uploaded but session expired)
        try {
          const existingFile = await c.env.FILE_BUCKET.head(fileKey);
          if (existingFile) {
            console.log(
              "File already exists, upload was successful despite session expiry"
            );
            return c.json({ success: true, fileKey });
          }
        } catch (_headError) {
          console.log("File does not exist, upload failed");
        }

        return c.json(
          {
            error: "Upload session expired. Please try uploading again.",
            code: "UPLOAD_EXPIRED",
          },
          400
        );
      }

      return c.json({ error: "Internal server error" }, 500);
    }
  } catch (error) {
    console.error("Error completing upload:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Upload a part of a multipart upload
export async function handleUploadPart(c: ContextWithAuth) {
  let fileKey: string | undefined;
  let uploadId: string | undefined;
  let partNumber: number | undefined;
  let fileBuffer: Uint8Array;
  let file: any;

  try {
    // Check if the request is FormData or JSON
    const contentType = c.req.header("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      // Handle FormData with optimized processing
      const formData = await c.req.formData();
      fileKey = formData.get("fileKey") as string;
      uploadId = formData.get("uploadId") as string;
      partNumber = parseInt(formData.get("partNumber") as string);
      file = formData.get("file") as File;

      console.log("[handleUploadPart] Received FormData:", {
        fileKey,
        uploadId,
        partNumber,
        hasFile: !!file,
        fileName: file?.name,
        fileSize: file?.size,
      });

      if (!fileKey || !uploadId || !partNumber || !file) {
        return c.json(
          { error: "File key, upload ID, part number, and file are required" },
          400
        );
      }

      // Optimize buffer conversion for better performance
      const arrayBuffer = await file.arrayBuffer();
      fileBuffer = new Uint8Array(arrayBuffer);
    } else {
      // Handle JSON (legacy support) - simplified for better performance
      const requestData = await c.req.json();
      fileKey = requestData.fileKey;
      uploadId = requestData.uploadId;
      partNumber = requestData.partNumber;
      file = requestData.file;

      console.log("[handleUploadPart] Received JSON data:", {
        fileKey,
        uploadId,
        partNumber,
        hasFile: !!file,
        fileType: typeof file,
        fileLength: file ? file.length : 0,
        fileIsArray: Array.isArray(file),
      });

      if (!fileKey || !uploadId || !partNumber || !file) {
        return c.json(
          { error: "File key, upload ID, part number, and file are required" },
          400
        );
      }

      // Optimized buffer conversion
      if (Array.isArray(file)) {
        fileBuffer = new Uint8Array(file);
      } else if (file && typeof file === "object" && file.data) {
        fileBuffer = new Uint8Array(file.data);
      } else if (file && typeof file === "object" && file.byteLength) {
        fileBuffer = new Uint8Array(file);
      } else {
        fileBuffer = new Uint8Array(file);
      }
    }

    // Validate buffer before processing
    if (!fileBuffer || fileBuffer.length === 0) {
      return c.json({ error: "Invalid file data received" }, 400);
    }

    console.log("[handleUploadPart] File buffer details:", {
      bufferLength: fileBuffer.length,
      bufferIsEmpty: fileBuffer.length === 0,
      firstFewBytes: fileBuffer.slice(0, 10),
      originalFileType: typeof file,
      originalFileKeys: file ? Object.keys(file) : [],
    });

    // Resume the multipart upload and upload the part with optimized error handling
    const multipartUpload = c.env.FILE_BUCKET.resumeMultipartUpload(
      fileKey,
      uploadId
    );

    console.log("[handleUploadPart] Resumed multipart upload for part:", {
      fileKey,
      uploadId,
      partNumber,
      resumedAt: new Date().toISOString(),
      sessionKey: multipartUpload.key,
      sessionUploadId: multipartUpload.uploadId,
    });

    // Add timeout for large chunks
    const uploadPromise = multipartUpload.uploadPart(partNumber, fileBuffer);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error("Upload timeout")),
        PDF_PROCESSING_CONFIG.UPLOAD_TIMEOUT_MS
      );
    });

    const uploadedPart = (await Promise.race([
      uploadPromise,
      timeoutPromise,
    ])) as any;

    console.log(`Uploaded part ${partNumber} for fileKey:`, fileKey);

    return c.json({
      success: true,
      fileKey,
      partNumber,
      etag: uploadedPart.etag,
    });
  } catch (error) {
    console.error("Error uploading part:", error);

    // Enhanced error handling with specific error types
    if (error instanceof Error) {
      if (error.message.includes("does not exist")) {
        console.error(
          "Multipart upload session not found for fileKey:",
          fileKey,
          "uploadId:",
          uploadId
        );
        return c.json(
          {
            error: "Upload session not found. Please try uploading again.",
            code: "UPLOAD_NOT_FOUND",
            details: {
              fileKey,
              uploadId,
              partNumber,
            },
          },
          400
        );
      }

      if (error.message.includes("Upload timeout")) {
        console.error("Upload timeout for part:", partNumber);
        return c.json(
          {
            error: "Upload timeout. Please try again.",
            code: "UPLOAD_TIMEOUT",
            details: {
              fileKey,
              uploadId,
              partNumber,
            },
          },
          408
        );
      }
    }

    return c.json({ error: "Internal server error" }, 500);
  }
}

// Shared function for PDF processing
async function processPdfFile(
  c: ContextWithAuth,
  fileKey: string,
  options: {
    isRetry?: boolean;
    filename?: string;
    description?: string;
    tags?: string[];
    fileSize?: number;
  } = {}
): Promise<{
  success: boolean;
  fileId?: string;
  message: string;
  error?: string;
}> {
  const userAuth = c.get("userAuth") as AuthPayload;
  const { isRetry = false, filename, description, tags, fileSize } = options;

  try {
    // Verify the fileKey belongs to the authenticated user
    if (
      !fileKey.startsWith(`${userAuth.username}/`) &&
      !fileKey.startsWith(`uploads/${userAuth.username}/`)
    ) {
      return {
        success: false,
        error: "Access denied to this file",
        message: "Access denied to this file",
      };
    }

    // For retry operations, validate the file exists and is in error status
    if (isRetry) {
      const file = await c.env.DB.prepare(
        "SELECT * FROM pdf_files WHERE file_key = ? AND username = ?"
      )
        .bind(fileKey, userAuth.username)
        .first();

      if (!file) {
        return {
          success: false,
          error: "File not found",
          message: "File not found in database",
        };
      }

      if (file.status !== "error") {
        return {
          success: false,
          error: "File is not in error status",
          message: `Current status: ${file.status}`,
        };
      }
    }

    // Get file size from R2 if not provided
    let actualFileSize = fileSize;
    if (!actualFileSize) {
      try {
        console.log(
          `[PDF Processing] Attempting to get file from R2: ${fileKey}`
        );
        const file = await c.env.FILE_BUCKET.get(fileKey);
        if (file) {
          actualFileSize = file.size;
          console.log(
            `[PDF Processing] File found in R2, size: ${actualFileSize} bytes`
          );
        } else {
          console.log(`[PDF Processing] File not found in R2: ${fileKey}`);
        }
      } catch (error) {
        console.warn("Could not get file size from R2:", error);
      }
    }

    // For new ingestions, create/update database record
    let fileId: string | undefined;
    if (!isRetry) {
      const existingFile = await c.env.DB.prepare(
        "SELECT id FROM pdf_files WHERE file_key = ? AND username = ?"
      )
        .bind(fileKey, userAuth.username)
        .first();

      const now = new Date().toISOString();

      if (existingFile) {
        // Update existing file
        await c.env.DB.prepare(
          "UPDATE pdf_files SET file_name = ?, description = ?, tags = ?, status = ?, updated_at = ?, file_size = ? WHERE file_key = ? AND username = ?"
        )
          .bind(
            filename || fileKey.split("/").pop() || "unknown.pdf",
            description || "",
            tags ? JSON.stringify(tags) : "[]",
            "processing",
            now,
            actualFileSize || 0,
            fileKey,
            userAuth.username
          )
          .run();
        fileId = existingFile.id as string;
      } else {
        // Insert new file
        fileId = crypto.randomUUID();
        await c.env.DB.prepare(
          "INSERT INTO pdf_files (id, file_key, file_name, description, tags, username, status, created_at, file_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
          .bind(
            fileId,
            fileKey,
            filename || fileKey.split("/").pop() || "unknown.pdf",
            description || "",
            tags ? JSON.stringify(tags) : "[]",
            userAuth.username,
            "processing",
            now,
            actualFileSize || 0
          )
          .run();
      }
    } else {
      // For retries, update status to processing
      await c.env.DB.prepare(
        "UPDATE pdf_files SET status = ?, updated_at = ? WHERE file_key = ? AND username = ?"
      )
        .bind(
          "processing",
          new Date().toISOString(),
          fileKey,
          userAuth.username
        )
        .run();
    }

    // Check if we have an OpenAI API key for processing
    if (!userAuth.openaiApiKey) {
      console.warn("No OpenAI API key available for PDF processing");
      await c.env.DB.prepare(
        "UPDATE pdf_files SET status = ?, updated_at = ? WHERE file_key = ?"
      )
        .bind("error", new Date().toISOString(), fileKey)
        .run();

      return {
        success: false,
        error: "OpenAI API key required for processing",
        message: "PDF processing requires an OpenAI API key for text analysis.",
      };
    }

    // Check for AutoRAG parts instead of the original file
    console.log(`[PDF Processing] Checking for AutoRAG parts: ${fileKey}`);
    const parts = fileKey.split("/");
    const username = parts[0];
    const originalFilename = parts[parts.length - 1] || "unknown";
    const prefix = `${username}/part-`;
    const objects = await c.env.FILE_BUCKET.list({ prefix });
    const partCount =
      objects.objects?.filter(
        (obj) =>
          obj.key.includes(`part-`) &&
          obj.key.includes(originalFilename) &&
          (obj.key.endsWith(".txt") || obj.key.endsWith(".chunk"))
      ).length || 0;

    if (partCount === 0) {
      console.error(`[PDF Processing] No AutoRAG parts found for: ${fileKey}`);
      return {
        success: false,
        error: "No AutoRAG parts found in storage",
        message: "The uploaded file parts could not be found in R2 storage",
      };
    }
    console.log(
      `[PDF Processing] Found ${partCount} AutoRAG parts for: ${fileKey}`
    );

    // Send to PDF processing queue
    console.log(`[PDF Processing] Sending to queue for processing: ${fileKey}`);
    await c.env.PDF_PROCESSING_QUEUE.send({
      fileKey: fileKey,
      username: userAuth.username,
      openaiApiKey: userAuth.openaiApiKey,
      metadata: {
        description: description || "",
        tags: tags || [],
        filename: filename || fileKey.split("/").pop() || "unknown.pdf",
        file_size: actualFileSize || 0,
        status: "processing" as const,
        created_at: new Date().toISOString(),
      },
    });

    console.log(
      `[PDF Processing] Successfully queued ${fileKey} for processing`
    );

    return {
      success: true,
      fileId,
      message: isRetry
        ? "PDF processing retry initiated successfully."
        : "File uploaded successfully. Processing will continue in the background.",
    };
  } catch (error) {
    console.error(`[PDF Processing] Error processing ${fileKey}:`, error);
    return {
      success: false,
      error: `Failed to process PDF: ${error}`,
      message: "An error occurred during PDF processing",
    };
  }
}

// Process PDF file (ingest new or retry failed)
export async function handleProcessPdf(c: ContextWithAuth) {
  try {
    const userAuth = c.get("userAuth") as AuthPayload;
    const {
      fileKey,
      operation = "ingest",
      filename,
      description,
      tags,
      fileSize,
    } = await c.req.json();

    if (!fileKey) {
      return c.json({ error: "File key is required" }, 400);
    }

    if (!userAuth || !userAuth.username) {
      return c.json({ error: "User authentication required" }, 401);
    }

    // Validate operation
    if (operation !== "ingest" && operation !== "retry") {
      return c.json({ error: "Operation must be 'ingest' or 'retry'" }, 400);
    }

    // For ingest operations, filename is required
    if (operation === "ingest" && !filename) {
      return c.json(
        { error: "Filename is required for ingest operations" },
        400
      );
    }

    const result = await processPdfFile(c, fileKey, {
      isRetry: operation === "retry",
      filename,
      description,
      tags,
      fileSize,
    });

    if (!result.success) {
      return c.json(
        {
          success: false,
          error: result.error,
          details: result.message,
        },
        result.error?.includes("not found") ? 404 : 500
      );
    }

    return c.json({
      success: true,
      fileKey,
      fileId: result.fileId,
      message: result.message,
    });
  } catch (error) {
    console.error("Error processing PDF:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Get PDF files for user
export async function handleGetPdfFiles(c: ContextWithAuth) {
  try {
    const userAuth = c.get("userAuth") as AuthPayload;

    if (!userAuth || !userAuth.username) {
      return c.json({ error: "User authentication required" }, 401);
    }

    const files = await c.env.DB.prepare(
      `SELECT ${PDF_SCHEMA.COLUMNS.ID}, ${PDF_SCHEMA.COLUMNS.FILE_KEY}, ${PDF_SCHEMA.COLUMNS.FILE_NAME}, ${PDF_SCHEMA.COLUMNS.DESCRIPTION}, ${PDF_SCHEMA.COLUMNS.TAGS}, ${PDF_SCHEMA.COLUMNS.STATUS}, ${PDF_SCHEMA.COLUMNS.CREATED_AT}, ${PDF_SCHEMA.COLUMNS.UPDATED_AT}, ${PDF_SCHEMA.COLUMNS.FILE_SIZE} FROM ${PDF_SCHEMA.TABLE_NAME} WHERE ${PDF_SCHEMA.COLUMNS.USERNAME} = ? ORDER BY ${PDF_SCHEMA.COLUMNS.CREATED_AT} DESC`
    )
      .bind(userAuth.username)
      .all();

    return c.json({ files: files.results || [] });
  } catch (error) {
    console.error("Error fetching PDF files:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Update PDF metadata
export async function handleUpdatePdfMetadata(c: ContextWithAuth) {
  try {
    const userAuth = c.get("userAuth") as AuthPayload;
    const { fileKey, description, tags } = await c.req.json();

    if (!fileKey) {
      return c.json({ error: "File key is required" }, 400);
    }

    if (!userAuth || !userAuth.username) {
      return c.json({ error: "User authentication required" }, 401);
    }

    // Verify the fileKey belongs to the authenticated user
    // File keys can be either "username/filename" or "uploads/username/filename"
    if (
      !fileKey.startsWith(`${userAuth.username}/`) &&
      !fileKey.startsWith(`uploads/${userAuth.username}/`)
    ) {
      return c.json({ error: "Access denied to this file" }, 403);
    }

    await c.env.DB.prepare(
      "UPDATE pdf_files SET description = ?, tags = ?, updated_at = ? WHERE file_key = ? AND username = ?"
    )
      .bind(
        description || "",
        tags ? JSON.stringify(tags) : "[]",
        new Date().toISOString(),
        fileKey,
        userAuth.username
      )
      .run();

    return c.json({ success: true });
  } catch (error) {
    console.error("Error updating PDF metadata:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Auto-generate metadata for an existing PDF file
export async function handleAutoGeneratePdfMetadata(c: ContextWithAuth) {
  try {
    const userAuth = c.get("userAuth") as AuthPayload;
    const { fileKey } = await c.req.json();

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

    // Get the file from the database
    const file = await c.env.DB.prepare(
      "SELECT * FROM pdf_files WHERE file_key = ? AND username = ?"
    )
      .bind(fileKey, userAuth.username)
      .first();

    if (!file) {
      return c.json({ error: "File not found" }, 404);
    }

    // Get the file from R2
    const object = await c.env.FILE_BUCKET.get(fileKey);
    if (!object) {
      return c.json({ error: "File not found in storage" }, 404);
    }

    // Process the PDF to extract text and generate metadata
    const ragService = new AutoRAGService(
      c.env.DB,
      c.env.AUTORAG,
      userAuth.openaiApiKey
    );

    // Create a temporary metadata object for processing
    const tempMetadata = {
      description: "",
      tags: [],
      filename: file.file_name as string,
      file_size: (file.file_size as number) || 0,
      status:
        (file.status as "uploaded" | "processing" | "processed" | "error") ||
        "uploaded",
      created_at: file.created_at as string,
    };

    // Process the PDF to generate metadata
    const processedResult = await ragService.processPdfFromR2(
      fileKey,
      userAuth.username,
      c.env.FILE_BUCKET,
      tempMetadata
    );

    // Extract the suggested metadata
    const suggestedMetadata = processedResult.suggestedMetadata;
    if (!suggestedMetadata) {
      return c.json({ error: "Failed to generate metadata" }, 500);
    }

    // Update the database with the auto-generated metadata
    await c.env.DB.prepare(
      "UPDATE pdf_files SET description = ?, tags = ? WHERE file_key = ? AND username = ?"
    )
      .bind(
        suggestedMetadata.description || "",
        JSON.stringify(suggestedMetadata.tags || []),
        fileKey,
        userAuth.username
      )
      .run();

    return c.json({
      message: "Metadata auto-generated successfully",
      data: {
        fileKey,
        description: suggestedMetadata.description,
        tags: suggestedMetadata.tags,
      },
    });
  } catch (error) {
    console.error("[handleAutoGeneratePdfMetadata] Error:", error);
    return c.json({ error: `Failed to auto-generate metadata: ${error}` }, 500);
  }
}

// Get PDF processing stats
export async function handleGetPdfStats(c: ContextWithAuth) {
  try {
    const userAuth = c.get("userAuth") as AuthPayload;

    if (!userAuth || !userAuth.username) {
      return c.json({ error: "User authentication required" }, 401);
    }

    // Get status-based stats
    const stats = await c.env.DB.prepare(
      "SELECT status, COUNT(*) as count FROM pdf_files WHERE username = ? GROUP BY status"
    )
      .bind(userAuth.username)
      .all();

    const statsMap = new Map();
    stats.results?.forEach((row: any) => {
      statsMap.set(row.status, row.count);
    });

    // Get file size statistics
    const sizeStats = await c.env.DB.prepare(
      "SELECT SUM(file_size) as total_size, AVG(file_size) as avg_size, COUNT(*) as total_files FROM pdf_files WHERE username = ? AND file_size > 0"
    )
      .bind(userAuth.username)
      .first();

    const totalFiles =
      (statsMap.get("completed") || 0) +
      (statsMap.get("processing") || 0) +
      (statsMap.get("error") || 0) +
      (statsMap.get("uploaded") || 0);

    return c.json({
      username: userAuth.username,
      totalFiles,
      totalSize: sizeStats?.total_size || 0,
      averageFileSize: sizeStats?.avg_size || 0,
      filesByStatus: {
        uploading: 0, // Not tracked in current implementation
        uploaded: statsMap.get("uploaded") || 0,
        parsing: 0, // Not tracked in current implementation
        parsed: statsMap.get("completed") || 0,
        error: statsMap.get("error") || 0,
      },
    });
  } catch (error) {
    console.error("Error fetching PDF stats:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Background processing for PDF metadata generation
export async function handleProcessMetadataBackground(c: ContextWithAuth) {
  try {
    const userAuth = c.get("userAuth") as AuthPayload;
    const { fileKey, openaiApiKey } = await c.req.json();

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

    console.log(
      "[handleProcessMetadataBackground] Starting background processing for:",
      fileKey
    );

    // Get the file from the database
    const file = await c.env.DB.prepare(
      "SELECT * FROM pdf_files WHERE file_key = ? AND username = ?"
    )
      .bind(fileKey, userAuth.username)
      .first();

    if (!file) {
      return c.json({ error: "File not found" }, 404);
    }

    // Re-pull the file from R2 (this is the key improvement)
    console.log(
      "[handleProcessMetadataBackground] Re-pulling file from R2:",
      fileKey
    );
    const object = await c.env.FILE_BUCKET.get(fileKey);
    if (!object) {
      return c.json({ error: "File not found in storage" }, 404);
    }

    // Process the PDF to extract text and generate metadata
    const ragService = new AutoRAGService(
      c.env.DB,
      c.env.AUTORAG,
      openaiApiKey || userAuth.openaiApiKey
    );

    // Create a temporary metadata object for processing
    const tempMetadata = {
      description: "",
      tags: [],
      filename: file.file_name as string,
      file_size: (file.file_size as number) || 0,
      status:
        (file.status as "uploaded" | "processing" | "processed" | "error") ||
        "uploaded",
      created_at: file.created_at as string,
    };

    // Process the PDF to generate metadata (this happens outside Durable Object context)
    console.log(
      "[handleProcessMetadataBackground] Processing PDF for metadata generation"
    );
    const processedResult = await ragService.processPdfFromR2(
      fileKey,
      userAuth.username,
      c.env.FILE_BUCKET,
      tempMetadata
    );

    // Extract the suggested metadata
    const suggestedMetadata = processedResult.suggestedMetadata;
    console.log(
      "[handleProcessMetadataBackground] Processed result:",
      processedResult
    );
    if (!suggestedMetadata) {
      console.error(
        "[handleProcessMetadataBackground] No suggested metadata generated"
      );
      return c.json({ error: "Failed to generate metadata" }, 500);
    }

    // Update the database with the auto-generated metadata
    await c.env.DB.prepare(
      "UPDATE pdf_files SET description = ?, tags = ? WHERE file_key = ? AND username = ?"
    )
      .bind(
        suggestedMetadata.description || "",
        JSON.stringify(suggestedMetadata.tags || []),
        fileKey,
        userAuth.username
      )
      .run();

    console.log(
      "[handleProcessMetadataBackground] Successfully updated metadata for:",
      fileKey
    );

    return c.json({
      message: "Background metadata processing completed successfully",
      data: {
        fileKey,
        description: suggestedMetadata.description,
        tags: suggestedMetadata.tags,
      },
    });
  } catch (error) {
    console.error("[handleProcessMetadataBackground] Error:", error);
    return c.json(
      { error: `Failed to process metadata in background: ${error}` },
      500
    );
  }
}

// Get PDF processing status
export async function handleGetPdfStatus(c: ContextWithAuth) {
  try {
    const userAuth = c.get("userAuth") as AuthPayload;
    const fileKey = c.req.param("*");

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

    const file = await c.env.DB.prepare(
      "SELECT status, created_at, updated_at, file_size FROM pdf_files WHERE file_key = ? AND username = ?"
    )
      .bind(fileKey, userAuth.username)
      .first();

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
    console.error("Error getting PDF status:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}
