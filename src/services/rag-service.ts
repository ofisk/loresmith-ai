// RAG service for metadata generation and search
// This service handles text extraction, embedding generation, and semantic search
// Updated to work with AutoRAG for enhanced content processing

import type { Env } from "../middleware/auth";
import type { FileMetadata, SearchQuery, SearchResult } from "../types/upload";
import { BaseRAGService } from "./base-rag-service";

export class LibraryRAGService extends BaseRAGService {
  private ai: any;

  constructor(env: Env) {
    super(env.DB, env.VECTORIZE, env.OPENAI_API_KEY || "");
    this.ai = env.AI;
    this.env = env;
  }

  private env: Env;

  async processFile(metadata: FileMetadata): Promise<{
    description: string;
    tags: string[];
    vectorId?: string;
  }> {
    try {
      const file = await this.env.FILE_BUCKET.get(metadata.fileKey);
      if (!file) {
        throw new Error("File not found in R2");
      }

      // Extract text based on file type
      const text = await this.extractText(file, metadata.contentType);

      if (!text) {
        console.log(
          `[LibraryRAGService] No text extracted from file: ${metadata.fileKey}`
        );
        return {
          description: "",
          tags: [],
        };
      }

      // Use AI for enhanced metadata generation if available
      let result: { description: string; tags: string[] };
      try {
        if (this.ai) {
          // Generate semantic metadata using AI
          const semanticResult = await this.generateSemanticMetadata(
            metadata.filename,
            metadata.fileKey,
            metadata.userId
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
          result = {
            description: "",
            tags: [],
          };
        }
      } catch (aiError) {
        console.warn(
          "AI processing failed, falling back to basic processing:",
          aiError
        );
        result = {
          description: "",
          tags: [],
        };
      }

      // Store embeddings for search (simplified for AutoRAG)
      const vectorId = await this.storeEmbeddings(text, metadata.id);

      console.log(`[LibraryRAGService] Processed file:`, {
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
        `[LibraryRAGService] Error processing file ${metadata.fileKey}:`,
        error
      );
      return {
        description: "",
        tags: [],
      };
    }
  }

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

  private async extractPdfText(buffer: ArrayBuffer): Promise<string> {
    try {
      // Use AutoRAG's text extraction if available
      if (this.env.AI) {
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

  private async storeEmbeddings(
    _text: string,
    metadataId: string
  ): Promise<string> {
    // TODO: Implement actual embedding generation and storage
    // For now, return a placeholder vector ID
    return `vector_${metadataId}`;
  }

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
          `[LibraryRAGService] Semantic search not yet implemented for query: ${searchQuery}`
        );
      }

      console.log(`[LibraryRAGService] Search results:`, {
        query: searchQuery,
        userId,
        resultsCount: searchResults.length,
      });

      return searchResults;
    } catch (error) {
      console.error(`[LibraryRAGService] Search error:`, error);
      return [];
    }
  }

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
      console.error(`[LibraryRAGService] Error getting file metadata:`, error);
      return null;
    }
  }

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

      console.log(`[LibraryRAGService] Updated file metadata:`, {
        fileId,
        updates,
      });
      return true;
    } catch (error) {
      console.error(`[LibraryRAGService] Error updating file metadata:`, error);
      return false;
    }
  }

  async generateSemanticMetadata(
    fileName: string,
    fileKey: string,
    username: string
  ): Promise<{ description: string; tags: string[] } | undefined> {
    try {
      console.log(
        `[LibraryRAGService] Starting semantic metadata generation for ${fileName}`
      );

      // Check if AI binding is available
      if (!this.ai) {
        console.warn(
          "[LibraryRAGService] AI binding not available for semantic metadata generation"
        );
        return undefined;
      }

      console.log(
        `[LibraryRAGService] AI binding available, proceeding with semantic analysis`
      );

      // Generate metadata from filename analysis
      const semanticPrompt = `
Analyze the document filename "${fileName}" and generate meaningful metadata.

Based on the filename, generate:
1. A descriptive summary of what this document likely contains (not just "PDF document")
2. Relevant tags that describe the topics, themes, or content type based on the filename
3. Suggestions for how this document might be useful

Focus on extracting meaning from the filename structure and common naming patterns.

Document filename: ${fileName}
File key: ${fileKey}
Username: ${username}

Please provide the response in this exact format:
DESCRIPTION: [your description here]
TAGS: [tag1, tag2, tag3]
SUGGESTIONS: [suggestion1, suggestion2, suggestion3]
`;

      try {
        console.log(
          `[LibraryRAGService] Sending semantic prompt to AI:`,
          semanticPrompt
        );
        const response = await this.ai.run(semanticPrompt);
        console.log(
          `[LibraryRAGService] Semantic analysis response:`,
          response
        );

        // Parse the response to extract metadata
        const lines = response.split("\n");
        let description: string | undefined;
        let tags: string[] | undefined;

        for (const line of lines) {
          if (line.startsWith("DESCRIPTION:")) {
            const desc = line.replace("DESCRIPTION:", "").trim();
            if (desc) {
              description = desc;
            }
          } else if (line.startsWith("TAGS:")) {
            const tagsMatch = line.match(/TAGS:\s*\[(.*?)\]/);
            if (tagsMatch) {
              const parsedTags = tagsMatch[1]
                .split(",")
                .map((tag: string) => tag.trim().replace(/['"]/g, ""));
              if (parsedTags.length > 0) {
                tags = parsedTags;
              }
            }
          }
        }

        // Only return metadata if we have meaningful content
        if (description && tags && tags.length > 0) {
          return {
            description,
            tags,
          };
        }

        return undefined;
      } catch (error) {
        console.error(
          `[LibraryRAGService] Semantic analysis failed for ${fileName}:`,
          error
        );
        return undefined;
      }
    } catch (error) {
      console.error(
        `[LibraryRAGService] Error in generateSemanticMetadata:`,
        error
      );
      return undefined;
    }
  }

  protected async updateStatus(
    identifier: string,
    status: string
  ): Promise<void> {
    try {
      await this.env.DB.prepare(
        "UPDATE file_metadata SET status = ? WHERE id = ?"
      )
        .bind(status, identifier)
        .run();
    } catch (error) {
      console.error(`[LibraryRAGService] Error updating status:`, error);
    }
  }

  async getUserPdfs(username: string): Promise<any[]> {
    try {
      const result = await this.env.DB.prepare(
        "SELECT * FROM pdf_files WHERE username = ? ORDER BY created_at DESC"
      )
        .bind(username)
        .all();

      return result.results || [];
    } catch (error) {
      console.error(`[LibraryRAGService] Error getting user PDFs:`, error);
      return [];
    }
  }

  async searchContent(
    _username: string,
    query: string,
    _limit: number = 10
  ): Promise<any[]> {
    try {
      if (!this.ai) {
        console.warn(
          "[LibraryRAGService] AI binding not available for search, returning empty results"
        );
        return [];
      }

      // For now, return empty results as full search is not yet implemented
      // This can be enhanced when vector search is implemented
      console.log(
        `[LibraryRAGService] Semantic search not yet implemented for query: ${query}`
      );
      return [];
    } catch (error) {
      console.error(`[LibraryRAGService] Search error:`, error);
      return [];
    }
  }

  async processPdfFromR2(
    fileKey: string,
    username: string,
    fileBucket: any,
    metadata: any
  ): Promise<{ suggestedMetadata?: { description: string; tags: string[] } }> {
    try {
      // Get file from R2
      const file = await fileBucket.get(fileKey);
      if (!file) {
        throw new Error("File not found in R2");
      }

      // Extract text based on file type
      const text = await this.extractText(file, "application/pdf");

      if (!text) {
        console.log(
          `[LibraryRAGService] No text extracted from file: ${fileKey}`
        );
        return {};
      }

      // Generate semantic metadata using AI
      const semanticResult = await this.generateSemanticMetadata(
        metadata.filename || fileKey,
        fileKey,
        username
      );

      if (semanticResult) {
        return {
          suggestedMetadata: {
            description: semanticResult.description,
            tags: semanticResult.tags,
          },
        };
      }

      return {};
    } catch (error) {
      console.error(
        `[LibraryRAGService] Error processing PDF from R2: ${fileKey}`,
        error
      );
      return {};
    }
  }

  protected async getChunksByIds(_ids: string[]): Promise<any[]> {
    try {
      // For now, return empty array as chunks are not yet implemented
      // This can be enhanced when chunk storage is implemented
      return [];
    } catch (error) {
      console.error(`[LibraryRAGService] Error getting chunks:`, error);
      return [];
    }
  }
}
