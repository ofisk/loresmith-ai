import type { Context } from "hono";
import type { Env } from "../middleware/auth";
import type { AuthPayload } from "../services/auth-service";
import { RAGService } from "../lib/rag";
import { completeProgress } from "../services/progress";

// Extend the context to include userAuth
type ContextWithAuth = Context<{ Bindings: Env }> & {
  userAuth?: AuthPayload;
};

// Search RAG index
export async function handleRagSearch(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const { query, limit = 10 } = await c.req.json();

    if (!query) {
      return c.json({ error: "Query is required" }, 400);
    }

    const ragService = new RAGService(c.env.DB, c.env.VECTORIZE);
    const results = await ragService.searchContent(
      userAuth.username,
      query,
      limit
    );

    return c.json({ results });
  } catch (error) {
    console.error("Error searching RAG:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Process PDF for RAG
export async function handleProcessPdfForRag(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const { fileKey, filename, description, tags } = await c.req.json();

    if (!fileKey || !filename) {
      return c.json({ error: "File key and filename are required" }, 400);
    }

    // Store file metadata in database
    const fileId = crypto.randomUUID();
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      "INSERT INTO pdf_files (id, file_key, file_name, description, tags, username, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(
        fileId,
        fileKey,
        filename,
        description || "",
        tags ? JSON.stringify(tags) : "[]",
        userAuth.username,
        "processing",
        now
      )
      .run();

    // Start processing in background
    setTimeout(async () => {
      try {
        // Get file from R2
        const file = await c.env.PDF_BUCKET.get(fileKey);
        if (!file) {
          throw new Error("File not found in R2");
        }

        // Process with RAG service
        const ragService = new RAGService(c.env.DB, c.env.VECTORIZE);
        await ragService.processPdfFromR2(
          fileKey,
          userAuth.username,
          c.env.PDF_BUCKET,
          {
            file_key: fileKey,
            username: userAuth.username,
            file_name: filename,
            file_size: file.size,
            status: "processing",
            created_at: new Date().toISOString(),
          }
        );

        // Update database status
        await c.env.DB.prepare(
          "UPDATE pdf_files SET status = ?, updated_at = ? WHERE file_key = ?"
        )
          .bind("completed", new Date().toISOString(), fileKey)
          .run();

        completeProgress(fileKey, true);
      } catch (error) {
        console.error("Error processing PDF for RAG:", error);
        completeProgress(fileKey, false, (error as Error).message);

        // Update database status
        await c.env.DB.prepare(
          "UPDATE pdf_files SET status = ?, updated_at = ? WHERE file_key = ?"
        )
          .bind("error", new Date().toISOString(), fileKey)
          .run();
      }
    }, 100);

    return c.json({ success: true, fileKey, fileId });
  } catch (error) {
    console.error("Error processing PDF for RAG:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Process PDF from R2 for RAG
export async function handleProcessPdfFromR2ForRag(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const { fileKey, filename, description, tags } = await c.req.json();

    if (!fileKey || !filename) {
      return c.json({ error: "File key and filename are required" }, 400);
    }

    // Store file metadata in database
    const fileId = crypto.randomUUID();
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      "INSERT INTO pdf_files (id, file_key, file_name, description, tags, username, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(
        fileId,
        fileKey,
        filename,
        description || "",
        tags ? JSON.stringify(tags) : "[]",
        userAuth.username,
        "processing",
        now
      )
      .run();

    // Start processing in background
    setTimeout(async () => {
      try {
        // Get file from R2
        const file = await c.env.PDF_BUCKET.get(fileKey);
        if (!file) {
          throw new Error("File not found in R2");
        }

        // Process with RAG service
        const ragService = new RAGService(c.env.DB, c.env.VECTORIZE);
        await ragService.processPdfFromR2(
          fileKey,
          userAuth.username,
          c.env.PDF_BUCKET,
          {
            file_key: fileKey,
            username: userAuth.username,
            file_name: filename,
            file_size: file.size,
            status: "processing",
            created_at: new Date().toISOString(),
          }
        );

        // Update database status
        await c.env.DB.prepare(
          "UPDATE pdf_files SET status = ?, updated_at = ? WHERE file_key = ?"
        )
          .bind("completed", new Date().toISOString(), fileKey)
          .run();

        completeProgress(fileKey, true);
      } catch (error) {
        console.error("Error processing PDF from R2 for RAG:", error);
        completeProgress(fileKey, false, (error as Error).message);

        // Update database status
        await c.env.DB.prepare(
          "UPDATE pdf_files SET status = ?, updated_at = ? WHERE file_key = ?"
        )
          .bind("error", new Date().toISOString(), fileKey)
          .run();
      }
    }, 100);

    return c.json({ success: true, fileKey, fileId });
  } catch (error) {
    console.error("Error processing PDF from R2 for RAG:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Update PDF metadata for RAG
export async function handleUpdatePdfMetadataForRag(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const fileKey = c.req.param("fileKey");
    const { description, tags } = await c.req.json();

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
    console.error("Error updating PDF metadata for RAG:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Get PDF files for RAG
export async function handleGetPdfFilesForRag(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;

    const files = await c.env.DB.prepare(
      "SELECT id, file_key, file_name, description, tags, status, created_at, updated_at FROM pdf_files WHERE username = ? ORDER BY created_at DESC"
    )
      .bind(userAuth.username)
      .all();

    return c.json({ files: files.results || [] });
  } catch (error) {
    console.error("Error fetching PDF files for RAG:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Get PDF chunks for RAG
export async function handleGetPdfChunksForRag(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const fileKey = c.req.param("fileKey");

    const chunks = await c.env.DB.prepare(
      "SELECT id, file_key, chunk_text, chunk_index, created_at FROM pdf_chunks WHERE file_key = ? AND username = ? ORDER BY chunk_index"
    )
      .bind(fileKey, userAuth.username)
      .all();

    return c.json({ chunks: chunks.results || [] });
  } catch (error) {
    console.error("Error fetching PDF chunks for RAG:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

// Delete PDF for RAG
export async function handleDeletePdfForRag(c: ContextWithAuth) {
  try {
    const userAuth = (c as any).userAuth;
    const fileKey = c.req.param("fileKey");

    // Delete from R2
    await c.env.PDF_BUCKET.delete(fileKey);

    // Delete chunks from database
    await c.env.DB.prepare(
      "DELETE FROM pdf_chunks WHERE file_key = ? AND username = ?"
    )
      .bind(fileKey, userAuth.username)
      .run();

    // Delete file metadata from database
    await c.env.DB.prepare(
      "DELETE FROM pdf_files WHERE file_key = ? AND username = ?"
    )
      .bind(fileKey, userAuth.username)
      .run();

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting PDF for RAG:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}
