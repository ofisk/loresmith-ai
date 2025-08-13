import type { D1Database } from "@cloudflare/workers-types";
import type { Env } from "../middleware/auth";

export interface PdfMetadata {
  file_key: string;
  username: string;
  file_name: string;
  description?: string;
  tags?: string[];
  file_size: number;
  status: "uploaded" | "processing" | "processed" | "error";
  created_at: string;
  chunk_count?: number;
  chunk_size?: number;
}

export interface SearchResult {
  content: string;
  score: number;
  metadata?: Record<string, any>;
  source?: string;
}

export class AutoRAGService {
  private db: D1Database;
  private ai: any;

  constructor(env: Env) {
    this.db = env.DB;
    this.ai = env.AI;

    // Debug logging to check if AI binding is available
    console.log(
      "[AutoRAGService] Constructor called with AI binding:",
      !!this.ai
    );
    if (!this.ai) {
      console.warn(
        "[AutoRAGService] AI binding is not available - will use fallback processing"
      );
    }
  }

  /**
   * Process a PDF file using AutoRAG
   */
  async processPdf(
    fileKey: string,
    username: string,
    _content: string,
    metadata: Partial<PdfMetadata>
  ): Promise<void> {
    try {
      // Use AutoRAG to process the content

      // Add content to AutoRAG with user-specific metadata
      // For now, skip AutoRAG processing since content insertion is not yet implemented
      console.log(
        "[AutoRAGService] Skipping AutoRAG processing - content insertion not yet supported"
      );

      // Skip AutoRAG processing for now

      // Generate metadata suggestions using AutoRAG

      const suggestions = await this.generateSemanticMetadata(
        metadata.file_name || "",
        fileKey,
        username,
        1 // partCount - using 1 as default since we don't have the actual count here
      );

      // Update database with processed status and suggestions
      if (suggestions) {
        await this.db
          .prepare(
            "UPDATE pdf_files SET status = ?, description = ?, tags = ? WHERE file_key = ? AND username = ?"
          )
          .bind(
            "processed",
            suggestions.description,
            JSON.stringify(suggestions.tags),
            fileKey,
            username
          )
          .run();
      } else {
        // No meaningful metadata generated, just mark as processed
        await this.db
          .prepare(
            "UPDATE pdf_files SET status = ? WHERE file_key = ? AND username = ?"
          )
          .bind("processed", fileKey, username)
          .run();
      }
    } catch (error) {
      console.error("Error processing PDF with AutoRAG:", error);

      // Update database with error status
      await this.db
        .prepare(
          "UPDATE pdf_files SET status = ?, description = ? WHERE file_key = ? AND username = ?"
        )
        .bind(
          "error",
          `Processing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          fileKey,
          username
        )
        .run();

      throw error;
    }
  }

  /**
   * Process PDF from R2 storage using AutoRAG
   */
  async processPdfFromR2(
    fileKey: string,
    username: string,
    _pdfBucket: R2Bucket,
    metadata: Partial<PdfMetadata>
  ): Promise<{
    suggestedMetadata?: {
      description: string;
      tags: string[];
      suggestions: string[];
    };
  }> {
    try {
      // SECURITY: Validate file before processing
      if (!this.validateFileSecurity(fileKey, (metadata as any).contentType)) {
        console.error(
          `[AutoRAGService] Security validation failed for file: ${fileKey}`
        );
        return { suggestedMetadata: undefined };
      }

      // Check if AutoRAG parts exist from the upload process
      const autoRAGParts = await this.findAutoRAGParts(fileKey, _pdfBucket);

      if (autoRAGParts.length > 0) {
        console.log(
          `[AutoRAGService] Found ${autoRAGParts.length} AutoRAG parts for ${fileKey}`
        );

        // Update database with part information
        await this.db
          .prepare(
            "UPDATE pdf_files SET status = ?, chunk_count = ? WHERE file_key = ? AND username = ?"
          )
          .bind("processed", autoRAGParts.length, fileKey, username)
          .run();

        // SECURITY: Never process binary chunks directly - only use filename for metadata
        // This prevents any possibility of executing malicious code from uploaded files
        console.log(
          `[AutoRAGService] Generating semantic metadata for ${fileKey} with ${autoRAGParts.length} parts (filename-based only)`
        );
        const suggestions = await this.generateSemanticMetadata(
          metadata.file_name || "Unknown",
          fileKey,
          username,
          autoRAGParts.length
        );

        console.log(
          `[AutoRAGService] Generated suggestions for ${fileKey}:`,
          suggestions
        );

        return { suggestedMetadata: suggestions };
      }

      // If no AutoRAG parts exist, AutoRAG will handle the file normally
      console.log(
        `[AutoRAGService] No AutoRAG parts found for ${fileKey}, AutoRAG will process normally`
      );

      // Don't generate generic metadata - let AutoRAG handle it naturally
      return { suggestedMetadata: undefined };
    } catch (error) {
      console.error(`[AutoRAGService] Error processing PDF from R2:`, error);
      throw error;
    }
  }

  /**
   * Generate semantic metadata by querying AutoRAG for content samples
   */
  async generateSemanticMetadata(
    fileName: string,
    fileKey: string,
    username: string,
    _partCount: number
  ): Promise<
    { description: string; tags: string[]; suggestions: string[] } | undefined
  > {
    try {
      console.log(
        `[AutoRAGService] Starting semantic metadata generation for ${fileName}`
      );

      // Check if AI binding is available
      if (!this.ai) {
        console.warn(
          "[AutoRAGService] AI binding not available for semantic metadata generation"
        );
        return undefined;
      }

      console.log(
        `[AutoRAGService] AI binding available, proceeding with semantic analysis`
      );

      // FILENAME-BASED METADATA GENERATION: Generate metadata from filename analysis
      // Purpose: Since we can't access PDF content directly, analyze the filename for meaningful metadata
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
          `[AutoRAGService] Sending semantic prompt to AI:`,
          semanticPrompt
        );
        const response = await this.ai.run(semanticPrompt);
        console.log(`[AutoRAGService] Semantic analysis response:`, response);

        // Parse the response to extract metadata
        const lines = response.split("\n");
        let description: string | undefined;
        let tags: string[] | undefined;
        let suggestions: string[] | undefined;

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
          } else if (line.startsWith("SUGGESTIONS:")) {
            const suggestionsMatch = line.match(/SUGGESTIONS:\s*\[(.*?)\]/);
            if (suggestionsMatch) {
              const parsedSuggestions = suggestionsMatch[1]
                .split(",")
                .map((suggestion: string) =>
                  suggestion.trim().replace(/['"]/g, "")
                );
              if (parsedSuggestions.length > 0) {
                suggestions = parsedSuggestions;
              }
            }
          }
        }

        // Only return metadata if we have meaningful content for all fields
        if (
          description &&
          tags &&
          tags.length > 0 &&
          suggestions &&
          suggestions.length > 0
        ) {
          return {
            description,
            tags,
            suggestions,
          };
        }

        // If no meaningful metadata was generated, return undefined
        // This allows future metadata generation checks to try again
        return undefined;
      } catch (aiError) {
        console.warn(
          `[AutoRAGService] Semantic analysis failed for ${fileName}:`,
          aiError
        );
        // Fall through to basic metadata
      }

      // Don't generate generic metadata - better to have no metadata than misleading metadata
      return undefined;
    } catch (error) {
      console.error("Error generating semantic metadata:", error);

      // Don't generate generic metadata - better to have no metadata than misleading metadata
      return undefined;
    }
  }

  /**
   * Search content using AutoRAG
   */
  async searchContent(
    username: string,
    query: string,
    limit: number = 10
  ): Promise<SearchResult[]> {
    try {
      // Check if AI binding is available
      if (!this.ai) {
        console.warn(
          "[AutoRAGService] AI binding not available for search, returning empty results"
        );
        return [];
      }

      const response = await this.ai
        .autorag("loresmith-library-autorag")
        .search({
          query,
          max_num_results: limit,
          // Filter by user metadata to scope results
          filters: {
            username: username,
          },
        });

      if (!response.success) {
        throw new Error(`AutoRAG search failed: ${response.error}`);
      }

      // Transform AutoRAG results to our format
      return (response.results || []).map((result: any) => ({
        content: result.content || result.text || "",
        score: result.score || 0,
        metadata: result.metadata || {},
        source: result.metadata?.file_name || "Unknown",
      }));
    } catch (error) {
      console.error("Error searching content with AutoRAG:", error);
      return [];
    }
  }

  /**
   * Get user's PDF files
   */
  async getUserPdfs(username: string): Promise<PdfMetadata[]> {
    try {
      const result = await this.db
        .prepare(
          "SELECT file_key, file_name, description, tags, file_size, status, created_at FROM pdf_files WHERE username = ? ORDER BY created_at DESC"
        )
        .bind(username)
        .all<{
          file_key: string;
          file_name: string;
          description: string | null;
          tags: string | null;
          file_size: number;
          status: string;
          created_at: string;
        }>();

      const files = result.results.map((row) => ({
        ...row,
        username,
        description: row.description || undefined,
        status: row.status as "uploaded" | "processing" | "processed" | "error",
        tags: row.tags ? (JSON.parse(row.tags) as string[]) : [],
      }));

      // Check if any files are ready for metadata update
      await this.checkAndUpdateMetadata(files, username);

      return files;
    } catch (error) {
      console.error("Error getting user PDFs:", error);
      return [];
    }
  }

  /**
   * Check if files are indexed in AutoRAG and update metadata
   */
  private async checkAndUpdateMetadata(
    files: PdfMetadata[],
    username: string
  ): Promise<void> {
    if (!this.ai) return;

    for (const file of files) {
      // Skip files that already have metadata or are in error state
      if (file.description || file.status === "error") continue;

      try {
        // Check if file is indexed by searching for its content
        const isIndexed = await this.checkFileIndexedInAutoRAG(
          file.file_key,
          username
        );

        if (isIndexed) {
          // File is indexed, update metadata
          await this.updateFileMetadataFromAutoRAG(
            file.file_key,
            username,
            file.file_name
          );
        } else {
          // File is not yet indexed, keep as "uploaded" status
          // AutoRAG will process it automatically when ready
          console.log(
            `[AutoRAGService] File ${file.file_key} not yet indexed in AutoRAG`
          );
        }
      } catch (error) {
        console.error(
          `Error checking AutoRAG status for ${file.file_key}:`,
          error
        );
      }
    }
  }

  /**
   * Check if a specific file is indexed in AutoRAG
   */
  private async checkFileIndexedInAutoRAG(
    fileKey: string,
    username: string
  ): Promise<boolean> {
    try {
      // Search for the file by its key in AutoRAG
      const searchResult = await this.ai
        .autorag("loresmith-library-autorag")
        .search({
          query: fileKey,
          max_num_results: 1,
          filters: { username },
        });

      return (
        searchResult.success &&
        searchResult.results &&
        searchResult.results.length > 0
      );
    } catch (error) {
      console.error(
        `Error checking if file ${fileKey} is indexed in AutoRAG:`,
        error
      );
      return false;
    }
  }

  /**
   * Update file metadata using AutoRAG analysis
   */
  private async updateFileMetadataFromAutoRAG(
    fileKey: string,
    username: string,
    fileName: string
  ): Promise<void> {
    try {
      // Generate metadata suggestions using AutoRAG
      const suggestions = await this.generateSemanticMetadata(
        fileName,
        fileKey,
        username,
        1 // partCount - using 1 as default since we don't have the actual count here
      );

      // Update database with new metadata
      if (suggestions) {
        await this.db
          .prepare(
            "UPDATE pdf_files SET status = ?, description = ?, tags = ? WHERE file_key = ? AND username = ?"
          )
          .bind(
            "processed",
            suggestions.description,
            JSON.stringify(suggestions.tags),
            fileKey,
            username
          )
          .run();
      } else {
        // No meaningful metadata generated, just mark as processed
        await this.db
          .prepare(
            "UPDATE pdf_files SET status = ? WHERE file_key = ? AND username = ?"
          )
          .bind("processed", fileKey, username)
          .run();
      }

      console.log(`[AutoRAGService] Updated metadata for ${fileKey}`);
    } catch (error) {
      console.error(`Error updating metadata for ${fileKey}:`, error);
    }
  }

  /**
   * Update PDF metadata
   */
  async updatePdfMetadata(
    fileKey: string,
    username: string,
    updates: Partial<Pick<PdfMetadata, "description" | "tags">>,
    regenerateSuggestions: boolean = false
  ): Promise<{ suggestions?: string[] }> {
    try {
      const updateFields: string[] = [];
      const bindValues: any[] = [];

      if (updates.description !== undefined) {
        updateFields.push("description = ?");
        bindValues.push(updates.description);
      }

      if (updates.tags !== undefined) {
        updateFields.push("tags = ?");
        bindValues.push(JSON.stringify(updates.tags));
      }

      if (updateFields.length > 0) {
        bindValues.push(fileKey, username);
        await this.db
          .prepare(
            `UPDATE pdf_files SET ${updateFields.join(", ")} WHERE file_key = ? AND username = ?`
          )
          .bind(...bindValues)
          .run();
      }

      // If regenerating suggestions, fetch the file content and regenerate
      if (regenerateSuggestions) {
        const file = await this.db
          .prepare(
            "SELECT file_name FROM pdf_files WHERE file_key = ? AND username = ?"
          )
          .bind(fileKey, username)
          .first<{ file_name: string }>();

        if (file) {
          // This would require fetching the original content
          // For now, return empty suggestions
          return { suggestions: [] };
        }
      }

      return {};
    } catch (error) {
      console.error("Error updating PDF metadata:", error);
      throw error;
    }
  }

  /**
   * Delete PDF and its associated content
   */
  async deletePdf(fileKey: string, username: string): Promise<void> {
    try {
      // Remove from AutoRAG if available
      if (this.ai) {
        // Note: AutoRAG delete functionality may need to be implemented differently
        // For now, we'll just log that deletion was attempted
        console.log(
          `[AutoRAGService] AutoRAG deletion requested for file: ${fileKey}, user: ${username}`
        );
      }

      // Remove from database
      await this.db
        .prepare("DELETE FROM pdf_files WHERE file_key = ? AND username = ?")
        .bind(fileKey, username)
        .run();
    } catch (error) {
      console.error("Error deleting PDF:", error);
      throw error;
    }
  }

  /**
   * Security validation to ensure we never process executable content
   */
  private validateFileSecurity(fileKey: string, contentType?: string): boolean {
    // Never process files that could be executable
    const dangerousExtensions = [
      ".exe",
      ".bat",
      ".cmd",
      ".com",
      ".scr",
      ".pif",
      ".vbs",
      ".js",
      ".jar",
      ".msi",
    ];
    const dangerousContentTypes = [
      "application/x-executable",
      "application/x-msdownload",
      "application/x-msi",
    ];

    const lowerFileKey = fileKey.toLowerCase();
    const hasDangerousExtension = dangerousExtensions.some((ext) =>
      lowerFileKey.includes(ext)
    );
    const hasDangerousContentType =
      contentType && dangerousContentTypes.includes(contentType);

    if (hasDangerousExtension || hasDangerousContentType) {
      console.warn(
        `[AutoRAGService] Security warning: Potentially dangerous file detected: ${fileKey}`
      );
      return false;
    }

    return true;
  }

  /**
   * Find AutoRAG parts for a file
   */
  private async findAutoRAGParts(
    fileKey: string,
    pdfBucket: R2Bucket
  ): Promise<string[]> {
    try {
      // Extract username and original filename from fileKey for part lookup
      const parts = fileKey.split("/");
      const username = parts[0];
      const originalFilename = parts[parts.length - 1] || "unknown";
      const prefix = `${username}/part-`;
      const objects = await pdfBucket.list({ prefix });

      if (!objects.objects || objects.objects.length === 0) {
        return [];
      }

      // Sort parts by part number
      const partKeys = objects.objects
        .map((obj) => obj.key)
        .filter(
          (key) =>
            key.includes(`part-`) &&
            key.includes(originalFilename) &&
            (key.endsWith(".txt") || key.endsWith(".chunk"))
        )
        .sort((a, b) => {
          // Extract part numbers for sorting
          const aMatch = a.match(/part-(\d+)-/);
          const bMatch = b.match(/part-(\d+)-/);

          if (!aMatch || !bMatch) return 0;

          const aPart = parseInt(aMatch[1]);
          const bPart = parseInt(bMatch[1]);

          return aPart - bPart;
        });

      console.log(
        `[AutoRAGService] Found ${partKeys.length} AutoRAG parts for ${fileKey}`
      );
      return partKeys;
    } catch (error) {
      console.error(
        `[AutoRAGService] Error finding AutoRAG parts for ${fileKey}:`,
        error
      );
      return [];
    }
  }
}
