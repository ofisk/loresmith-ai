import { D1Database } from "@cloudflare/workers-types";

export interface AutoRAGChunk {
  id: string;
  fileKey: string;
  username: string;
  chunkKey: string;
  partNumber: number;
  chunkSize: number;
  originalFilename: string;
  createdAt: string;
}

export class AutoRAGChunksDAO {
  constructor(private db: D1Database) {}

  /**
   * Insert a new AutoRAG chunk record
   */
  async insertChunk(chunk: Omit<AutoRAGChunk, "createdAt">): Promise<void> {
    await this.db
      .prepare(
        `
        INSERT INTO autorag_chunks (id, file_key, username, chunk_key, part_number, chunk_size, original_filename)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      )
      .bind(
        chunk.id,
        chunk.fileKey,
        chunk.username,
        chunk.chunkKey,
        chunk.partNumber,
        chunk.chunkSize,
        chunk.originalFilename
      )
      .run();
  }

  /**
   * Get all chunks for a specific file
   */
  async getChunksByFile(
    fileKey: string,
    username: string
  ): Promise<AutoRAGChunk[]> {
    const result = await this.db
      .prepare(
        `
        SELECT id, file_key as fileKey, username, chunk_key as chunkKey, 
               part_number as partNumber, chunk_size as chunkSize, 
               original_filename as originalFilename, created_at as createdAt
        FROM autorag_chunks 
        WHERE file_key = ? AND username = ?
        ORDER BY part_number
      `
      )
      .bind(fileKey, username)
      .all<AutoRAGChunk>();

    return result.results;
  }

  /**
   * Get a specific chunk by ID
   */
  async getChunkById(id: string): Promise<AutoRAGChunk | null> {
    const result = await this.db
      .prepare(
        `
        SELECT id, file_key as fileKey, username, chunk_key as chunkKey, 
               part_number as partNumber, chunk_size as chunkSize, 
               original_filename as originalFilename, created_at as createdAt
        FROM autorag_chunks 
        WHERE id = ?
      `
      )
      .bind(id)
      .first<AutoRAGChunk>();

    return result || null;
  }

  /**
   * Delete all chunks for a specific file
   */
  async deleteChunksByFile(fileKey: string, username: string): Promise<void> {
    await this.db
      .prepare(
        `
        DELETE FROM autorag_chunks 
        WHERE file_key = ? AND username = ?
      `
      )
      .bind(fileKey, username)
      .run();
  }

  /**
   * Get chunk count for a file
   */
  async getChunkCount(fileKey: string, username: string): Promise<number> {
    const result = await this.db
      .prepare(
        `
        SELECT COUNT(*) as count
        FROM autorag_chunks 
        WHERE file_key = ? AND username = ?
      `
      )
      .bind(fileKey, username)
      .first<{ count: number }>();

    return result?.count || 0;
  }
}
