import type { D1Database, VectorizeIndex } from "@cloudflare/workers-types";

export interface PdfChunk {
  id: string;
  file_key: string;
  username: string;
  chunk_text: string;
  chunk_index: number;
  embedding_id?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface PdfMetadata {
  file_key: string;
  username: string;
  file_name: string;
  description?: string;
  tags?: string[];
  file_size: number;
  status: "uploaded" | "processing" | "processed" | "error";
  created_at: string;
}

export interface SearchResult {
  chunk: PdfChunk;
  score: number;
  metadata?: Record<string, any>;
}

export class RAGService {
  constructor(
    private db: D1Database,
    private vectorize: VectorizeIndex
  ) {}

  /**
   * Process a PDF file by chunking its content and generating embeddings
   */
  async processPdf(
    fileKey: string,
    username: string,
    content: string,
    _metadata: Partial<PdfMetadata>
  ): Promise<void> {
    try {
      // Update PDF metadata status to processing
      await this.updatePdfStatus(fileKey, "processing");

      // Chunk the content
      const chunks = this.chunkText(content, 1000, 200);

      // Generate embeddings for each chunk
      const embeddings = await this.generateEmbeddings(
        chunks.map((chunk) => chunk.text)
      );

      // Store chunks and embeddings
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = embeddings[i];

        // Store chunk in D1
        const chunkId = crypto.randomUUID();
        await this.db
          .prepare(
            "INSERT INTO pdf_chunks (id, file_key, username, chunk_text, chunk_index, embedding_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
          )
          .bind(
            chunkId,
            fileKey,
            username,
            chunk.text,
            chunk.index,
            chunkId, // Use chunk ID as embedding ID
            JSON.stringify(chunk.metadata || {}),
            new Date().toISOString()
          )
          .run();

        // Store embedding in Vectorize
        await this.vectorize.insert([
          {
            id: chunkId,
            values: embedding,
            metadata: {
              file_key: fileKey,
              username: username,
              chunk_index: chunk.index,
              ...chunk.metadata,
            },
          },
        ]);
      }

      // Update PDF metadata status to processed
      await this.updatePdfStatus(fileKey, "processed");

      console.log(`Processed PDF ${fileKey} with ${chunks.length} chunks`);
    } catch (error) {
      console.error(`Error processing PDF ${fileKey}:`, error);
      await this.updatePdfStatus(fileKey, "error");
      throw error;
    }
  }

  /**
   * Search for relevant content across all user's PDFs
   */
  async searchContent(
    username: string,
    query: string,
    limit: number = 10
  ): Promise<SearchResult[]> {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbeddings([query]);

      // Search in Vectorize
      const searchResults = await this.vectorize.query(queryEmbedding[0], {
        topK: limit,
        returnMetadata: true,
        filter: {
          username: username,
        },
      });

      // Get chunk details from D1
      const chunkIds = searchResults.matches.map((match) => match.id);
      const chunks = await this.getChunksByIds(chunkIds);

      // Combine results
      return searchResults.matches.map((match) => {
        const chunk = chunks.find((c) => c.id === match.id);
        return {
          chunk: chunk!,
          score: match.score,
          metadata: match.metadata,
        };
      });
    } catch (error) {
      console.error("Error searching content:", error);
      throw error;
    }
  }

  /**
   * Get all PDFs for a user
   */
  async getUserPdfs(username: string): Promise<PdfMetadata[]> {
    const { results } = await this.db
      .prepare(
        "SELECT * FROM pdf_metadata WHERE username = ? ORDER BY created_at DESC"
      )
      .bind(username)
      .all();

    return results as unknown as PdfMetadata[];
  }

  /**
   * Get chunks for a specific PDF
   */
  async getPdfChunks(fileKey: string, username: string): Promise<PdfChunk[]> {
    const { results } = await this.db
      .prepare(
        "SELECT * FROM pdf_chunks WHERE file_key = ? AND username = ? ORDER BY chunk_index"
      )
      .bind(fileKey, username)
      .all();

    return results as unknown as PdfChunk[];
  }

  /**
   * Delete a PDF and all its chunks
   */
  async deletePdf(fileKey: string, username: string): Promise<void> {
    // Get all chunk IDs for this PDF
    const { results } = await this.db
      .prepare("SELECT id FROM pdf_chunks WHERE file_key = ? AND username = ?")
      .bind(fileKey, username)
      .all();

    const chunkIds = results.map((r) => r.id as string);

    // Delete from Vectorize
    if (chunkIds.length > 0) {
      await this.vectorize.deleteByIds(chunkIds);
    }

    // Delete from D1
    await this.db
      .prepare("DELETE FROM pdf_chunks WHERE file_key = ? AND username = ?")
      .bind(fileKey, username)
      .run();

    await this.db
      .prepare("DELETE FROM pdf_metadata WHERE file_key = ? AND username = ?")
      .bind(fileKey, username)
      .run();
  }

  /**
   * Chunk text into smaller pieces for processing
   */
  private chunkText(
    text: string,
    maxChunkSize: number = 1000,
    overlap: number = 200
  ): Array<{ text: string; index: number; metadata?: Record<string, any> }> {
    const chunks: Array<{
      text: string;
      index: number;
      metadata?: Record<string, any>;
    }> = [];
    let start = 0;
    let index = 0;

    while (start < text.length) {
      const end = Math.min(start + maxChunkSize, text.length);
      let chunkText = text.slice(start, end);

      // Try to break at sentence boundaries
      if (end < text.length) {
        const lastPeriod = chunkText.lastIndexOf(".");
        const lastExclamation = chunkText.lastIndexOf("!");
        const lastQuestion = chunkText.lastIndexOf("?");
        const lastBreak = Math.max(lastPeriod, lastExclamation, lastQuestion);

        if (lastBreak > maxChunkSize * 0.7) {
          chunkText = chunkText.slice(0, lastBreak + 1);
        }
      }

      chunks.push({
        text: chunkText.trim(),
        index: index++,
        metadata: {
          start_char: start,
          end_char: start + chunkText.length,
        },
      });

      start += chunkText.length - overlap;
    }

    return chunks;
  }

  /**
   * Generate embeddings for text using OpenAI
   */
  private async generateEmbeddings(texts: string[]): Promise<number[][]> {
    // For now, we'll use a simple placeholder
    // In production, you'd call OpenAI's embedding API
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        input: texts,
        model: "text-embedding-3-small",
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const result = (await response.json()) as any;
    return result.data.map((item: any) => item.embedding);
  }

  /**
   * Update PDF processing status
   */
  private async updatePdfStatus(
    fileKey: string,
    status: PdfMetadata["status"]
  ): Promise<void> {
    await this.db
      .prepare("UPDATE pdf_metadata SET status = ? WHERE file_key = ?")
      .bind(status, fileKey)
      .run();
  }

  /**
   * Get chunks by their IDs
   */
  private async getChunksByIds(ids: string[]): Promise<PdfChunk[]> {
    if (ids.length === 0) return [];

    const placeholders = ids.map(() => "?").join(",");
    const { results } = await this.db
      .prepare(`SELECT * FROM pdf_chunks WHERE id IN (${placeholders})`)
      .bind(...ids)
      .all();

    return results as unknown as PdfChunk[];
  }
}
