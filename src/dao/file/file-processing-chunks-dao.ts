import { BaseDAOClass } from "../base-dao";

/**
 * DAO for the file_processing_chunks table (chunked upload / processing pipeline).
 * Tracks per-chunk state (index, ranges, status, retries, vector_id). Composed by
 * FileDAO; not intended for direct use by callers.
 */
export class FileProcessingChunksDAO extends BaseDAOClass {
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
      chunk.pageRangeStart ?? null,
      chunk.pageRangeEnd ?? null,
      chunk.byteRangeStart ?? null,
      chunk.byteRangeEnd ?? null,
    ]);
  }

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
    const rows = await this.queryAll<Record<string, unknown>>(sql, [fileKey]);
    return rows.map((row) => ({
      id: row.id as string,
      fileKey: row.file_key as string,
      username: row.username as string,
      chunkIndex: row.chunk_index as number,
      totalChunks: row.total_chunks as number,
      pageRangeStart: row.page_range_start as number | undefined,
      pageRangeEnd: row.page_range_end as number | undefined,
      byteRangeStart: row.byte_range_start as number | undefined,
      byteRangeEnd: row.byte_range_end as number | undefined,
      status: row.status as string,
      vectorId: row.vector_id as string | undefined,
      errorMessage: row.error_message as string | undefined,
      retryCount: row.retry_count as number,
      createdAt: row.created_at as string,
      processedAt: row.processed_at as string | undefined,
      updatedAt: row.updated_at as string | undefined,
    }));
  }

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
    const values: unknown[] = [];

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

    if (fields.length === 0) return;

    fields.push("updated_at = datetime('now')");
    values.push(chunkId);

    const sql = `UPDATE file_processing_chunks SET ${fields.join(", ")} WHERE id = ?`;
    await this.execute(sql, values);
  }

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
    const params: unknown[] = [];

    if (username) {
      sql += " AND username = ?";
      params.push(username);
    }

    sql += " ORDER BY created_at ASC";

    const rows = await this.queryAll<Record<string, unknown>>(sql, params);
    return rows.map((row) => ({
      id: row.id as string,
      fileKey: row.file_key as string,
      username: row.username as string,
      chunkIndex: row.chunk_index as number,
      totalChunks: row.total_chunks as number,
      pageRangeStart: row.page_range_start as number | undefined,
      pageRangeEnd: row.page_range_end as number | undefined,
      byteRangeStart: row.byte_range_start as number | undefined,
      byteRangeEnd: row.byte_range_end as number | undefined,
      retryCount: row.retry_count as number,
    }));
  }

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
    const result = await this.queryFirst<{
      total?: number;
      completed?: number;
      failed?: number;
      pending?: number;
      processing?: number;
    }>(sql, [fileKey]);
    return {
      total: result?.total ?? 0,
      completed: result?.completed ?? 0,
      failed: result?.failed ?? 0,
      pending: result?.pending ?? 0,
      processing: result?.processing ?? 0,
    };
  }

  async deleteFileProcessingChunks(fileKey: string): Promise<void> {
    const sql = `DELETE FROM file_processing_chunks WHERE file_key = ?`;
    await this.execute(sql, [fileKey]);
  }
}
