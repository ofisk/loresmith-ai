import { BaseDAOClass } from "./base-dao";
import type { R2Bucket, VectorizeIndex } from "@cloudflare/workers-types";

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
}

export interface PDFChunk {
  id: string;
  file_key: string;
  chunk_index: number;
  content: string;
  embedding?: string;
  created_at: string;
}

export interface FileWithChunks extends FileMetadata {
  chunks: PDFChunk[];
}

export class FileDAO extends BaseDAOClass {
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
      INSERT INTO file_metadata (
        id, file_key, filename, username, file_size, content_type, 
        description, tags, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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

  async getFileMetadata(fileKey: string): Promise<FileMetadata | null> {
    const sql = "SELECT * FROM file_metadata WHERE file_key = ?";
    return await this.queryFirst<FileMetadata>(sql, [fileKey]);
  }

  async getFileMetadataById(id: string): Promise<FileMetadata | null> {
    const sql = "SELECT * FROM file_metadata WHERE id = ?";
    return await this.queryFirst<FileMetadata>(sql, [id]);
  }

  async getFilesByUser(username: string): Promise<FileMetadata[]> {
    const sql = `
      SELECT * FROM file_metadata 
      WHERE username = ? 
      ORDER BY created_at DESC
    `;
    return await this.queryAll<FileMetadata>(sql, [username]);
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
        this.execute("DELETE FROM pdf_chunks WHERE file_key = ?", [fileKey]),
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

  async getPDFChunks(fileKey: string): Promise<PDFChunk[]> {
    const sql = `
      SELECT * FROM pdf_chunks 
      WHERE file_key = ? 
      ORDER BY chunk_index
    `;
    return await this.queryAll<PDFChunk>(sql, [fileKey]);
  }

  async getFileWithChunks(fileKey: string): Promise<FileWithChunks | null> {
    const metadata = await this.getFileMetadata(fileKey);
    if (!metadata) return null;

    const chunks = await this.getPDFChunks(fileKey);
    return {
      ...metadata,
      chunks,
    };
  }

  async insertPDFChunks(
    chunks: Array<{
      fileKey: string;
      chunkIndex: number;
      content: string;
      embedding?: string;
    }>
  ): Promise<void> {
    const sql = `
      INSERT INTO pdf_chunks (file_key, chunk_index, content, embedding, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    await Promise.all(
      chunks.map((chunk) =>
        this.execute(sql, [
          chunk.fileKey,
          chunk.chunkIndex,
          chunk.content,
          chunk.embedding,
        ])
      )
    );
  }

  async updateChunkEmbeddings(
    fileKey: string,
    chunkEmbeddings: Array<{ chunkIndex: number; embedding: string }>
  ): Promise<void> {
    const sql = `
      UPDATE pdf_chunks 
      SET embedding = ? 
      WHERE file_key = ? AND chunk_index = ?
    `;

    await Promise.all(
      chunkEmbeddings.map(({ chunkIndex, embedding }) =>
        this.execute(sql, [embedding, fileKey, chunkIndex])
      )
    );
  }

  async searchFiles(query: string, username?: string): Promise<FileMetadata[]> {
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

    return await this.queryAll<FileMetadata>(sql, params);
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
  ): Promise<FileMetadata[]> {
    const sql = `
      SELECT * FROM file_metadata 
      WHERE username = ? AND content_type = ?
      ORDER BY created_at DESC
    `;
    return await this.queryAll<FileMetadata>(sql, [username, contentType]);
  }

  async getRecentFiles(
    username: string,
    limit: number = 10
  ): Promise<FileMetadata[]> {
    const sql = `
      SELECT * FROM file_metadata 
      WHERE username = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `;
    return await this.queryAll<FileMetadata>(sql, [username, limit]);
  }
}
