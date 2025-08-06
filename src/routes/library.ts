// Library API routes for file management and search
// Handles file listing, search, metadata updates, and file operations

import { Hono } from "hono";
import type { Env } from "../middleware/auth";
import type { AuthPayload } from "../services/auth-service";
import { RAGService } from "../services/rag-service";
import type { SearchQuery } from "../types/upload";

const library = new Hono<{
  Bindings: Env;
  Variables: { userAuth: AuthPayload };
}>();

// Get user's file library
library.get("/files", async (c) => {
  try {
    const userId = c.get("userAuth")?.username || "anonymous";
    const limit = parseInt(c.req.query("limit") || "20");
    const offset = parseInt(c.req.query("offset") || "0");

    const ragService = new RAGService(c.env);
    const files = await ragService.searchFiles({
      query: "",
      userId,
      limit,
      offset,
    });

    console.log(`[Library] Retrieved files for user:`, {
      userId,
      count: files.length,
    });

    return c.json({
      success: true,
      files,
      pagination: {
        limit,
        offset,
        total: files.length, // TODO: Add total count
      },
    });
  } catch (error) {
    console.error("[Library] Error getting files:", error);
    return c.json({ error: "Failed to get files" }, 500);
  }
});

// Search files
library.get("/search", async (c) => {
  try {
    const userId = c.get("userAuth")?.username || "anonymous";
    const query = c.req.query("q") || "";
    const limit = parseInt(c.req.query("limit") || "20");
    const offset = parseInt(c.req.query("offset") || "0");
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

    const ragService = new RAGService(c.env);
    const results = await ragService.searchFiles(searchQuery);

    console.log(`[Library] Search results:`, {
      query,
      userId,
      resultsCount: results.length,
    });

    return c.json({
      success: true,
      results,
      query,
      pagination: {
        limit,
        offset,
        total: results.length, // TODO: Add total count
      },
    });
  } catch (error) {
    console.error("[Library] Error searching files:", error);
    return c.json({ error: "Failed to search files" }, 500);
  }
});

// Get file metadata
library.get("/files/:fileId", async (c) => {
  try {
    const fileId = c.req.param("fileId");
    const userId = c.get("userAuth")?.username || "anonymous";

    const ragService = new RAGService(c.env);
    const metadata = await ragService.getFileMetadata(fileId, userId);

    if (!metadata) {
      return c.json({ error: "File not found" }, 404);
    }

    return c.json({
      success: true,
      metadata,
    });
  } catch (error) {
    console.error("[Library] Error getting file metadata:", error);
    return c.json({ error: "Failed to get file metadata" }, 500);
  }
});

// Update file metadata
library.put("/files/:fileId", async (c) => {
  try {
    const fileId = c.req.param("fileId");
    const userId = c.get("userAuth")?.username || "anonymous";
    const updates = await c.req.json();

    const ragService = new RAGService(c.env);
    const success = await ragService.updateFileMetadata(
      fileId,
      userId,
      updates
    );

    if (!success) {
      return c.json({ error: "Failed to update file metadata" }, 500);
    }

    console.log(`[Library] Updated file metadata:`, {
      fileId,
      userId,
      updates,
    });

    return c.json({ success: true });
  } catch (error) {
    console.error("[Library] Error updating file metadata:", error);
    return c.json({ error: "Failed to update file metadata" }, 500);
  }
});

// Delete file
library.delete("/files/:fileId", async (c) => {
  try {
    const fileId = c.req.param("fileId");
    const userId = c.get("userAuth")?.username || "anonymous";

    // Get file metadata first
    const ragService = new RAGService(c.env);
    const metadata = await ragService.getFileMetadata(fileId, userId);

    if (!metadata) {
      return c.json({ error: "File not found" }, 404);
    }

    // Delete from R2
    await c.env.FILE_BUCKET.delete(metadata.fileKey);

    // Delete from D1
    await c.env.DB.prepare(
      `
      DELETE FROM file_metadata 
      WHERE id = ? AND user_id = ?
    `
    )
      .bind(fileId, userId)
      .run();

    console.log(`[Library] Deleted file:`, {
      fileId,
      userId,
      fileKey: metadata.fileKey,
    });

    return c.json({ success: true });
  } catch (error) {
    console.error("[Library] Error deleting file:", error);
    return c.json({ error: "Failed to delete file" }, 500);
  }
});

// Get file download URL
library.get("/files/:fileId/download", async (c) => {
  try {
    const fileId = c.req.param("fileId");
    const userId = c.get("userAuth")?.username || "anonymous";

    const ragService = new RAGService(c.env);
    const metadata = await ragService.getFileMetadata(fileId, userId);

    if (!metadata) {
      return c.json({ error: "File not found" }, 404);
    }

    return c.json({
      success: true,
      fileKey: metadata.fileKey,
      filename: metadata.filename,
      fileSize: metadata.fileSize,
    });
  } catch (error) {
    console.error("[Library] Error generating download URL:", error);
    return c.json({ error: "Failed to generate download URL" }, 500);
  }
});

// Regenerate metadata for a file
library.post("/files/:fileId/regenerate", async (c) => {
  try {
    const fileId = c.req.param("fileId");
    const userId = c.get("userAuth")?.username || "anonymous";

    const ragService = new RAGService(c.env);
    const metadata = await ragService.getFileMetadata(fileId, userId);

    if (!metadata) {
      return c.json({ error: "File not found" }, 404);
    }

    // Process file for new metadata
    const processedMetadata = await ragService.processFile(metadata);

    // Update metadata
    await ragService.updateFileMetadata(fileId, userId, {
      description: processedMetadata.description,
      tags: processedMetadata.tags,
      vectorId: processedMetadata.vectorId,
    });

    console.log(`[Library] Regenerated metadata:`, {
      fileId,
      userId,
      description: processedMetadata.description,
      tags: processedMetadata.tags,
    });

    return c.json({
      success: true,
      metadata: {
        ...metadata,
        description: processedMetadata.description,
        tags: processedMetadata.tags,
        vectorId: processedMetadata.vectorId,
      },
    });
  } catch (error) {
    console.error("[Library] Error regenerating metadata:", error);
    return c.json({ error: "Failed to regenerate metadata" }, 500);
  }
});

export { library };
