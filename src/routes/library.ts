// Library API routes for file management and search
// Handles file listing, search, metadata updates, and file operations

import { Hono } from "hono";
import type { Env } from "../middleware/auth";
import type { AuthPayload } from "../services/auth-service";
import {
  getLibraryRagService,
  getStorageService,
} from "../services/service-factory";
import type { SearchQuery } from "../types/upload";
import { requireUserJwt } from "../middleware/auth";

const library = new Hono<{
  Bindings: Env;
  Variables: { userAuth: AuthPayload };
}>();

library.use("*", requireUserJwt);

library.get("/files", async (c) => {
  try {
    const userId = c.get("userAuth")?.username || "anonymous";
    const limit = parseInt(c.req.query("limit") || "20", 10);
    const offset = parseInt(c.req.query("offset") || "0", 10);

    const ragService = getLibraryRagService(c.env);
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

library.get("/search", async (c) => {
  try {
    const userId = c.get("userAuth")?.username || "anonymous";
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

    const ragService = getLibraryRagService(c.env);
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

library.get("/files/:fileId", async (c) => {
  try {
    const fileId = c.req.param("fileId");
    const userId = c.get("userAuth")?.username || "anonymous";

    const ragService = getLibraryRagService(c.env);
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

library.put("/files/:fileId", async (c) => {
  try {
    const fileId = c.req.param("fileId");
    const userId = c.get("userAuth")?.username || "anonymous";
    const updates = await c.req.json();

    const ragService = getLibraryRagService(c.env);
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

library.delete("/files/:fileId", async (c) => {
  try {
    const fileId = c.req.param("fileId");
    const userId = c.get("userAuth")?.username || "anonymous";

    // Get file metadata first
    const ragService = getLibraryRagService(c.env);
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

library.get("/files/:fileId/download", async (c) => {
  try {
    const fileId = c.req.param("fileId");
    const userId = c.get("userAuth")?.username || "anonymous";

    const ragService = getLibraryRagService(c.env);
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

library.post("/files/:fileId/regenerate", async (c) => {
  try {
    const fileId = c.req.param("fileId");
    const userId = c.get("userAuth")?.username || "anonymous";

    const ragService = getLibraryRagService(c.env);
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

library.get("/storage-usage", async (c) => {
  try {
    const userAuth = c.get("userAuth");
    if (!userAuth) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const storageService = getStorageService(c.env);
    const usage = await storageService.getUserStorageUsage(
      userAuth.username,
      userAuth.isAdmin || false
    );

    console.log(
      `[Library] Retrieved storage usage for user: ` +
        JSON.stringify(userAuth, null, 2)
    );

    return c.json({
      success: true,
      usage,
    });
  } catch (error) {
    console.error("[Library] Error getting storage usage:", error);
    return c.json({ error: "Failed to get storage usage" }, 500);
  }
});

export { library };
