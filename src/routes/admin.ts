import type { Context } from "hono";
import type { Env } from "@/middleware/auth";
import { getDAOFactory } from "@/dao/dao-factory";
import { LibraryRAGService } from "@/services/rag/rag-service";

type ContextWithAuth = Context<{ Bindings: Env }> & {
  userAuth?: any;
};

function requireAdmin(c: ContextWithAuth): void {
  const userAuth = (c as any).userAuth;
  if (!userAuth || !userAuth.isAdmin) {
    throw new Error("Admin access required");
  }
}

/**
 * POST /api/admin/regenerate-embeddings
 * Regenerate embeddings for all files from all users (admin only)
 */
export async function handleRegenerateEmbeddings(c: ContextWithAuth) {
  try {
    requireAdmin(c);
  } catch (error) {
    return c.json({ error: "Admin access required" }, 403);
  }

  try {
    console.log("🔄 Starting embedding regeneration for all files...");

    // Step 1: Get all files from file_metadata table (all users)
    console.log("📋 Fetching all files from database...");
    const daoFactory = getDAOFactory(c.env);
    const fileDAO = daoFactory.fileDAO;

    // Get all files from all users
    const db = (fileDAO as any).db;
    const allFilesResult = await db
      .prepare(
        "SELECT file_key, username, file_name FROM file_metadata WHERE status = 'completed'"
      )
      .all();
    const allFiles = (allFilesResult.results || []) as Array<{
      file_key: string;
      username: string;
      file_name: string;
    }>;

    console.log(
      `📁 Found ${allFiles.length} files to process (from all users)`
    );

    if (allFiles.length === 0) {
      return c.json({
        success: true,
        message: "No files found to regenerate",
        filesProcessed: 0,
      });
    }

    // Step 2: Initialize RAG service for processing
    const ragService = new LibraryRAGService(c.env);

    // Step 3: Process each file
    let successCount = 0;
    let failureCount = 0;
    const errors: Array<{ fileKey: string; error: string }> = [];

    for (const fileRecord of allFiles) {
      const fileKey = fileRecord.file_key;
      const username = fileRecord.username;

      try {
        console.log(`\n🔄 Processing file: ${fileKey} (user: ${username})`);

        if (!username) {
          console.warn(`⚠️  No username found for file: ${fileKey}`);
          failureCount++;
          errors.push({
            fileKey,
            error: "No username found in file metadata",
          });
          continue;
        }
        if (!username) {
          console.warn(`⚠️  No username found for file: ${fileKey}`);
          failureCount++;
          errors.push({
            fileKey,
            error: "No username found in file metadata",
          });
          continue;
        }

        // Get file from R2
        const file = await c.env.R2.get(fileKey);
        if (!file) {
          console.warn(`⚠️  File not found in R2: ${fileKey}`);
          failureCount++;
          errors.push({
            fileKey,
            error: "File not found in R2 storage",
          });
          continue;
        }

        // Process file using RAG service
        // Get content type from R2 metadata or use file metadata from DB
        const fileMetadata = await fileDAO.getFileMetadata(fileKey);
        const contentType =
          file.httpMetadata?.contentType ||
          (fileMetadata as any)?.content_type ||
          "application/pdf";

        const result = await ragService.processFileFromR2(
          fileKey,
          username,
          c.env.R2,
          {
            id: fileKey,
            filename: fileRecord.file_name || fileKey,
            contentType,
          }
        );

        if (result.vectorId) {
          console.log(`✅ Successfully regenerated embeddings for: ${fileKey}`);
          successCount++;
        } else {
          console.warn(
            `⚠️  No embeddings generated for: ${fileKey} (may have no extractable text)`
          );
          // Don't count as failure - file may just have no text
          successCount++;
        }
      } catch (error) {
        console.error(`❌ Error processing file ${fileKey}:`, error);
        failureCount++;
        errors.push({
          fileKey,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log("\n📊 Regeneration Summary:");
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Failed: ${failureCount}`);

    return c.json(
      {
        success: true,
        message: `Regenerated embeddings for ${successCount} files (from all users)`,
        summary: {
          totalFiles: allFiles.length,
          successful: successCount,
          failed: failureCount,
        },
        errors: errors.length > 0 ? errors : undefined,
      },
      failureCount > 0 ? 207 : 200 // 207 Multi-Status if some failed
    );
  } catch (error) {
    console.error("❌ Fatal error during regeneration:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
}
