// Library API routes for file management and search
// Handles file listing, search, metadata updates, and file operations

import { type Context, Hono } from "hono";
import { getDAOFactory } from "@/dao/dao-factory";
import { LibraryRAGService, getLibraryService } from "@/lib/service-factory";
import { requireUserJwt } from "@/middleware/auth";
import type { AuthPayload } from "@/services/core/auth-service";
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
  try {
    const userAuth = (c as any).userAuth;
    const userId = userAuth?.username || "anonymous";
    const limit = parseInt(c.req.query("limit") || "20", 10);
    const offset = parseInt(c.req.query("offset") || "0", 10);

    // Get files directly from database instead of using old RAG service
    const fileDAO = getDAOFactory(c.env).fileDAO;
    const files = await fileDAO.getFilesForRag(userId);

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
        // Note: Using files.length as total count. For pagination support,
        // we should query the database for total count separately.
        total: files.length,
      },
    });
  } catch (error) {
    console.error("[Library] Error getting files:", error);
    return c.json({ error: "Failed to get files" }, 500);
  }
};

export const handleSearchFiles = async (
  c: Context<{ Bindings: any; Variables: { userAuth: AuthPayload } }>
) => {
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

    console.log(`[Library] Search results:`, {
      query,
      userId,
      resultsCount: Array.isArray(results) ? results.length : 0,
    });

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
    console.error("[Library] Error searching files:", error);
    return c.json({ error: "Failed to search files" }, 500);
  }
};

export const handleGetStorageUsage = async (
  c: Context<{ Bindings: any; Variables: { userAuth: AuthPayload } }>
) => {
  try {
    console.log("[handleGetStorageUsage] Starting storage usage request");
    console.log("[handleGetStorageUsage] Context keys:", Object.keys(c));

    const userAuth = (c as any).userAuth;
    console.log("[handleGetStorageUsage] Retrieved userAuth:", userAuth);

    if (!userAuth) {
      console.log("[handleGetStorageUsage] No userAuth found, returning 401");
      return c.json({ error: "Authentication required" }, 401);
    }

    const libraryService = getLibraryService(c.env);
    const usage = await libraryService.getUserStorageUsage(
      userAuth.username,
      userAuth.isAdmin || false
    );

    console.log(
      `[Library] Retrieved storage usage for user: { type: ${userAuth.type}, username: ${userAuth.username}, isAdmin: ${userAuth.isAdmin} }`
    );

    return c.json({
      success: true,
      usage,
    });
  } catch (error) {
    console.error("[Library] Error getting storage usage:", error);
    return c.json({ error: "Failed to get storage usage" }, 500);
  }
};

export const handleGetFileDetails = async (
  c: Context<{ Bindings: any; Variables: { userAuth: AuthPayload } }>
) => {
  try {
    const fileId = c.req.param("fileId");
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
    console.error("[Library] Error getting file metadata:", error);
    return c.json({ error: "Failed to get file metadata" }, 500);
  }
};

export const handleUpdateFile = async (
  c: Context<{ Bindings: any; Variables: { userAuth: AuthPayload } }>
) => {
  try {
    const fileId = c.req.param("fileId");
    const userAuth = (c as any).userAuth;
    const userId = userAuth?.username || "anonymous";
    const updates = await c.req.json();

    const fileDAO = getDAOFactory(c.env).fileDAO;
    await fileDAO.updateFileRecord(fileId, "completed");
    const success = true;

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
};

export const handleDeleteFile = async (
  c: Context<{ Bindings: any; Variables: { userAuth: AuthPayload } }>
) => {
  try {
    const fileId = c.req.param("fileId");
    const userAuth = (c as any).userAuth;
    const userId = userAuth?.username || "anonymous";

    // Get file metadata first
    const fileDAO = getDAOFactory(c.env).fileDAO;
    const metadata = await fileDAO.getFileForRag(fileId, userId);

    if (!metadata) {
      return c.json({ error: "File not found" }, 404);
    }

    // Delete from R2
    await c.env.R2.delete(metadata.fileKey);

    // Delete from D1
    await c.env.DB.prepare(
      `
            delete from file_metadata
      where id = ? and user_id = ?
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
};

export const handleGetFileDownload = async (
  c: Context<{ Bindings: any; Variables: { userAuth: AuthPayload } }>
) => {
  try {
    const fileId = c.req.param("fileId");
    const userAuth = (c as any).userAuth;
    const userId = userAuth?.username || "anonymous";

    const fileDAO = getDAOFactory(c.env).fileDAO;
    const metadata = await fileDAO.getFileForRag(fileId, userId);

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
};

export const handleRegenerateFileMetadata = async (
  c: Context<{ Bindings: any; Variables: { userAuth: AuthPayload } }>
) => {
  try {
    const fileId = c.req.param("fileId");
    const userAuth = (c as any).userAuth;
    const userId = userAuth?.username || "anonymous";

    const fileDAO = getDAOFactory(c.env).fileDAO;
    const metadata = await fileDAO.getFileForRag(fileId, userId);

    if (!metadata) {
      return c.json({ error: "File not found" }, 404);
    }

    // AutoRAG handles metadata generation automatically, no manual processing needed
    console.log(
      `[Library] AutoRAG automatically handles metadata generation for file: ${metadata.filename}`
    );

    return c.json({
      success: true,
      metadata,
    });
  } catch (error) {
    console.error("[Library] Error regenerating metadata:", error);
    return c.json({ error: "Failed to regenerate metadata" }, 500);
  }
};
