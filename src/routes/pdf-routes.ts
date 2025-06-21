import { Hono } from "hono";
import { PdfMetadataService } from "../services/pdf-metadata";
import { validateAdminSecretFromHeader, createAdminSecretErrorResponse } from "../utils/pdf-admin-validation";

/**
 * PDF Routes Module
 * 
 * Contains all PDF-related endpoints for upload, management, and metadata operations.
 * This module provides a clean separation of concerns for PDF functionality.
 */

export const pdfRoutes = new Hono<{ Bindings: Env }>();

/**
 * DIRECT API ENDPOINTS FOR PDF UPLOADS
 *
 * These endpoints handle user-initiated uploads directly, bypassing the agent system
 * for better performance and reliability. They are the primary method for UI uploads.
 */

// Direct PDF upload endpoint for FormData uploads (large files)
pdfRoutes.post("/api/upload-pdf", async (c) => {
  try {
    const { key, uploadId } = c.req.query();
    
    // Validate admin secret
    const adminSecretValidation = validateAdminSecretFromHeader(c, c.env);
    if (!adminSecretValidation.isValid) {
      return createAdminSecretErrorResponse(adminSecretValidation);
    }

    if (!key || !uploadId) {
      return c.json({ error: "Missing key or uploadId parameter" }, 400);
    }

    // Get the file from the request body
    const formData = await c.req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return c.json({ error: "No file provided" }, 400);
    }

    // Validate file type
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return c.json({ error: "File must be a PDF" }, 400);
    }

    // Check file size
    if (file.size > 200 * 1024 * 1024) {
      // 200MB limit
      return c.json({ error: "File size exceeds 200MB limit" }, 400);
    }

    // Upload to R2
    const arrayBuffer = await file.arrayBuffer();
    await c.env.PDF_BUCKET.put(key, arrayBuffer, {
      httpMetadata: {
        contentType: "application/pdf",
        contentDisposition: `attachment; filename="${file.name}"`,
      },
      customMetadata: {
        originalFilename: file.name,
        uploadDate: new Date().toISOString(),
        uploadId,
      },
    });

    // Update metadata status to completed
    const metadataService = new PdfMetadataService(c.env.PDF_METADATA);
    await metadataService.updateStatus(uploadId, "completed");

    return c.json({
      success: true,
      message: `File "${file.name}" uploaded successfully`,
      key,
      uploadId,
    });
  } catch (error) {
    console.error("Upload error:", error);
    
    // Update metadata status to error if uploadId is available
    try {
      const { uploadId } = c.req.query();
      if (uploadId) {
        const metadataService = new PdfMetadataService(c.env.PDF_METADATA);
        await metadataService.updateStatus(uploadId, "error", error instanceof Error ? error.message : "Unknown error");
      }
    } catch (metadataError) {
      console.error("Failed to update metadata status:", metadataError);
    }
    
    return c.json(
      {
        error: "Upload failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// Generate upload URL endpoint for presigned URL workflow (large files)
pdfRoutes.post("/api/generate-upload-url", async (c) => {
  try {
    const { filename, fileSize, description, tags } = await c.req.json();
    
    // Validate admin secret
    const adminSecretValidation = validateAdminSecretFromHeader(c, c.env);
    if (!adminSecretValidation.isValid) {
      return createAdminSecretErrorResponse(adminSecretValidation);
    }

    if (!filename || !fileSize) {
      return c.json({ error: "Missing filename or fileSize" }, 400);
    }

    // Validate filename has .pdf extension
    if (!filename.toLowerCase().endsWith(".pdf")) {
      return c.json({ error: "File must have a .pdf extension" }, 400);
    }

    // Check file size (200MB limit)
    if (fileSize > 200 * 1024 * 1024) {
      return c.json(
        {
          error: `File size ${(fileSize / 1024 / 1024).toFixed(2)}MB exceeds maximum allowed size of 200MB`,
        },
        400
      );
    }

    // Generate unique key for the file
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const key = `uploads/${timestamp}-${filename}`;
    const uploadId = `upload_${timestamp}_${Math.random().toString(36).slice(2, 11)}`;

    // Create metadata in KV
    const metadataService = new PdfMetadataService(c.env.PDF_METADATA);
    await metadataService.createMetadata({
      id: uploadId,
      key,
      filename,
      fileSize,
      description,
      tags: tags ? (Array.isArray(tags) ? tags : [tags]) : [],
      uploadedBy: "user", // Could be extracted from auth context
      contentType: "application/pdf",
    });

    // Create upload URL
    const uploadUrl = `/api/upload-pdf?key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}`;

    return c.json({
      uploadId,
      uploadUrl,
      key,
      expiresIn: 3600,
      message: `Generated upload URL for "${filename}" (${(fileSize / 1024 / 1024).toFixed(2)}MB). Upload must be completed within 1 hour.`,
    });
  } catch (error) {
    console.error("Generate upload URL error:", error);
    return c.json(
      {
        error: "Failed to generate upload URL",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// Confirm upload endpoint for completing the upload workflow
pdfRoutes.post("/api/confirm-upload", async (c) => {
  try {
    const { uploadId } = await c.req.json();
    
    // Validate admin secret
    const adminSecretValidation = validateAdminSecretFromHeader(c, c.env);
    if (!adminSecretValidation.isValid) {
      return createAdminSecretErrorResponse(adminSecretValidation);
    }

    if (!uploadId) {
      return c.json({ error: "Missing uploadId" }, 400);
    }

    // Update metadata status to completed
    const metadataService = new PdfMetadataService(c.env.PDF_METADATA);
    await metadataService.updateStatus(uploadId, "completed");

    return c.json({
      success: true,
      message: `Upload ${uploadId} confirmed successfully`,
    });
  } catch (error) {
    console.error("Confirm upload error:", error);
    return c.json(
      {
        error: "Failed to confirm upload",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// Direct PDF upload endpoint for base64 uploads (small files)
pdfRoutes.post("/api/upload-pdf-direct", async (c) => {
  try {
    const { filename, fileData, description, tags } = await c.req.json();
    
    // Validate admin secret
    const adminSecretValidation = validateAdminSecretFromHeader(c, c.env);
    if (!adminSecretValidation.isValid) {
      return createAdminSecretErrorResponse(adminSecretValidation);
    }

    if (!filename || !fileData) {
      return c.json({ error: "Missing filename or fileData" }, 400);
    }

    // Decode base64 and get file size
    const fileBuffer = Buffer.from(fileData, "base64");
    const fileSize = fileBuffer.length;

    // Validate filename has .pdf extension
    if (!filename.toLowerCase().endsWith(".pdf")) {
      return c.json({ error: "File must have a .pdf extension" }, 400);
    }

    // Check file size (200MB limit)
    if (fileSize > 200 * 1024 * 1024) {
      return c.json(
        {
          error: `File size ${(fileSize / 1024 / 1024).toFixed(2)}MB exceeds maximum allowed size of 200MB`,
        },
        400
      );
    }

    // Generate unique key and ID for the file
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const key = `uploads/${timestamp}-${filename}`;
    const uploadId = `upload_${timestamp}_${Math.random().toString(36).slice(2, 11)}`;

    // Create metadata in KV
    const metadataService = new PdfMetadataService(c.env.PDF_METADATA);
    await metadataService.createMetadata({
      id: uploadId,
      key,
      filename,
      fileSize,
      description,
      tags: tags ? (Array.isArray(tags) ? tags : [tags]) : [],
      uploadedBy: "user", // Could be extracted from auth context
      contentType: "application/pdf",
    });

    // Upload to R2
    await c.env.PDF_BUCKET.put(key, fileBuffer, {
      httpMetadata: {
        contentType: "application/pdf",
        contentDisposition: `attachment; filename="${filename}"`,
      },
      customMetadata: {
        originalFilename: filename,
        uploadDate: new Date().toISOString(),
        fileSize: fileSize.toString(),
        uploadId,
      },
    });

    // Update metadata status to completed
    await metadataService.updateStatus(uploadId, "completed");

    return c.json({
      success: true,
      message: `File "${filename}" uploaded successfully`,
      key,
      uploadId,
      fileSize,
    });
  } catch (error) {
    console.error("Direct upload error:", error);
    
    // Update metadata status to error if uploadId is available
    try {
      const { uploadId } = await c.req.json();
      if (uploadId) {
        const metadataService = new PdfMetadataService(c.env.PDF_METADATA);
        await metadataService.updateStatus(uploadId, "error", error instanceof Error ? error.message : "Unknown error");
      }
    } catch (metadataError) {
      console.error("Failed to update metadata status:", metadataError);
    }
    
    return c.json(
      {
        error: "Upload failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

/**
 * PDF METADATA MANAGEMENT ENDPOINTS
 *
 * These endpoints provide CRUD operations for PDF metadata stored in Cloudflare KV.
 */

// List PDFs endpoint
pdfRoutes.get("/api/pdfs", async (c) => {
  try {
    // Validate admin secret
    const adminSecretValidation = validateAdminSecretFromHeader(c, c.env);
    if (!adminSecretValidation.isValid) {
      return createAdminSecretErrorResponse(adminSecretValidation);
    }

    const { limit, cursor, tags, uploadedBy, status } = c.req.query();

    const metadataService = new PdfMetadataService(c.env.PDF_METADATA);
    const result = await metadataService.listMetadata({
      limit: limit ? parseInt(limit) : 50,
      cursor,
      tags: tags ? tags.split(",") : undefined,
      uploadedBy,
      status: status as "uploading" | "completed" | "error" | undefined,
    });

    return c.json(result);
  } catch (error) {
    console.error("List PDFs error:", error);
    return c.json(
      {
        error: "Failed to list PDFs",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// Get PDF metadata by ID
pdfRoutes.get("/api/pdfs/:id", async (c) => {
  try {
    const { id } = c.req.param();
    
    // Validate admin secret
    const adminSecretValidation = validateAdminSecretFromHeader(c, c.env);
    if (!adminSecretValidation.isValid) {
      return createAdminSecretErrorResponse(adminSecretValidation);
    }

    const metadataService = new PdfMetadataService(c.env.PDF_METADATA);
    const metadata = await metadataService.getMetadata(id);

    if (!metadata) {
      return c.json({ error: "PDF not found" }, 404);
    }

    return c.json(metadata);
  } catch (error) {
    console.error("Get PDF metadata error:", error);
    return c.json(
      {
        error: "Failed to get PDF metadata",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// Update PDF metadata
pdfRoutes.put("/api/pdfs/:id", async (c) => {
  try {
    const { id } = c.req.param();
    const updates = await c.req.json();
    
    // Validate admin secret
    const adminSecretValidation = validateAdminSecretFromHeader(c, c.env);
    if (!adminSecretValidation.isValid) {
      return createAdminSecretErrorResponse(adminSecretValidation);
    }

    const metadataService = new PdfMetadataService(c.env.PDF_METADATA);
    const updated = await metadataService.updateMetadata(id, updates);

    if (!updated) {
      return c.json({ error: "PDF not found" }, 404);
    }

    return c.json(updated);
  } catch (error) {
    console.error("Update PDF metadata error:", error);
    return c.json(
      {
        error: "Failed to update PDF metadata",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// Delete PDF metadata (and optionally the file from R2)
pdfRoutes.delete("/api/pdfs/:id", async (c) => {
  try {
    const { id } = c.req.param();
    const { deleteFile } = c.req.query();
    
    // Validate admin secret
    const adminSecretValidation = validateAdminSecretFromHeader(c, c.env);
    if (!adminSecretValidation.isValid) {
      return createAdminSecretErrorResponse(adminSecretValidation);
    }

    const metadataService = new PdfMetadataService(c.env.PDF_METADATA);
    const metadata = await metadataService.getMetadata(id);

    if (!metadata) {
      return c.json({ error: "PDF not found" }, 404);
    }

    // Delete file from R2 if requested
    if (deleteFile === "true") {
      await c.env.PDF_BUCKET.delete(metadata.key);
    }

    // Delete metadata
    await metadataService.deleteMetadata(id);

    return c.json({
      success: true,
      message: `PDF ${id} deleted successfully`,
      fileDeleted: deleteFile === "true",
    });
  } catch (error) {
    console.error("Delete PDF error:", error);
    return c.json(
      {
        error: "Failed to delete PDF",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// Search PDFs
pdfRoutes.get("/api/pdfs/search/:query", async (c) => {
  try {
    const { query } = c.req.param();
    const { limit } = c.req.query();
    
    // Validate admin secret
    const adminSecretValidation = validateAdminSecretFromHeader(c, c.env);
    if (!adminSecretValidation.isValid) {
      return createAdminSecretErrorResponse(adminSecretValidation);
    }

    const metadataService = new PdfMetadataService(c.env.PDF_METADATA);
    const results = await metadataService.searchPdfs(
      query,
      limit ? parseInt(limit) : 20
    );

    return c.json({ results });
  } catch (error) {
    console.error("Search PDFs error:", error);
    return c.json(
      {
        error: "Failed to search PDFs",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// Get PDFs by tag
pdfRoutes.get("/api/pdfs/tag/:tag", async (c) => {
  try {
    const { tag } = c.req.param();
    const { limit } = c.req.query();
    
    // Validate admin secret
    const adminSecretValidation = validateAdminSecretFromHeader(c, c.env);
    if (!adminSecretValidation.isValid) {
      return createAdminSecretErrorResponse(adminSecretValidation);
    }

    const metadataService = new PdfMetadataService(c.env.PDF_METADATA);
    const results = await metadataService.getPdfsByTag(
      tag,
      limit ? parseInt(limit) : 50
    );

    return c.json({ results });
  } catch (error) {
    console.error("Get PDFs by tag error:", error);
    return c.json(
      {
        error: "Failed to get PDFs by tag",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// Get storage statistics
pdfRoutes.get("/api/pdfs/stats", async (c) => {
  try {
    // Validate admin secret
    const adminSecretValidation = validateAdminSecretFromHeader(c, c.env);
    if (!adminSecretValidation.isValid) {
      return createAdminSecretErrorResponse(adminSecretValidation);
    }

    const metadataService = new PdfMetadataService(c.env.PDF_METADATA);
    const stats = await metadataService.getStorageStats();

    return c.json(stats);
  } catch (error) {
    console.error("Get storage stats error:", error);
    return c.json(
      {
        error: "Failed to get storage stats",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}); 