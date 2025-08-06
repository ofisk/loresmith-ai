import type { Context } from "hono";
import { PDF_PROCESSING_CONFIG } from "../constants";
import { RAGService } from "../lib/rag";
import type { Env } from "../middleware/auth";
import type { AuthPayload } from "../services/auth-service";
import { completeProgress } from "../services/progress";
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

// Ingest PDF for processing
export async function handleIngestPdf(c: ContextWithAuth) {
  try {
    const userAuth = c.get("userAuth") as AuthPayload;
    const { fileKey, filename, description, tags, fileSize } =
      await c.req.json();

    if (!fileKey || !filename) {
      return c.json({ error: "File key and filename are required" }, 400);
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

    // Get file size from R2 if not provided
    let actualFileSize = fileSize;
    if (!actualFileSize) {
      try {
        console.log(`[PDF Ingest] Attempting to get file from R2: ${fileKey}`);
        // Add a small delay to ensure the file is fully uploaded
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const file = await c.env.FILE_BUCKET.get(fileKey);
        if (file) {
          actualFileSize = file.size;
          console.log(
            `[PDF Ingest] File found in R2, size: ${actualFileSize} bytes`
          );
        } else {
          console.log(`[PDF Ingest] File not found in R2: ${fileKey}`);
        }
      } catch (error) {
        console.warn("Could not get file size from R2:", error);
      }
    }

    // Check if file already exists
    const existingFile = await c.env.DB.prepare(
      "SELECT id FROM pdf_files WHERE file_key = ? AND username = ?"
    )
      .bind(fileKey, userAuth.username)
      .first();

    const now = new Date().toISOString();
    let newFileId: string | undefined;

    if (existingFile) {
      // Update existing file
      await c.env.DB.prepare(
        "UPDATE pdf_files SET file_name = ?, description = ?, tags = ?, status = ?, updated_at = ?, file_size = ? WHERE file_key = ? AND username = ?"
      )
        .bind(
          filename,
          description || "",
          tags ? JSON.stringify(tags) : "[]",
          "processing",
          now,
          actualFileSize || 0,
          fileKey,
          userAuth.username
        )
        .run();
    } else {
      // Insert new file
      newFileId = crypto.randomUUID();
      await c.env.DB.prepare(
        "INSERT INTO pdf_files (id, file_key, file_name, description, tags, username, status, created_at, file_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
        .bind(
          newFileId,
          fileKey,
          filename,
          description || "",
          tags ? JSON.stringify(tags) : "[]",
          userAuth.username,
          "processing",
          now,
          actualFileSize || 0
        )
        .run();
    }

    // Start background processing instead of processing immediately
    try {
      // Check if we have an OpenAI API key for processing
      if (!userAuth.openaiApiKey) {
        console.warn("No OpenAI API key available for PDF processing");
        // Update status to indicate no processing will happen
        await c.env.DB.prepare(
          "UPDATE pdf_files SET status = ?, updated_at = ? WHERE file_key = ?"
        )
          .bind("error", new Date().toISOString(), fileKey)
          .run();

        return c.json({
          success: true,
          fileKey,
          fileId: existingFile?.id || newFileId,
          message:
            "File uploaded successfully but processing requires OpenAI API key.",
        });
      }

      // Schedule background processing
      const processingPromise = processPdfInBackground(
        fileKey,
        userAuth.username,
        c.env.FILE_BUCKET,
        c.env.DB,
        c.env.VECTORIZE,
        userAuth.openaiApiKey,
        {
          description: description || "",
          tags: tags || [],
          filename: filename,
          file_size: actualFileSize || 0,
          status: "processing" as const,
          created_at: now,
        }
      );

      // Don't await the processing - let it run in background
      processingPromise.catch((error) => {
        console.error("Background PDF processing failed:", error);
        completeProgress(fileKey, false, (error as Error).message);
      });

      // Return immediately with success
      return c.json({
        success: true,
        fileKey,
        fileId: existingFile?.id || newFileId,
        message:
          "File uploaded successfully. Processing will continue in the background.",
      });
    } catch (error) {
      console.error("Error scheduling PDF processing:", error);
      completeProgress(fileKey, false, (error as Error).message);

      // Update database status
      await c.env.DB.prepare(
        "UPDATE pdf_files SET status = ?, updated_at = ? WHERE file_key = ?"
      )
        .bind("error", new Date().toISOString(), fileKey)
        .run();

      return c.json({ error: "Internal server error" }, 500);
    }
  } catch (error) {
    console.error("Error ingesting PDF:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Background PDF processing function
async function processPdfInBackground(
  fileKey: string,
  username: string,
  fileBucket: R2Bucket,
  db: D1Database,
  vectorize: VectorizeIndex,
  openaiApiKey: string,
  metadata: any
) {
  try {
    console.log(`[Background Processing] Starting processing for ${fileKey}`);

    // Get file from R2
    const file = await fileBucket.get(fileKey);
    if (!file) {
      throw new Error("File not found in R2");
    }

    // Process the PDF for RAG
    const ragService = new RAGService(db, vectorize, openaiApiKey);

    const processedResult = await ragService.processPdfFromR2(
      fileKey,
      username,
      fileBucket,
      metadata
    );

    // Auto-generate metadata if missing
    let finalDescription = metadata.description || "";
    let finalTags = metadata.tags || [];

    if (processedResult.suggestedMetadata) {
      if (!finalDescription) {
        finalDescription = processedResult.suggestedMetadata.description;
      }
      if (!finalTags.length) {
        finalTags = processedResult.suggestedMetadata.tags;
      }
    }

    // Update database status with final metadata and file size
    await db
      .prepare(
        "UPDATE pdf_files SET status = ?, updated_at = ?, file_size = ?, description = ?, tags = ? WHERE file_key = ?"
      )
      .bind(
        "completed",
        new Date().toISOString(),
        file.size,
        finalDescription,
        JSON.stringify(finalTags),
        fileKey
      )
      .run();

    completeProgress(fileKey, true);
    console.log(`[Background Processing] Completed processing for ${fileKey}`);
  } catch (error) {
    console.error(
      `[Background Processing] Error processing PDF ${fileKey}:`,
      error
    );
    completeProgress(fileKey, false, (error as Error).message);

    // Update database status
    await db
      .prepare(
        "UPDATE pdf_files SET status = ?, updated_at = ? WHERE file_key = ?"
      )
      .bind("error", new Date().toISOString(), fileKey)
      .run();
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
    const ragService = new RAGService(
      c.env.DB,
      c.env.VECTORIZE,
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
    const ragService = new RAGService(
      c.env.DB,
      c.env.VECTORIZE,
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
