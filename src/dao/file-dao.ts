import type { R2Bucket, VectorizeIndex } from "@cloudflare/workers-types";
import { BaseDAOClass } from "./base-dao";

export interface FileMetadata {
  id: string;
  file_key: string;
  filename: string;
  username: string;
  file_size: number;
  content_type: string;
  description?: string;
  tags?: string;
  vector_id?: string;
  chunk_count?: number;
  created_at: string;
  updated_at: string;
  // Enhanced metadata fields for AutoRAG analysis
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
  chunk_index: number;
  content: string;
  embedding?: string;
  created_at: string;
}

export interface FileWithChunks extends ParsedFileMetadata {
  chunks: PDFChunk[];
}

export class FileDAO extends BaseDAOClass {
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
    filename: string,
    username: string,
    fileSize: number,
    contentType: string,
    description?: string,
    tags?: string
  ): Promise<void> {
    const sql = `
      INSERT OR REPLACE INTO file_metadata (
        id, file_key, filename, username, file_size, content_type,
        description, tags, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    await this.execute(sql, [
      id,
      fileKey,
      filename,
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

  async updateFileMetadata(
    fileKey: string,
    updates: Partial<
      Pick<FileMetadata, "description" | "tags" | "vector_id" | "chunk_count">
    >
  ): Promise<void> {
    const setClause = Object.keys(updates)
      .map((key) => `${key} = ?`)
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
    filename: string,
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
      filename,
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
    filename: string,
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
      filename,
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
      SET status = ? 
      WHERE file_key = ?
    `;
    await this.execute(sql, [status, fileKey]);
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

  async updateFileAutoRAGStatus(
    fileKey: string,
    username: string,
    autoragStatus: string,
    _autoragMessage?: string
  ): Promise<void> {
    const sql = `
      UPDATE file_metadata
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE file_key = ? AND username = ?
    `;
    await this.execute(sql, [autoragStatus, fileKey, username]);
  }

  async getFilesPendingAutoRAG(
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

  //TODO: once files are better associated with multiple campaigns (each with their own RAG), we should delete the file from the RAGs as well
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
        this.execute("DELETE FROM autorag_chunks WHERE file_key = ?", [
          fileKey,
        ]),
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
      SELECT * FROM autorag_chunks 
      WHERE file_key = ? 
      ORDER BY part_number
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
      INSERT INTO autorag_chunks (id, file_key, username, chunk_key, part_number, chunk_size, original_filename, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    await Promise.all(
      chunks.map((chunk) =>
        this.execute(sql, [
          `${chunk.fileKey}-chunk-${chunk.chunkIndex}`,
          chunk.fileKey,
          chunk.fileKey.split("/")[0], // Extract username from fileKey
          `${chunk.fileKey}-chunk-${chunk.chunkIndex}`,
          chunk.chunkIndex,
          chunk.content.length,
          chunk.fileKey.split("/").pop() || "unknown",
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
        SET status = ?, file_size = ? 
        WHERE file_key = ?
      `;
      params = [status, fileSize, fileKey];
    } else {
      sql = `
        UPDATE file_metadata 
        SET status = ? 
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
    tags: string
  ): Promise<void> {
    const sql = `
      UPDATE file_metadata 
      SET description = ?, tags = ? 
      WHERE file_key = ? AND username = ?
    `;
    await this.execute(sql, [description, tags, fileKey, username]);
  }

  async getFilesForRag(username: string): Promise<any[]> {
    const sql = `
      SELECT file_key, file_name, description, tags, status, created_at, file_size 
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
      SELECT id, file_key, chunk_key, part_number, created_at 
      FROM autorag_chunks 
      WHERE file_key = ? AND username = ? 
      ORDER BY part_number
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
          "DELETE FROM autorag_chunks WHERE file_key = ? AND username = ?",
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
        this.execute("DELETE FROM autorag_chunks WHERE username = ?", [
          username,
        ]),
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
   * Update enhanced metadata from AutoRAG analysis
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
}
