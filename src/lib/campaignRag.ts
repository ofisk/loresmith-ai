import { BaseRAGService } from "../services/base-rag-service";

export interface CampaignContextChunk {
  id: string;
  campaign_id: string;
  context_id: string;
  chunk_text: string;
  chunk_index: number;
  embedding_id?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface CampaignContext {
  id: string;
  campaign_id: string;
  context_type: string;
  title: string;
  content: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CampaignCharacter {
  id: string;
  campaign_id: string;
  character_name: string;
  character_class?: string;
  character_level: number;
  character_race?: string;
  backstory?: string;
  personality_traits?: string;
  goals?: string;
  relationships?: string[];
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CampaignSearchResult {
  chunk: CampaignContextChunk;
  score: number;
  metadata?: Record<string, any>;
  contextType?: string;
  title?: string;
}

export class CampaignRAGService extends BaseRAGService {
  /**
   * Process campaign context and store in vector database
   */
  async processCampaignContext(
    contextId: string,
    campaignId: string,
    content: string,
    contextType: string,
    title: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      this.validateDependencies();

      // Chunk the content
      const chunks = this.chunkText(content);

      // Generate embeddings for chunks
      const texts = chunks.map((chunk) => chunk.text);
      const embeddings = await this.generateEmbeddings(texts);

      // Store chunks and embeddings
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = embeddings[i];

        // Store chunk in database
        const chunkId = `${contextId}_chunk_${i}`;
        await this.db
          .prepare(
            `INSERT INTO campaign_context_chunks 
             (id, campaign_id, context_id, chunk_text, chunk_index, metadata, created_at)
             VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
          )
          .bind(
            chunkId,
            campaignId,
            contextId,
            chunk.text,
            chunk.index,
            JSON.stringify(chunk.metadata || {})
          )
          .run();

        // Store embedding in vector database
        await this.vectorize.insert([
          {
            id: chunkId,
            values: embedding,
            metadata: {
              campaign_id: campaignId,
              context_id: contextId,
              context_type: contextType,
              title: title,
              chunk_index: chunk.index,
              ...chunk.metadata,
              ...metadata,
            },
          },
        ]);
      }

      this.logOperation("Campaign context processed", {
        contextId,
        campaignId,
        chunksCount: chunks.length,
        contextType,
        title,
      });
    } catch (error) {
      const errorResponse = this.createErrorResponse(
        "Failed to process campaign context",
        error
      );
      throw new Error(errorResponse.error);
    }
  }

  /**
   * Search campaign context using vector similarity
   */
  async searchCampaignContext(
    campaignId: string,
    query: string,
    limit: number = 10
  ): Promise<CampaignSearchResult[]> {
    try {
      this.validateDependencies();

      // Generate embedding for search query
      const queryEmbedding = await this.generateEmbeddings([query]);
      const embedding = queryEmbedding[0];

      // Search vector database
      const searchResults = await this.vectorize.query(embedding, {
        topK: limit,
        filter: { campaign_id: campaignId },
      });

      // Get chunk details from database
      const chunkIds = searchResults.matches.map((match) => match.id);
      const chunks = await this.getChunksByIds(chunkIds);

      // Combine results
      const results: CampaignSearchResult[] = searchResults.matches.map(
        (match) => {
          const chunk = chunks.find((c) => c.id === match.id);
          if (!chunk) {
            throw new Error(`Chunk not found: ${match.id}`);
          }

          return {
            chunk,
            score: match.score,
            metadata: match.metadata,
            contextType: match.metadata?.context_type as string | undefined,
            title: match.metadata?.title as string | undefined,
          };
        }
      );

      this.logOperation("Campaign context search completed", {
        campaignId,
        query,
        resultsCount: results.length,
      });

      return results;
    } catch (error) {
      const errorResponse = this.createErrorResponse(
        "Failed to search campaign context",
        error
      );
      throw new Error(errorResponse.error);
    }
  }

  /**
   * Override chunkText for campaign-specific parameters
   */
  protected chunkText(
    text: string,
    maxChunkSize: number = 800,
    overlap: number = 150
  ): Array<{ text: string; index: number; metadata?: Record<string, any> }> {
    // Campaign context typically needs smaller chunks with more overlap
    // for better context preservation
    if (maxChunkSize > 1000) {
      maxChunkSize = 800; // Cap at 800 for campaign context
    }

    if (overlap < 100) {
      overlap = 150; // Ensure minimum overlap for context
    }

    return super.chunkText(text, maxChunkSize, overlap);
  }

  /**
   * Get campaign context chunks by IDs
   */
  protected async getChunksByIds(
    ids: string[]
  ): Promise<CampaignContextChunk[]> {
    if (ids.length === 0) return [];

    const placeholders = ids.map(() => "?").join(",");
    const { results } = await this.db
      .prepare(
        `SELECT * FROM campaign_context_chunks 
         WHERE id IN (${placeholders})
         ORDER BY chunk_index`
      )
      .bind(...ids)
      .all();

    return results as unknown as CampaignContextChunk[];
  }

  /**
   * Update processing status (no-op for campaign RAG)
   */
  protected async updateStatus(
    _identifier: string,
    _status: string
  ): Promise<void> {
    // Campaign RAG doesn't need status tracking
    // This is a no-op implementation
  }
}
