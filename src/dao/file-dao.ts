import type { R2Bucket, VectorizeIndex } from "@cloudflare/workers-types";
import { BaseDAOClass } from "./base-dao";
import { LibraryRAGService } from "@/services/rag/rag-service";

export interface FileMetadata {
  id: string;
  file_key: string;
  file_name: string;
  display_name?: string;
  username: string;
  file_size: number;
  content_type: string;
  description?: string;
  tags?: string;
  vector_id?: string;
  chunk_count?: number;
  created_at: string;
  updated_at: string;
  content_summary?: string;
  key_topics?: string;
  content_type_categories?: string;
  difficulty_level?: string;
  target_audience?: string;
  campaign_themes?: string;
  recommended_campaign_types?: string;
  content_quality_score?: number;
  last_analyzed_at?: string;
  analysis_status?: string;
  analysis_error?: string;
}

// Interface for parsed file metadata (with tags as array)
export interface ParsedFileMetadata extends Omit<FileMetadata, "tags"> {
  tags: string[];
}

export interface PDFChunk {
  id: string;
  file_key: string;
  username: string;
  chunk_index: number;
  chunk_text: string;
  embedding_id?: string;
  metadata?: string;
  created_at: string;
}

export interface FileWithChunks extends ParsedFileMetadata {
  chunks: PDFChunk[];
}

export class FileDAO extends BaseDAOClass {
  // File status constants
  static readonly STATUS = {
    // Upload flow statuses
    UPLOADING: "uploading", // File is being uploaded to R2
    UPLOADED: "uploaded", // File uploaded to R2, ready for indexing
    SYNCING: "syncing", // Indexing job started
    PROCESSING: "processing", // File is being processed
    INDEXING: "indexing", // File is being indexed
    COMPLETED: "completed", // File is fully indexed and searchable
    ERROR: "error", // Error occurred at any step
    UNINDEXED: "unindexed", // File uploaded but not indexed (legacy)
  } as const;
  /**
   * Helper function to parse tags from JSON string to array
   * @param tags - The tags field from the database (JSON string or null)
   * @param fileKey - The file key for error logging
   * @returns Parsed tags array or empty array if parsing fails
   */
  private parseTags(tags: string | null, fileKey: string): string[] {
    if (!tags) return [];

    try {
      return JSON.parse(tags);
    } catch (error) {
      console.warn(
        `[FileDAO] Failed to parse tags for file ${fileKey}:`,
        error
      );
      return [];
    }
  }

  /**
   * Helper function to query file metadata and parse tags
   * @param sql - SQL query to execute
   * @param params - Query parameters
   * @returns Parsed file metadata or null if not found
   */
  private async queryAndParseFileMetadata(
    sql: string,
    params: any[]
  ): Promise<ParsedFileMetadata | null> {
    const file = await this.queryFirst<FileMetadata>(sql, params);

    if (!file) return null;

    return {
      ...file,
      tags: this.parseTags(file.tags || null, file.file_key),
    };
  }

  /**
   * Helper function to query multiple file metadata records and parse tags
   * @param sql - SQL query to execute
   * @param params - Query parameters
   * @returns Array of parsed file metadata
   */
  private async queryAndParseMultipleFileMetadata(
    sql: string,
    params: any[]
  ): Promise<ParsedFileMetadata[]> {
    const files = await this.queryAll<FileMetadata>(sql, params);

    return files.map((file) => ({
      ...file,
      tags: this.parseTags(file.tags || null, file.file_key),
    }));
  }
  async createFileMetadata(
    id: string,
    fileKey: string,
    file_name: string,
    username: string,
    fileSize: number,
    contentType: string,
    description?: string,
    tags?: string
  ): Promise<void> {
    const sql = `
      INSERT OR REPLACE INTO file_metadata (
        id, file_key, file_name, username, file_size, content_type,
        description, tags, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    await this.execute(sql, [
      id,
      fileKey,
      file_name,
      username,
      fileSize,
      contentType,
      description,
      tags,
    ]);
  }

  async getFileMetadata(fileKey: string): Promise<ParsedFileMetadata | null> {
    const sql = "SELECT * FROM file_metadata WHERE file_key = ?";
    return this.queryAndParseFileMetadata(sql, [fileKey]);
  }

  async getFileMetadataById(id: string): Promise<ParsedFileMetadata | null> {
    const sql = "SELECT * FROM file_metadata WHERE id = ?";
    return this.queryAndParseFileMetadata(sql, [id]);
  }

  async getFilesByUser(username: string): Promise<ParsedFileMetadata[]> {
    const sql = `
      SELECT * FROM file_metadata 
      WHERE username = ? 
      ORDER BY created_at DESC
    `;
    return this.queryAndParseMultipleFileMetadata(sql, [username]);
  }

  async getFilesByStatus(
    username: string,
    status: string
  ): Promise<ParsedFileMetadata[]> {
    const sql = `
      SELECT * FROM file_metadata 
      WHERE username = ? AND status = ?
      ORDER BY created_at DESC
    `;
    return this.queryAndParseMultipleFileMetadata(sql, [username, status]);
  }

  /**
   * Get all files stuck in processing status across all users
   * Used for scheduled cleanup of stuck files
   */
  async getStuckProcessingFiles(
    timeoutMinutes: number = 1
  ): Promise<ParsedFileMetadata[]> {
    const timeoutDate = new Date(Date.now() - timeoutMinutes * 60 * 1000);
    const sql = `
      SELECT * FROM file_metadata 
      WHERE status IN (?, ?, ?, ?) AND updated_at < ?
      ORDER BY updated_at ASC
    `;
    return this.queryAndParseMultipleFileMetadata(sql, [
      FileDAO.STATUS.PROCESSING,
      FileDAO.STATUS.SYNCING,
      FileDAO.STATUS.INDEXING,
      FileDAO.STATUS.UPLOADED,
      timeoutDate.toISOString(),
    ]);
  }

  async updateFileMetadata(
    fileKey: string,
    updates: Partial<
      Pick<
        FileMetadata,
        "display_name" | "description" | "tags" | "vector_id" | "chunk_count"
      >
    >
  ): Promise<void> {
    const setClause = Object.keys(updates)
      .map((key) => {
        // Map display_name to display_name column
        const columnName = key === "display_name" ? "display_name" : key;
        return `${columnName} = ?`;
      })
      .join(", ");

    const sql = `
      UPDATE file_metadata 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE file_key = ?
    `;

    const values = [...Object.values(updates), fileKey];
    await this.execute(sql, values);
  }

  async getFileIdByKeyAndUser(
    fileKey: string,
    username: string
  ): Promise<any | null> {
    const sql =
      "SELECT id FROM file_metadata WHERE file_key = ? AND username = ?";
    return await this.queryFirst(sql, [fileKey, username]);
  }

  async updateFileForProcessing(
    fileKey: string,
    username: string,
    file_name: string,
    description: string,
    tags: string,
    fileSize: number
  ): Promise<void> {
    const sql = `
      UPDATE file_metadata 
      SET file_name = ?, description = ?, tags = ?, status = ?, file_size = ? 
      WHERE file_key = ? AND username = ?
    `;
    await this.execute(sql, [
      file_name,
      description,
      tags,
      "processing",
      fileSize,
      fileKey,
      username,
    ]);
  }

  async insertFileForProcessing(
    fileKey: string,
    file_name: string,
    description: string,
    tags: string,
    username: string,
    fileSize: number
  ): Promise<void> {
    const sql = `
      INSERT OR REPLACE INTO file_metadata (file_key, file_name, description, tags, username, status, file_size)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    await this.execute(sql, [
      fileKey,
      file_name,
      description,
      tags,
      username,
      "processing",
      fileSize,
    ]);
  }

  async updateFileStatusByKey(fileKey: string, status: string): Promise<void> {
    const sql = `
      UPDATE file_metadata 
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE file_key = ?
    `;
    await this.execute(sql, [status, fileKey]);
  }

  /**
   * Mark a file as failed due to timeout
   */
  async markFileAsTimeoutFailed(
    fileKey: string,
    reason: string = "Processing timeout"
  ): Promise<void> {
    const sql = `
      UPDATE file_metadata 
      SET status = ?, analysis_error = ?, updated_at = CURRENT_TIMESTAMP
      WHERE file_key = ?
    `;
    await this.execute(sql, [FileDAO.STATUS.ERROR, reason, fileKey]);
  }

  async updateFileStatus(
    fileKey: string,
    username: string,
    status: string
  ): Promise<void> {
    const sql = `
      UPDATE file_metadata
      SET status = ?
      WHERE file_key = ? AND username = ?
    `;
    await this.execute(sql, [status, fileKey, username]);
  }

  /**
   * Check if a file is indexed by attempting a search with LibraryRAGService
   */
  async checkFileIndexingStatus(
    fileKey: string,
    username: string,
    env: any
  ): Promise<{ isIndexed: boolean; error?: string }> {
    try {
      // Extract filename from fileKey for search
      const filename = fileKey.split("/").pop() || "";

      // Use LibraryRAGService to check if file is indexed
      const ragService = new LibraryRAGService(env);

      // Check if file exists by searching for it
      const searchQuery = `Find the file named "${filename}"`;
      const searchResult = await ragService.searchContent(
        username,
        searchQuery,
        1
      );

      console.log(
        `[FileDAO] LibraryRAGService search result for ${filename}:`,
        JSON.stringify(searchResult, null, 2)
      );

      // Check if we have results (file is indexed)
      const hasResults = Array.isArray(searchResult) && searchResult.length > 0;

      console.log(`[FileDAO] Parsed response for ${filename}:`, {
        hasResults,
        resultCount: Array.isArray(searchResult) ? searchResult.length : 0,
      });

      return { isIndexed: hasResults };
    } catch (error) {
      console.error(`Error checking indexing status for ${fileKey}:`, error);
      return {
        isIndexed: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async getFilesPendingIndexing(
    username: string
  ): Promise<ParsedFileMetadata[]> {
    const sql = `
      SELECT file_key, file_name, description, tags, username, status, file_size, created_at, updated_at
      FROM file_metadata
      WHERE username = ? AND status IN ('uploaded', 'processing')
      ORDER BY created_at DESC
    `;
    return this.queryAndParseMultipleFileMetadata(sql, [username]);
  }

  async getFileStatsByUser(username: string): Promise<any[]> {
    const sql = `
      SELECT status, COUNT(*) as count 
      FROM file_metadata 
      WHERE username = ? 
      GROUP BY status
    `;
    return await this.queryAll(sql, [username]);
  }

  async getFileSizeStatsByUser(username: string): Promise<any> {
    const sql = `
      SELECT SUM(file_size) as total_size, AVG(file_size) as avg_size, COUNT(*) as total_files 
      FROM file_metadata 
      WHERE username = ? AND file_size > 0
    `;
    return await this.queryFirst(sql, [username]);
  }

  async getFileStatusInfo(
    fileKey: string,
    username: string
  ): Promise<any | null> {
    const sql = `
      SELECT status, created_at, updated_at, file_size 
      FROM file_metadata 
      WHERE file_key = ? AND username = ?
    `;
    return await this.queryFirst(sql, [fileKey, username]);
  }

  async updateFileDescriptionAndTags(
    fileKey: string,
    username: string,
    description: string,
    tags: string
  ): Promise<void> {
    const sql = `
      UPDATE file_metadata 
      SET description = ?, tags = ? 
      WHERE file_key = ? AND username = ?
    `;
    await this.execute(sql, [description, tags, fileKey, username]);
  }

  // NOTE: Current implementation deletes file from global RAG index.
  // Future enhancement: When files can be associated with multiple campaigns
  // (each with their own RAG instance), we should also delete the file from
  // all associated campaign RAGs. This requires tracking campaign-file associations.
  async deleteFile(
    fileKey: string,
    r2Bucket?: R2Bucket,
    vectorizeIndex?: VectorizeIndex
  ): Promise<void> {
    // Get file metadata before deletion for cleanup operations
    const metadata = await this.getFileMetadata(fileKey);

    // Delete from database first
    await this.transaction([
      () =>
        this.execute("DELETE FROM file_chunks WHERE file_key = ?", [fileKey]),
      () =>
        this.execute("DELETE FROM file_metadata WHERE file_key = ?", [fileKey]),
    ]);

    // Delete from R2 storage if bucket is provided
    if (r2Bucket && metadata) {
      try {
        await r2Bucket.delete(fileKey);
        console.log(`[FileDAO] Deleted file from R2: ${fileKey}`);
      } catch (error) {
        console.warn(
          `[FileDAO] Failed to delete file from R2: ${fileKey}`,
          error
        );
      }
    }

    // Delete from vector index if provided and metadata has vector_id
    if (vectorizeIndex && metadata?.vector_id) {
      try {
        await vectorizeIndex.deleteByIds([metadata.vector_id]);
        console.log(`[FileDAO] Deleted vector embeddings for: ${fileKey}`);
      } catch (error) {
        console.warn(
          `[FileDAO] Failed to delete vector embeddings for: ${fileKey}`,
          error
        );
      }
    }
  }

  async getFileChunks(fileKey: string): Promise<PDFChunk[]> {
    const sql = `
      SELECT id, file_key, username, chunk_index, chunk_text, embedding_id, metadata, created_at
      FROM file_chunks 
      WHERE file_key = ? 
      ORDER BY chunk_index
    `;
    return await this.queryAll<PDFChunk>(sql, [fileKey]);
  }

  async getFileWithChunks(fileKey: string): Promise<FileWithChunks | null> {
    const metadata = await this.getFileMetadata(fileKey);
    if (!metadata) return null;

    const chunks = await this.getFileChunks(fileKey);
    return {
      ...metadata,
      chunks,
    };
  }

  async insertFileChunks(
    chunks: Array<{
      fileKey: string;
      chunkIndex: number;
      content: string;
      embedding?: string;
    }>
  ): Promise<void> {
    const sql = `
      INSERT INTO file_chunks (id, file_key, username, chunk_text, chunk_index, embedding_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    await Promise.all(
      chunks.map((chunk) =>
        this.execute(sql, [
          `${chunk.fileKey}-chunk-${chunk.chunkIndex}`,
          chunk.fileKey,
          chunk.fileKey.split("/")[1] || "", // Extract username from fileKey (library/username/...)
          chunk.content,
          chunk.chunkIndex,
          chunk.embedding || null,
        ])
      )
    );
  }

  async searchFiles(
    query: string,
    username?: string
  ): Promise<ParsedFileMetadata[]> {
    let sql = `
      SELECT DISTINCT fm.* 
      FROM file_metadata fm
      JOIN file_metadata_fts fts ON fm.id = fts.id
      WHERE file_metadata_fts MATCH ?
    `;

    const params = [query];

    if (username) {
      sql += " AND fm.username = ?";
      params.push(username);
    }

    sql += " ORDER BY fm.created_at DESC";

    return this.queryAndParseMultipleFileMetadata(sql, params);
  }

  async getFileCount(username: string): Promise<number> {
    const sql =
      "SELECT COUNT(*) as count FROM file_metadata WHERE username = ?";
    const result = await this.queryFirst<{ count: number }>(sql, [username]);
    return result?.count || 0;
  }

  async getTotalStorageUsage(username: string): Promise<number> {
    const sql =
      "SELECT COALESCE(SUM(file_size), 0) as total FROM file_metadata WHERE username = ?";
    const result = await this.queryFirst<{ total: number }>(sql, [username]);
    return result?.total || 0;
  }

  async fileExists(fileKey: string): Promise<boolean> {
    const sql = "SELECT 1 FROM file_metadata WHERE file_key = ?";
    const result = await this.queryFirst<{ 1: number }>(sql, [fileKey]);
    return result !== null;
  }

  async getFilesByType(
    username: string,
    contentType: string
  ): Promise<ParsedFileMetadata[]> {
    const sql = `
      SELECT * FROM file_metadata 
      WHERE username = ? AND content_type = ?
      ORDER BY created_at DESC
    `;
    return this.queryAndParseMultipleFileMetadata(sql, [username, contentType]);
  }

  async getRecentFiles(
    username: string,
    limit: number = 10
  ): Promise<ParsedFileMetadata[]> {
    const sql = `
      SELECT * FROM file_metadata 
      WHERE username = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `;
    return this.queryAndParseMultipleFileMetadata(sql, [username, limit]);
  }

  // Methods for the 'files' table (used by RAG functionality)

  async createFileRecord(
    _id: string,
    fileKey: string,
    fileName: string,
    description: string,
    tags: string,
    username: string,
    status: string,
    fileSize: number
  ): Promise<void> {
    const sql = `
      INSERT OR REPLACE INTO file_metadata (file_key, file_name, description, tags, username, status, file_size)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    await this.execute(sql, [
      fileKey,
      fileName,
      description,
      tags,
      username,
      status,
      fileSize,
    ]);
  }

  async updateFileRecord(
    fileKey: string,
    status: string,
    fileSize?: number
  ): Promise<void> {
    let sql: string;
    let params: any[];

    if (fileSize !== undefined) {
      sql = `
        UPDATE file_metadata 
        SET status = ?, file_size = ?, updated_at = CURRENT_TIMESTAMP
        WHERE file_key = ?
      `;
      params = [status, fileSize, fileKey];
    } else {
      sql = `
        UPDATE file_metadata 
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE file_key = ?
      `;
      params = [status, fileKey];
    }

    await this.execute(sql, params);
  }

  async updateFileMetadataForRag(
    fileKey: string,
    username: string,
    description: string,
    tags: string,
    displayName?: string
  ): Promise<void> {
    if (displayName !== undefined) {
      const sql = `
        UPDATE file_metadata 
        SET description = ?, tags = ?, display_name = ? 
        WHERE file_key = ? AND username = ?
      `;
      await this.execute(sql, [
        description,
        tags,
        displayName,
        fileKey,
        username,
      ]);
    } else {
      const sql = `
        UPDATE file_metadata 
        SET description = ?, tags = ? 
        WHERE file_key = ? AND username = ?
      `;
      await this.execute(sql, [description, tags, fileKey, username]);
    }
  }

  async getFilesForRag(username: string): Promise<any[]> {
    const sql = `
      SELECT file_key, file_name, display_name, description, tags, status, created_at, file_size 
      FROM file_metadata 
      WHERE username = ? 
      ORDER BY created_at DESC
    `;
    return await this.queryAll(sql, [username]);
  }

  async getFileForRag(fileKey: string, username: string): Promise<any | null> {
    const sql = `
      SELECT * FROM file_metadata 
      WHERE file_key = ? AND username = ?
    `;
    return await this.queryFirst(sql, [fileKey, username]);
  }

  async getFileChunksForRag(fileKey: string, username: string): Promise<any[]> {
    const sql = `
      SELECT id, file_key, chunk_text, chunk_index, created_at 
      FROM file_chunks 
      WHERE file_key = ? AND username = ? 
      ORDER BY chunk_index
    `;
    return await this.queryAll(sql, [fileKey, username]);
  }

  async getFileStatsForRag(username: string): Promise<any> {
    const sql = `
      SELECT * FROM file_metadata 
      WHERE username = ? 
      ORDER BY created_at DESC
    `;
    const files = await this.queryAll(sql, [username]);

    const uploaded = files.filter((f: any) => f.status === "uploaded").length;
    const processed = files.filter((f: any) => f.status === "processed").length;
    const processing = files.filter(
      (f: any) => f.status === "processing"
    ).length;
    const error = files.filter((f: any) => f.status === "error").length;

    return {
      uploaded,
      processed,
      processing,
      error,
      total: files.length,
    };
  }

  async getAllFilesForStorageUsage(): Promise<any[]> {
    const sql = `
      SELECT username, file_size, status 
      FROM file_metadata 
      ORDER BY created_at DESC
    `;
    return await this.queryAll(sql, []);
  }

  async deleteFileForUser(fileKey: string, username: string): Promise<void> {
    // Delete all related data in a transaction
    await this.transaction([
      () =>
        this.execute(
          "DELETE FROM file_chunks WHERE file_key = ? AND username = ?",
          [fileKey, username]
        ),
      () =>
        this.execute("DELETE FROM campaign_resources WHERE file_key = ?", [
          fileKey,
        ]),
      () =>
        this.execute(
          "DELETE FROM file_metadata WHERE file_key = ? AND username = ?",
          [fileKey, username]
        ),
    ]);
  }

  async deleteAllFilesForUser(username: string): Promise<void> {
    // Delete all files and related data for a user
    await this.transaction([
      () =>
        this.execute("DELETE FROM file_chunks WHERE username = ?", [username]),
      () =>
        this.execute(
          "DELETE FROM campaign_resources WHERE file_key IN (SELECT file_key FROM file_metadata WHERE username = ?)",
          [username]
        ),
      () =>
        this.execute("DELETE FROM file_metadata WHERE username = ?", [
          username,
        ]),
    ]);
  }

  async updateFileMetadataForUser(
    fileKey: string,
    username: string,
    description?: string,
    tags?: string[]
  ): Promise<void> {
    const sql = `
      UPDATE file_metadata 
      SET description = ?, tags = ?
      WHERE file_key = ? AND username = ?
    `;

    await this.execute(sql, [
      description || "",
      tags ? JSON.stringify(tags) : "[]",
      fileKey,
      username,
    ]);
  }

  /**
   * Update enhanced metadata from file analysis
   */
  async updateEnhancedMetadata(
    fileKey: string,
    username: string,
    enhancedMetadata: {
      content_summary?: string;
      key_topics?: string[];
      content_type_categories?: string[];
      difficulty_level?: string;
      target_audience?: string;
      campaign_themes?: string[];
      recommended_campaign_types?: string[];
      content_quality_score?: number;
      analysis_status?: string;
      analysis_error?: string;
    }
  ): Promise<void> {
    const updates: string[] = [];
    const values: any[] = [];

    // Build dynamic update query
    if (enhancedMetadata.content_summary !== undefined) {
      updates.push("content_summary = ?");
      values.push(enhancedMetadata.content_summary);
    }
    if (enhancedMetadata.key_topics !== undefined) {
      updates.push("key_topics = ?");
      values.push(JSON.stringify(enhancedMetadata.key_topics));
    }
    if (enhancedMetadata.content_type_categories !== undefined) {
      updates.push("content_type_categories = ?");
      values.push(JSON.stringify(enhancedMetadata.content_type_categories));
    }
    if (enhancedMetadata.difficulty_level !== undefined) {
      updates.push("difficulty_level = ?");
      values.push(enhancedMetadata.difficulty_level);
    }
    if (enhancedMetadata.target_audience !== undefined) {
      updates.push("target_audience = ?");
      values.push(enhancedMetadata.target_audience);
    }
    if (enhancedMetadata.campaign_themes !== undefined) {
      updates.push("campaign_themes = ?");
      values.push(JSON.stringify(enhancedMetadata.campaign_themes));
    }
    if (enhancedMetadata.recommended_campaign_types !== undefined) {
      updates.push("recommended_campaign_types = ?");
      values.push(JSON.stringify(enhancedMetadata.recommended_campaign_types));
    }
    if (enhancedMetadata.content_quality_score !== undefined) {
      updates.push("content_quality_score = ?");
      values.push(enhancedMetadata.content_quality_score);
    }
    if (enhancedMetadata.analysis_status !== undefined) {
      updates.push("analysis_status = ?");
      values.push(enhancedMetadata.analysis_status);
    }
    if (enhancedMetadata.analysis_error !== undefined) {
      updates.push("analysis_error = ?");
      values.push(enhancedMetadata.analysis_error);
    }

    // Always update last_analyzed_at and analysis_status
    updates.push("last_analyzed_at = CURRENT_TIMESTAMP");

    if (updates.length === 0) return;

    const sql = `
      UPDATE file_metadata 
      SET ${updates.join(", ")}
      WHERE file_key = ? AND username = ?
    `;

    await this.execute(sql, [...values, fileKey, username]);
  }

  /**
   * Get files with enhanced metadata for recommendations
   */
  async getFilesForRecommendations(
    username: string,
    filters?: {
      content_type_categories?: string;
      difficulty_level?: string;
      target_audience?: string;
      campaign_themes?: string[];
      min_quality_score?: number;
      limit?: number;
    }
  ): Promise<ParsedFileMetadata[]> {
    let sql = `
      SELECT * FROM file_metadata 
      WHERE username = ? AND analysis_status = 'completed'
    `;
    const values: any[] = [username];

    if (filters?.content_type_categories) {
      sql += " AND content_type_categories LIKE ?";
      values.push(`%${filters.content_type_categories}%`);
    }
    if (filters?.difficulty_level) {
      sql += " AND difficulty_level = ?";
      values.push(filters.difficulty_level);
    }
    if (filters?.target_audience) {
      sql += " AND target_audience = ?";
      values.push(filters.target_audience);
    }
    if (filters?.min_quality_score) {
      sql += " AND content_quality_score >= ?";
      values.push(filters.min_quality_score);
    }

    sql += " ORDER BY content_quality_score DESC, created_at DESC";

    if (filters?.limit) {
      sql += " LIMIT ?";
      values.push(filters.limit);
    }

    const files = await this.queryAll(sql, values);

    // Parse tags and filter by campaign themes if specified
    let parsedFiles = files.map((file: any) => ({
      ...file,
      tags: this.parseTags(file.tags || null, file.file_key),
      campaign_themes: file.campaign_themes
        ? JSON.parse(file.campaign_themes)
        : [],
      recommended_campaign_types: file.recommended_campaign_types
        ? JSON.parse(file.recommended_campaign_types)
        : [],
      key_topics: file.key_topics ? JSON.parse(file.key_topics) : [],
      content_type_categories: file.content_type_categories
        ? JSON.parse(file.content_type_categories)
        : [],
    }));

    // Filter by campaign themes if specified
    if (filters?.campaign_themes && filters.campaign_themes.length > 0) {
      parsedFiles = parsedFiles.filter((file: any) => {
        const fileThemes = file.campaign_themes || [];
        return filters.campaign_themes!.some((theme) =>
          fileThemes.includes(theme)
        );
      });
    }

    return parsedFiles;
  }

  /**
   * Get analysis status for a file
   */
  async getAnalysisStatus(
    fileKey: string,
    username: string
  ): Promise<{
    analysis_status: string;
    last_analyzed_at?: string;
    analysis_error?: string;
  } | null> {
    const sql = `
      SELECT analysis_status, last_analyzed_at, analysis_error
      FROM file_metadata 
      WHERE file_key = ? AND username = ?
    `;

    return await this.queryFirst(sql, [fileKey, username]);
  }

  /**
   * Get files pending analysis
   */
  async getFilesPendingAnalysis(
    username: string
  ): Promise<ParsedFileMetadata[]> {
    const sql = `
      SELECT * FROM file_metadata 
      WHERE username = ? AND (analysis_status IS NULL OR analysis_status = 'pending')
      ORDER BY created_at DESC
    `;

    return this.queryAndParseMultipleFileMetadata(sql, [username]);
  }

  /**
   * Add a file to the sync queue
   */
  async addToSyncQueue(
    username: string,
    fileKey: string,
    fileName: string,
    ragId: string
  ): Promise<void> {
    const sql = `
      INSERT INTO sync_queue (username, file_key, file_name, rag_id, status, created_at)
      VALUES (?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
    `;
    await this.execute(sql, [username, fileKey, fileName, ragId]);
  }

  /**
   * Get pending sync queue items for a user
   */
  async getSyncQueue(username: string): Promise<any[]> {
    const sql = `
      SELECT * FROM sync_queue 
      WHERE username = ? AND status = 'pending'
      ORDER BY created_at ASC
    `;
    return await this.queryAll(sql, [username]);
  }

  /**
   * Remove an item from the sync queue
   */
  async removeFromSyncQueue(fileKey: string): Promise<void> {
    const sql = `
      DELETE FROM sync_queue WHERE file_key = ?
    `;
    await this.execute(sql, [fileKey]);
  }

  /**
   * Update retry count for a sync queue item
   */
  async updateSyncQueueRetryCount(
    fileKey: string,
    retryCount: number
  ): Promise<void> {
    const sql = `
      UPDATE sync_queue 
      SET retry_count = ?, updated_at = datetime('now')
      WHERE file_key = ?
    `;
    await this.execute(sql, [retryCount, fileKey]);
  }

  /**
   * Get all unique usernames that have pending queue items
   */
  async getUsernamesWithPendingQueueItems(): Promise<string[]> {
    const sql = `
      SELECT DISTINCT username 
      FROM sync_queue 
      WHERE status = 'pending'
    `;
    const results = await this.queryAll(sql, []);
    return results.map((row: any) => row.username);
  }

  /**
   * Create a file processing chunk
   */
  async createFileProcessingChunk(chunk: {
    id: string;
    fileKey: string;
    username: string;
    chunkIndex: number;
    totalChunks: number;
    pageRangeStart?: number;
    pageRangeEnd?: number;
    byteRangeStart?: number;
    byteRangeEnd?: number;
  }): Promise<void> {
    const sql = `
      INSERT INTO file_processing_chunks (
        id, file_key, username, chunk_index, total_chunks,
        page_range_start, page_range_end, byte_range_start, byte_range_end,
        status, retry_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, datetime('now'), datetime('now'))
    `;
    await this.execute(sql, [
      chunk.id,
      chunk.fileKey,
      chunk.username,
      chunk.chunkIndex,
      chunk.totalChunks,
      chunk.pageRangeStart || null,
      chunk.pageRangeEnd || null,
      chunk.byteRangeStart || null,
      chunk.byteRangeEnd || null,
    ]);
  }

  /**
   * Get all processing chunks for a file
   */
  async getFileProcessingChunks(fileKey: string): Promise<
    Array<{
      id: string;
      fileKey: string;
      username: string;
      chunkIndex: number;
      totalChunks: number;
      pageRangeStart?: number;
      pageRangeEnd?: number;
      byteRangeStart?: number;
      byteRangeEnd?: number;
      status: string;
      vectorId?: string;
      errorMessage?: string;
      retryCount: number;
      createdAt: string;
      processedAt?: string;
      updatedAt?: string;
    }>
  > {
    const sql = `
      SELECT * FROM file_processing_chunks
      WHERE file_key = ?
      ORDER BY chunk_index ASC
    `;
    const rows = await this.queryAll(sql, [fileKey]);
    return rows.map((row: any) => ({
      id: row.id,
      fileKey: row.file_key,
      username: row.username,
      chunkIndex: row.chunk_index,
      totalChunks: row.total_chunks,
      pageRangeStart: row.page_range_start ?? undefined,
      pageRangeEnd: row.page_range_end ?? undefined,
      byteRangeStart: row.byte_range_start ?? undefined,
      byteRangeEnd: row.byte_range_end ?? undefined,
      status: row.status,
      vectorId: row.vector_id ?? undefined,
      errorMessage: row.error_message ?? undefined,
      retryCount: row.retry_count,
      createdAt: row.created_at,
      processedAt: row.processed_at ?? undefined,
      updatedAt: row.updated_at ?? undefined,
    }));
  }

  /**
   * Update a file processing chunk
   */
  async updateFileProcessingChunk(
    chunkId: string,
    updates: {
      status?: string;
      vectorId?: string;
      errorMessage?: string;
      retryCount?: number;
    }
  ): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) {
      fields.push("status = ?");
      values.push(updates.status);
    }
    if (updates.vectorId !== undefined) {
      fields.push("vector_id = ?");
      values.push(updates.vectorId);
    }
    if (updates.errorMessage !== undefined) {
      fields.push("error_message = ?");
      values.push(updates.errorMessage);
    }
    if (updates.retryCount !== undefined) {
      fields.push("retry_count = ?");
      values.push(updates.retryCount);
    }

    if (fields.length === 0) {
      return;
    }

    fields.push("updated_at = datetime('now')");
    values.push(chunkId);

    const sql = `UPDATE file_processing_chunks SET ${fields.join(", ")} WHERE id = ?`;
    await this.execute(sql, values);
  }

  /**
   * Mark a file processing chunk as completed
   */
  async markFileChunkComplete(
    chunkId: string,
    vectorId: string
  ): Promise<void> {
    const sql = `
      UPDATE file_processing_chunks
      SET status = 'completed', vector_id = ?, processed_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `;
    await this.execute(sql, [vectorId, chunkId]);
  }

  /**
   * Get pending file chunks for processing
   */
  async getPendingFileChunks(username?: string): Promise<
    Array<{
      id: string;
      fileKey: string;
      username: string;
      chunkIndex: number;
      totalChunks: number;
      pageRangeStart?: number;
      pageRangeEnd?: number;
      byteRangeStart?: number;
      byteRangeEnd?: number;
      retryCount: number;
    }>
  > {
    let sql = `
      SELECT * FROM file_processing_chunks
      WHERE status = 'pending'
    `;
    const params: any[] = [];

    if (username) {
      sql += " AND username = ?";
      params.push(username);
    }

    sql += " ORDER BY created_at ASC";

    const rows = await this.queryAll(sql, params);
    return rows.map((row: any) => ({
      id: row.id,
      fileKey: row.file_key,
      username: row.username,
      chunkIndex: row.chunk_index,
      totalChunks: row.total_chunks,
      pageRangeStart: row.page_range_start ?? undefined,
      pageRangeEnd: row.page_range_end ?? undefined,
      byteRangeStart: row.byte_range_start ?? undefined,
      byteRangeEnd: row.byte_range_end ?? undefined,
      retryCount: row.retry_count,
    }));
  }

  /**
   * Get chunk completion statistics for a file
   */
  async getFileChunkStats(fileKey: string): Promise<{
    total: number;
    completed: number;
    failed: number;
    pending: number;
    processing: number;
  }> {
    const sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing
      FROM file_processing_chunks
      WHERE file_key = ?
    `;
    const result = await this.queryFirst(sql, [fileKey]);
    return {
      total: result?.total || 0,
      completed: result?.completed || 0,
      failed: result?.failed || 0,
      pending: result?.pending || 0,
      processing: result?.processing || 0,
    };
  }

  /**
   * Delete all chunks for a file (cleanup)
   */
  async deleteFileProcessingChunks(fileKey: string): Promise<void> {
    const sql = `DELETE FROM file_processing_chunks WHERE file_key = ?`;
    await this.execute(sql, [fileKey]);
  }
}
