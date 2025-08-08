// RAG service for metadata generation and search
// This service handles text extraction, embedding generation, and semantic search
// Updated to work with AutoRAG for enhanced content processing

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
          description: "",
          tags: [],
        };
      }

      // Use AutoRAG for enhanced metadata generation if available
      let result: { description: string; tags: string[] };
      try {
        if (this.env.AUTORAG) {
          const { AutoRAGService } = await import(
            "../services/autorag-service"
          );
          const autoRagService = new AutoRAGService(
            this.env.DB,
            this.env.AUTORAG
          );

          // Use AutoRAG for intelligent metadata generation
          const semanticResult = await autoRagService.generateSemanticMetadata(
            metadata.filename,
            metadata.fileKey,
            metadata.userId,
            1 // partCount - using 1 as default since we don't have the actual count here
          );

          if (semanticResult) {
            result = semanticResult;
          } else {
            // No meaningful metadata generated - leave blank
            result = {
              description: "",
              tags: [],
            };
          }
        } else {
          // No AutoRAG available - leave metadata blank
          result = {
            description: "",
            tags: [],
          };
        }
      } catch (autoRagError) {
        console.warn(
          "AutoRAG processing failed, falling back to basic processing:",
          autoRagError
        );
        result = {
          description: "",
          tags: [],
        };
      }

      // Store embeddings for search (simplified for AutoRAG)
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
        description: "",
        tags: [],
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
   * Extract text from PDF (simplified for AutoRAG compatibility)
   */
  private async extractPdfText(buffer: ArrayBuffer): Promise<string> {
    try {
      // Use AutoRAG's text extraction if available
      if (this.env.AUTORAG) {
        // AutoRAG handles PDF content directly - no extraction needed
        return `PDF content processed by AutoRAG (${buffer.byteLength} bytes)`;
      }

      // Fallback to basic text extraction
      const uint8Array = new Uint8Array(buffer);
      const decoder = new TextDecoder("utf-8", { fatal: false });
      const pdfString = decoder.decode(uint8Array);

      // Simple text extraction patterns
      const textPatterns = [
        /\(([^)]+)\)/g, // Text in parentheses
        /BT\s*([^E]+?)ET/g, // Text between BT and ET
        /Tj\s*\(([^)]*)\)/g, // Text after Tj
      ];

      let extractedText = "";

      for (const pattern of textPatterns) {
        const matches = pdfString.match(pattern) || [];
        for (const match of matches) {
          let text = match;
          if (pattern.source.includes("\\(")) {
            text = match.replace(/^[^(]*\(([^)]*)\)[^)]*$/, "$1");
          } else if (pattern.source.includes("BT")) {
            text = match.replace(/^BT\s*([^E]+?)ET.*$/, "$1");
          } else if (pattern.source.includes("Tj")) {
            text = match.replace(/^Tj\s*\(([^)]*)\).*$/, "$1");
          }

          // Clean up the text
          text = text
            .replace(/\\\(/g, "(")
            .replace(/\\\)/g, ")")
            .replace(/\\\\/g, "\\")
            .replace(/\\n/g, "\n")
            .replace(/\\r/g, "\r")
            .replace(/\\t/g, "\t")
            .replace(/\\s/g, " ")
            .replace(/\\/g, "");

          if (text.length > 2 && text.trim().length > 0 && text.length < 1000) {
            extractedText += `${text} `;
          }
        }
      }

      return (
        extractedText.replace(/\s+/g, " ").trim() ||
        `PDF content extracted (${buffer.byteLength} bytes)`
      );
    } catch (error) {
      console.error("Error extracting PDF text:", error);
      return `PDF content extracted (${buffer.byteLength} bytes)`;
    }
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
