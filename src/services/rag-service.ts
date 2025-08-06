// RAG service for metadata generation and search
// This service handles text extraction, embedding generation, and semantic search

import type { Env } from "../middleware/auth";
import type { FileMetadata, SearchQuery, SearchResult } from "../types/upload";

export class RAGService {
  constructor(private env: Env) {}

  /**
   * Process uploaded file for metadata generation
   */
  async processFile(metadata: FileMetadata): Promise<{
    description: string;
    tags: string[];
    vectorId?: string;
  }> {
    try {
      // Get file from R2
      const file = await this.env.FILE_BUCKET.get(metadata.fileKey);
      if (!file) {
        throw new Error("File not found in R2");
      }

      // Extract text based on file type
      const text = await this.extractText(file, metadata.contentType);

      if (!text) {
        console.log(
          `[RAGService] No text extracted from file: ${metadata.fileKey}`
        );
        return {
          description: `File: ${metadata.filename}`,
          tags: ["document"],
        };
      }

      // Generate metadata using RAG
      const result = await this.generateMetadata(text, metadata.filename);

      // Store embeddings for search
      const vectorId = await this.storeEmbeddings(text, metadata.id);

      console.log(`[RAGService] Processed file:`, {
        fileKey: metadata.fileKey,
        description: result.description,
        tags: result.tags,
        vectorId,
      });

      return {
        ...result,
        vectorId,
      };
    } catch (error) {
      console.error(
        `[RAGService] Error processing file ${metadata.fileKey}:`,
        error
      );
      return {
        description: `File: ${metadata.filename}`,
        tags: ["document"],
      };
    }
  }

  /**
   * Extract text from different file types
   */
  private async extractText(
    file: R2ObjectBody,
    contentType: string
  ): Promise<string | null> {
    const buffer = await file.arrayBuffer();

    if (contentType.includes("pdf")) {
      return await this.extractPdfText(buffer);
    } else if (contentType.includes("text")) {
      return new TextDecoder().decode(buffer);
    } else if (contentType.includes("json")) {
      const text = new TextDecoder().decode(buffer);
      try {
        const json = JSON.parse(text);
        return JSON.stringify(json, null, 2);
      } catch {
        return text;
      }
    }

    return null;
  }

  /**
   * Extract text from PDF (placeholder implementation)
   */
  private async extractPdfText(buffer: ArrayBuffer): Promise<string> {
    // TODO: Implement PDF text extraction
    // For now, return a placeholder
    return `PDF content extracted from file (${buffer.byteLength} bytes)`;
  }

  /**
   * Generate metadata using RAG
   */
  private async generateMetadata(
    text: string,
    filename: string
  ): Promise<{
    description: string;
    tags: string[];
  }> {
    // TODO: Implement actual RAG pipeline
    // For now, use simple heuristics

    const words = text.toLowerCase().split(/\s+/);
    const wordCount = words.length;

    // Simple tag generation based on content
    const tags = new Set<string>();
    tags.add("document");

    if (text.includes("contract") || text.includes("agreement")) {
      tags.add("legal");
      tags.add("contract");
    }

    if (text.includes("invoice") || text.includes("receipt")) {
      tags.add("financial");
      tags.add("invoice");
    }

    if (text.includes("report") || text.includes("analysis")) {
      tags.add("report");
      tags.add("analysis");
    }

    // Generate description
    const description = `${filename} - ${wordCount} words document`;

    return {
      description,
      tags: Array.from(tags),
    };
  }

  /**
   * Store embeddings for semantic search
   */
  private async storeEmbeddings(
    _text: string,
    metadataId: string
  ): Promise<string> {
    // TODO: Implement actual embedding generation and storage
    // For now, return a placeholder vector ID
    return `vector_${metadataId}`;
  }

  /**
   * Search files by keyword and semantic similarity
   */
  async searchFiles(query: SearchQuery): Promise<SearchResult[]> {
    const {
      query: searchQuery,
      userId,
      limit = 20,
      offset = 0,
      includeTags = true,
      includeSemantic = true,
    } = query;

    try {
      // Build search SQL
      let sql = `
        SELECT id, file_key, filename, description, tags, file_size, created_at
        FROM file_metadata 
        WHERE user_id = ?
      `;

      const params: any[] = [userId];

      // Add keyword search
      if (searchQuery.trim()) {
        sql += ` AND (
          filename LIKE ? OR 
          description LIKE ? OR 
          tags LIKE ?
        )`;
        const likeQuery = `%${searchQuery}%`;
        params.push(likeQuery, likeQuery, likeQuery);
      }

      // Add tag-based search if enabled
      if (includeTags && searchQuery.trim()) {
        // Search for tags that contain the query
        const tagQuery = `%"${searchQuery}"%`;
        if (!searchQuery.trim()) {
          sql += ` AND tags LIKE ?`;
          params.push(tagQuery);
        } else {
          sql += ` OR tags LIKE ?`;
          params.push(tagQuery);
        }
      }

      sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const result = await this.env.DB.prepare(sql)
        .bind(...params)
        .all();

      const searchResults: SearchResult[] = (result.results || []).map(
        (row: any) => ({
          id: row.id,
          fileKey: row.file_key,
          filename: row.filename,
          description: row.description,
          tags: JSON.parse(row.tags || "[]"),
          fileSize: row.file_size,
          createdAt: row.created_at,
        })
      );

      // TODO: Add semantic search using vector embeddings
      if (includeSemantic && searchQuery.trim()) {
        // This would use the vector database for semantic search
        console.log(
          `[RAGService] Semantic search not yet implemented for query: ${searchQuery}`
        );
      }

      console.log(`[RAGService] Search results:`, {
        query: searchQuery,
        userId,
        resultsCount: searchResults.length,
      });

      return searchResults;
    } catch (error) {
      console.error(`[RAGService] Search error:`, error);
      return [];
    }
  }

  /**
   * Get file metadata by ID
   */
  async getFileMetadata(
    fileId: string,
    userId: string
  ): Promise<FileMetadata | null> {
    try {
      const result = await this.env.DB.prepare(
        `
        SELECT * FROM file_metadata 
        WHERE id = ? AND user_id = ?
      `
      )
        .bind(fileId, userId)
        .first();

      if (!result) {
        return null;
      }

      return {
        id: result.id as string,
        fileKey: result.file_key as string,
        userId: result.user_id as string,
        filename: result.filename as string,
        fileSize: result.file_size as number,
        contentType: result.content_type as string,
        description: result.description as string | undefined,
        tags: JSON.parse((result.tags as string) || "[]"),
        status: result.status as
          | "uploaded"
          | "processing"
          | "completed"
          | "error",
        createdAt: result.created_at as string,
        updatedAt: result.updated_at as string,
        vectorId: result.vector_id as string | undefined,
      };
    } catch (error) {
      console.error(`[RAGService] Error getting file metadata:`, error);
      return null;
    }
  }

  /**
   * Update file metadata
   */
  async updateFileMetadata(
    fileId: string,
    userId: string,
    updates: Partial<FileMetadata>
  ): Promise<boolean> {
    try {
      const setClauses: string[] = [];
      const params: any[] = [];

      if (updates.description !== undefined) {
        setClauses.push("description = ?");
        params.push(updates.description);
      }

      if (updates.tags !== undefined) {
        setClauses.push("tags = ?");
        params.push(JSON.stringify(updates.tags));
      }

      if (updates.status !== undefined) {
        setClauses.push("status = ?");
        params.push(updates.status);
      }

      if (setClauses.length === 0) {
        return true;
      }

      setClauses.push("updated_at = ?");
      params.push(new Date().toISOString());

      params.push(fileId, userId);

      const sql = `
        UPDATE file_metadata 
        SET ${setClauses.join(", ")}
        WHERE id = ? AND user_id = ?
      `;

      await this.env.DB.prepare(sql)
        .bind(...params)
        .run();

      console.log(`[RAGService] Updated file metadata:`, { fileId, updates });
      return true;
    } catch (error) {
      console.error(`[RAGService] Error updating file metadata:`, error);
      return false;
    }
  }
}
