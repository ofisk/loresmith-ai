// Library RAG Service - Vector-based RAG for user library files
// This service handles text extraction, embedding generation, and semantic vector search
// Uses Vectorize for embeddings and Cloudflare AI for content generation

import { getDAOFactory } from "@/dao/dao-factory";
import type { Env } from "@/middleware/auth";
import type { FileMetadata, SearchQuery, SearchResult } from "@/types/upload";
import { BaseRAGService } from "./base-rag-service";
import {
  FileNotFoundError,
  VectorizeIndexRequiredError,
  InvalidEmbeddingResponseError,
} from "@/lib/errors";
import { getDocument } from "pdfjs-serverless";
import { chunkTextByCharacterCount } from "@/lib/text-chunking-utils";
import { RPG_EXTRACTION_PROMPTS } from "@/lib/prompts/rpg-extraction-prompts";
import { getSemanticMetadataPrompt } from "@/lib/prompts/file-indexing-prompts";

// LLM model configuration
const LLM_MODEL = "@cf/meta/llama-3.1-8b-instruct";

export class LibraryRAGService extends BaseRAGService {
  private ai: any;

  constructor(env: Env) {
    super(env.DB, env.VECTORIZE, env.OPENAI_API_KEY || "", env);
    this.ai = env.AI;
  }

  async processFile(metadata: FileMetadata): Promise<{
    displayName?: string;
    description: string;
    tags: string[];
    vectorId?: string;
  }> {
    try {
      const file = await this.env.R2.get(metadata.fileKey);
      if (!file) {
        throw new FileNotFoundError(metadata.fileKey);
      }

      // Extract text based on file type
      const text = await this.extractText(file, metadata.contentType);

      if (!text || text.trim().length === 0) {
        console.error(
          `[LibraryRAGService] No text extracted from file: ${metadata.fileKey}. File may be corrupted, encrypted, or too large.`
        );
        throw new Error(
          `No text could be extracted from file "${metadata.filename}". The file may be corrupted, encrypted, image-based, or too large to process.`
        );
      }

      // Use AI for enhanced metadata generation if available
      let result: { displayName?: string; description: string; tags: string[] };
      try {
        if (this.ai) {
          // Generate semantic metadata using AI with file content
          const semanticResult = await this.generateSemanticMetadata(
            metadata.filename,
            metadata.fileKey,
            metadata.userId,
            text
          );

          if (semanticResult) {
            result = semanticResult;
          } else {
            // No meaningful metadata generated - leave blank
            result = {
              displayName: undefined,
              description: "",
              tags: [],
            };
          }
        } else {
          result = {
            displayName: undefined,
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
          displayName: undefined,
          description: "",
          tags: [],
        };
      }

      // Store embeddings for search
      const vectorId = await this.storeEmbeddings(text, metadata.id);

      console.log(`[LibraryRAGService] Processed file:`, {
        fileKey: metadata.fileKey,
        displayName: result.displayName,
        description: result.description,
        tags: result.tags,
        vectorId,
      });

      return {
        ...result,
        vectorId,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error(
        `[LibraryRAGService] Error processing file ${metadata.fileKey}:`,
        errorMessage
      );
      if (errorStack) {
        console.error(`[LibraryRAGService] Error stack:`, errorStack);
      }
      // Rethrow error so it can be properly handled upstream
      throw error;
    }
  }

  private async extractText(
    file: R2ObjectBody,
    contentType: string
  ): Promise<string | null> {
    const buffer = await file.arrayBuffer();

    if (contentType.includes("pdf")) {
      return await this.extractFileText(buffer);
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

  private async extractFileText(buffer: ArrayBuffer): Promise<string> {
    try {
      // Use pdfjs-serverless for proper PDF extraction (designed for Workers)
      // Load the PDF document
      const pdf = await getDocument({
        data: new Uint8Array(buffer),
      }).promise;

      const numPages = pdf.numPages;
      console.log(`[LibraryRAGService] PDF has ${numPages} pages`);

      const pageTexts: string[] = [];

      // Extract text from each page
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();

        // Combine all text items from the page
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(" ");

        if (pageText.trim().length > 0) {
          pageTexts.push(pageText);
        }
      }

      // Join all pages with page breaks for context
      const fullText = pageTexts
        .map((text, index) => `[Page ${index + 1}]\n${text}`)
        .join("\n\n");

      return fullText || `File content extracted (${buffer.byteLength} bytes)`;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error(
        `[LibraryRAGService] PDF text extraction failed:`,
        errorMessage
      );
      if (errorStack) {
        console.error(
          `[LibraryRAGService] Extraction error stack:`,
          errorStack
        );
      }
      // Throw error instead of returning empty string - this allows proper error handling upstream
      throw new Error(
        `Failed to extract text from PDF: ${errorMessage}. The file may be corrupted, encrypted, or too large.`
      );
    }
  }

  private async storeEmbeddings(
    text: string,
    metadataId: string
  ): Promise<string> {
    try {
      if (!this.vectorize) {
        throw new VectorizeIndexRequiredError();
      }

      // Cloudflare AI embedding model limit is ~4000 characters
      // Use 3500 to stay safely under the limit
      const EMBEDDING_CHUNK_SIZE = 3500;

      // Chunk text for large files - chunking ensures all content is embedded
      // Use character-based chunking with sentence boundaries for all file types
      // This is more robust than page-based chunking which requires specific markers
      const textChunks =
        text.length > EMBEDDING_CHUNK_SIZE
          ? chunkTextByCharacterCount(text, EMBEDDING_CHUNK_SIZE)
          : [text];

      console.log(
        `[LibraryRAGService] Storing embeddings for ${textChunks.length} chunk(s) (total text length: ${text.length} chars)`
      );

      // Warn if we have too many chunks - might hit timeout limits
      if (textChunks.length > 5000) {
        console.warn(
          `[LibraryRAGService] WARNING: Large number of chunks (${textChunks.length}) may cause timeout. Consider processing in background queue.`
        );
      }

      // Generate and store embeddings for each chunk
      const vectorsToInsert: Array<{
        id: string;
        values: number[];
        metadata: Record<string, any>;
      }> = [];
      let primaryVectorId: string | undefined;

      for (let i = 0; i < textChunks.length; i++) {
        const chunk = textChunks[i];
        const chunkText = chunk.substring(0, EMBEDDING_CHUNK_SIZE); // Ensure under limit

        // Generate embedding for this chunk
        let embeddings: number[];
        if (this.env.AI) {
          try {
            const embeddingResponse = await this.env.AI.run(
              "@cf/baai/bge-base-en-v1.5",
              {
                text: chunkText,
              }
            );

            // Parse the response - handle different response types
            let responseText: string;
            if (typeof embeddingResponse === "string") {
              responseText = embeddingResponse;
            } else if (
              embeddingResponse &&
              typeof embeddingResponse === "object" &&
              "response" in embeddingResponse
            ) {
              responseText = (embeddingResponse as any).response;
            } else {
              responseText = JSON.stringify(embeddingResponse);
            }

            const parsedResponse = JSON.parse(responseText);
            if (Array.isArray(parsedResponse)) {
              embeddings = parsedResponse;
            } else {
              throw new InvalidEmbeddingResponseError();
            }
          } catch (error) {
            console.warn(
              `[LibraryRAGService] AI embedding failed for chunk ${i + 1}/${textChunks.length}, using fallback:`,
              error
            );
            embeddings = this.generateBasicEmbeddings(chunkText);
          }
        } else {
          embeddings = this.generateBasicEmbeddings(chunkText);
        }

        // Generate vector ID for this chunk
        const chunkVectorId = await this.generateVectorId(
          metadataId,
          `${i}-${Date.now()}`
        );

        // First chunk is the primary vector ID
        if (i === 0) {
          primaryVectorId = chunkVectorId;
        }

        vectorsToInsert.push({
          id: chunkVectorId,
          values: embeddings,
          metadata: {
            text: chunkText.substring(0, 1000), // Store first 1000 chars as metadata
            metadataId,
            type: "pdf_content",
            chunkIndex: i,
            totalChunks: textChunks.length,
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Store all embeddings in Vectorize
      // Batch inserts if there are too many vectors to avoid hitting limits
      if (vectorsToInsert.length > 0) {
        const BATCH_SIZE = 1000; // Process in batches to avoid timeout/memory issues
        if (vectorsToInsert.length > BATCH_SIZE) {
          console.log(
            `[LibraryRAGService] Batch inserting ${vectorsToInsert.length} vectors in batches of ${BATCH_SIZE}`
          );
          for (let i = 0; i < vectorsToInsert.length; i += BATCH_SIZE) {
            const batch = vectorsToInsert.slice(i, i + BATCH_SIZE);
            await this.vectorize.insert(batch);
            console.log(
              `[LibraryRAGService] Stored batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(vectorsToInsert.length / BATCH_SIZE)} (${batch.length} vectors)`
            );
          }
        } else {
          await this.vectorize.insert(vectorsToInsert);
        }
        console.log(
          `[LibraryRAGService] Successfully stored ${vectorsToInsert.length} embedding(s) for ${metadataId}`
        );
      }

      // Return primary vector ID (first chunk)
      if (!primaryVectorId) {
        throw new Error("Failed to generate primary vector ID");
      }
      return primaryVectorId;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error(
        `[LibraryRAGService] Error storing embeddings for ${metadataId}:`,
        errorMessage
      );
      if (errorStack) {
        console.error(`[LibraryRAGService] Error stack:`, errorStack);
      }
      // Rethrow error so processing can fail properly - don't return fallback
      throw new Error(
        `Failed to store embeddings: ${errorMessage}. File may be too large or processing timed out.`
      );
    }
  }

  /**
   * Generate basic embeddings as fallback
   */
  private generateBasicEmbeddings(text: string): number[] {
    // Simple hash-based embedding generation for fallback
    const hash = this.simpleHash(text);
    const embeddings: number[] = [];

    // Generate 1536-dimensional vector (matching OpenAI embeddings)
    for (let i = 0; i < 1536; i++) {
      const seed = hash + i;
      embeddings.push((Math.sin(seed) + 1) / 2); // Normalize to [0, 1]
    }

    return embeddings;
  }

  /**
   * Simple hash function for fallback embeddings
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Generate a Vectorize-compatible vector ID that is guaranteed to be under 64 bytes
   * Uses SHA-256 hash to create a deterministic, short identifier
   */
  private async generateVectorId(
    metadataId: string,
    suffix?: string
  ): Promise<string> {
    // Create a hash of the metadataId to ensure uniqueness while keeping it short
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(metadataId + (suffix || ""))
    );
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Use first 48 characters of hash (48 bytes) + "v_" prefix (2 bytes) = 50 bytes total
    // This leaves room for any additional suffix if needed
    const shortHash = hashHex.substring(0, 48);
    return `v_${shortHash}`;
  }

  async searchFiles(query: SearchQuery): Promise<SearchResult[]> {
    const {
      query: searchQuery,
      userId,
      limit = 20,
      offset = 0,
      includeSemantic = true,
    } = query;

    try {
      const fileDAO = getDAOFactory(this.env).fileDAO;

      // Get all files for the user
      const files = await fileDAO.getFilesForRag(userId);

      // Debug: Log the raw file data
      console.log(`[LibraryRAGService] Raw files from database:`, files);

      // Filter files based on search query
      let filteredFiles = files;
      if (searchQuery.trim()) {
        const searchLower = searchQuery.toLowerCase();
        filteredFiles = files.filter((file: any) => {
          const filename = (file.file_name || "").toLowerCase();
          const description = (file.description || "").toLowerCase();
          const tags = (file.tags || "[]").toLowerCase();

          return (
            filename.includes(searchLower) ||
            description.includes(searchLower) ||
            tags.includes(searchLower)
          );
        });
      }

      // Apply pagination
      const paginatedFiles = filteredFiles.slice(offset, offset + limit);

      const searchResults: SearchResult[] = paginatedFiles.map((file: any) => {
        // Debug: Log each file being mapped
        console.log(`[LibraryRAGService] Mapping file:`, {
          id: file.id,
          file_key: file.file_key,
          file_name: file.file_name,
          description: file.description,
          tags: file.tags,
          file_size: file.file_size,
          created_at: file.created_at,
        });

        return {
          id: file.id,
          file_key: file.file_key,
          file_name: file.file_name,
          description: file.description,
          tags: JSON.parse(file.tags || "[]"),
          file_size: file.file_size,
          created_at: file.created_at,
          status: file.status,
        };
      });

      // NOTE: Currently uses keyword-based search. Future enhancement:
      // Implement semantic search using vector embeddings for better
      // relevance matching, especially for similar content.
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
    fileKey: string,
    username: string
  ): Promise<FileMetadata | null> {
    try {
      const fileDAO = getDAOFactory(this.env).fileDAO;
      const result = await fileDAO.getFileForRag(fileKey, username);

      if (!result) {
        return null;
      }

      return {
        id: result.id as string,
        fileKey: result.file_key as string,
        userId: result.username as string,
        filename: result.file_name as string,
        fileSize: result.file_size as number,
        contentType: "application/pdf", // Default since column doesn't exist
        description: result.description as string | undefined,
        tags: JSON.parse((result.tags as string) || "[]"),
        status: result.status as string,
        createdAt: result.created_at as string,
        updatedAt: result.updated_at as string,
        vectorId: undefined, // Column doesn't exist
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
      const fileDAO = getDAOFactory(this.env).fileDAO;

      // Get the file to find the file_key
      const file = await fileDAO.getFileForRag(fileId, userId);
      if (!file) {
        console.error(`[LibraryRAGService] File not found for update:`, {
          fileId,
          userId,
        });
        return false;
      }

      // Update description and tags if provided
      if (updates.description !== undefined || updates.tags !== undefined) {
        await fileDAO.updateFileMetadataForRag(
          file.file_key,
          userId,
          updates.description || file.description || "",
          updates.tags ? JSON.stringify(updates.tags) : file.tags || "[]"
        );
      }

      // Update status if provided
      if (updates.status !== undefined) {
        await fileDAO.updateFileRecord(file.file_key, updates.status);
      }

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
    username: string,
    fileContent: string
  ): Promise<
    { displayName: string; description: string; tags: string[] } | undefined
  > {
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

      // If no file content provided, analyze filename only
      if (!fileContent || fileContent.trim().length === 0) {
        console.warn(
          `[LibraryRAGService] No file content provided for ${fileName}, analyzing filename only`
        );
        fileContent = "";
      }

      // Chunk content to respect token limits
      // Token estimation: ~4 characters per token for English text
      // We need to account for:
      // - System prompt: ~3,000 tokens
      // - Max response: ~16,384 tokens
      // - Content: 30,000 - 3,000 - 16,384 = ~10,616 tokens = ~42,000 characters
      const CHARS_PER_TOKEN = 4;
      const PROMPT_TOKENS_ESTIMATE = 3000;
      const MAX_RESPONSE_TOKENS = 16384;
      const TPM_LIMIT = 30000;
      const MAX_CONTENT_TOKENS =
        TPM_LIMIT - PROMPT_TOKENS_ESTIMATE - MAX_RESPONSE_TOKENS;
      const MAX_CHUNK_SIZE = Math.floor(MAX_CONTENT_TOKENS * CHARS_PER_TOKEN); // ~42k characters

      // Use character-based chunking with sentence boundaries for all file types
      // This is more robust than page-based chunking which requires specific markers
      const chunks =
        fileContent.length > MAX_CHUNK_SIZE
          ? chunkTextByCharacterCount(fileContent, MAX_CHUNK_SIZE)
          : [fileContent];

      console.log(
        `[LibraryRAGService] Processing ${chunks.length} chunk(s) for metadata generation (max chunk size: ${MAX_CHUNK_SIZE} chars)`
      );

      // Process chunks and merge results
      const allTags: Set<string> = new Set();
      const allDescriptions: string[] = [];
      const allDisplayNames: string[] = [];

      const CHUNK_PROCESSING_DELAY_MS = chunks.length > 1 ? 2000 : 0;

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkPreview = chunk.substring(0, Math.min(1000, chunk.length));

        const semanticPrompt = getSemanticMetadataPrompt(
          fileName,
          fileKey,
          username,
          fileContent.length > 0,
          chunkPreview,
          chunks.length,
          i
        );

        try {
          if (i > 0) {
            await new Promise((resolve) =>
              setTimeout(resolve, CHUNK_PROCESSING_DELAY_MS)
            );
          }

          console.log(
            `[LibraryRAGService] Processing chunk ${i + 1}/${chunks.length} for metadata generation`
          );

          const response = await this.ai.run(LLM_MODEL, {
            messages: [
              {
                role: "user",
                content: semanticPrompt,
              },
            ],
            max_tokens: MAX_RESPONSE_TOKENS,
          });

          let responseText: string;
          if (typeof response === "string") {
            responseText = response;
          } else if (
            response &&
            typeof response === "object" &&
            "response" in response
          ) {
            responseText = (response as any).response;
          } else if (
            response &&
            typeof response === "object" &&
            "content" in response
          ) {
            responseText = Array.isArray((response as any).content)
              ? (response as any).content
                  .map((c: any) => c.text || c)
                  .join("\n")
              : JSON.stringify(response);
          } else {
            responseText = JSON.stringify(response);
          }

          // Try to extract JSON from the response
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.displayName) allDisplayNames.push(parsed.displayName);
              if (parsed.description) allDescriptions.push(parsed.description);
              if (Array.isArray(parsed.tags)) {
                for (const tag of parsed.tags) {
                  allTags.add(tag);
                }
              }
            } catch (parseError) {
              console.warn(
                `[LibraryRAGService] Failed to parse JSON from chunk ${i + 1}:`,
                parseError
              );
            }
          }
        } catch (error) {
          console.error(
            `[LibraryRAGService] Error processing chunk ${i + 1}:`,
            error
          );
          // Continue with other chunks even if one fails
        }
      }

      // Merge results from all chunks
      const finalDisplayName =
        allDisplayNames.length > 0 ? allDisplayNames[0] : undefined;
      const finalDescription =
        allDescriptions.length > 0
          ? allDescriptions.join(" ").substring(0, 500)
          : undefined;
      const finalTags = Array.from(allTags);

      if (finalDisplayName || finalDescription || finalTags.length > 0) {
        return {
          displayName: finalDisplayName || fileName.replace(/\.[^/.]+$/, ""),
          description: finalDescription || "",
          tags: finalTags,
        };
      }

      return undefined;
    } catch (error) {
      console.error(
        `[LibraryRAGService] Error in generateSemanticMetadata:`,
        error
      );
      return undefined;
    }
  }

  async getUserFiles(username: string): Promise<any[]> {
    try {
      const fileDAO = getDAOFactory(this.env).fileDAO;
      return await fileDAO.getFilesForRag(username);
    } catch (error) {
      console.error(`[LibraryRAGService] Error getting user files:`, error);
      return [];
    }
  }

  async searchContent(
    _username: string,
    query: string,
    _limit: number = 10
  ): Promise<any[]> {
    try {
      console.log(`[LibraryRAGService] Searching content with query: ${query}`);

      // Use Cloudflare AI binding for content generation
      if (this.env.AI) {
        try {
          console.log(
            `[LibraryRAGService] Using Cloudflare AI for content generation`
          );

          // Generate structured content using AI - break into multiple focused queries
          const contentTypes = [
            "monsters",
            "npcs",
            "spells",
            "items",
            "traps",
            "hazards",
            "conditions",
            "vehicles",
            "env_effects",
            "hooks",
            "plot_lines",
            "quests",
            "scenes",
            "locations",
            "lairs",
            "factions",
            "deities",
            "backgrounds",
            "feats",
            "subclasses",
            "rules",
            "downtime",
            "tables",
            "encounter_tables",
            "treasure_tables",
            "maps",
            "handouts",
            "puzzles",
            "timelines",
            "travel",
          ];

          const allResults: any[] = [];

          // Query each content type individually to avoid truncation
          for (const contentType of contentTypes) {
            try {
              console.log(`[LibraryRAGService] Querying for ${contentType}...`);

              const typeSpecificPrompt =
                RPG_EXTRACTION_PROMPTS.getTypeSpecificExtractionPrompt(
                  contentType
                );

              const aiResponse = await this.env.AI.run(LLM_MODEL, {
                messages: [
                  {
                    role: "system",
                    content: typeSpecificPrompt,
                  },
                  {
                    role: "user",
                    content: query,
                  },
                ],
                max_tokens: 2000,
                temperature: 0.1,
              });

              // Parse the AI response for this content type
              const responseText = aiResponse.response as string;
              console.log(
                `[LibraryRAGService] ${contentType} response: ${responseText.substring(0, 200)}...`
              );

              // Clean up the response - remove markdown formatting if present
              let cleanResponse = responseText;
              if (responseText.includes("```json")) {
                cleanResponse = responseText
                  .replace(/```json\n?/g, "")
                  .replace(/```\n?/g, "")
                  .trim();
              } else if (responseText.includes("```")) {
                cleanResponse = responseText.replace(/```\n?/g, "").trim();
              }

              // Extract only the JSON part
              const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                cleanResponse = jsonMatch[0];
              }

              try {
                const parsedContent = JSON.parse(cleanResponse);
                if (
                  parsedContent[contentType] &&
                  Array.isArray(parsedContent[contentType])
                ) {
                  // Convert to search result format
                  parsedContent[contentType].forEach(
                    (item: any, index: number) => {
                      if (item && typeof item === "object") {
                        allResults.push({
                          id:
                            item.id || `${contentType}_${index}_${Date.now()}`,
                          score: 0.9 - index * 0.01,
                          metadata: {
                            entityType: contentType,
                            ...item,
                          },
                          text:
                            item.summary ||
                            item.description ||
                            item.name ||
                            JSON.stringify(item),
                        });
                      }
                    }
                  );
                  console.log(
                    `[LibraryRAGService] Extracted ${parsedContent[contentType].length} ${contentType}`
                  );
                }
              } catch (parseError) {
                console.warn(
                  `[LibraryRAGService] Failed to parse ${contentType} response:`,
                  parseError
                );
                // Continue with other content types
              }
            } catch (typeError) {
              console.warn(
                `[LibraryRAGService] Error querying ${contentType}:`,
                typeError
              );
              // Continue with other content types
            }
          }

          console.log(
            `[LibraryRAGService] Generated ${allResults.length} total structured content items`
          );
          return allResults;
        } catch (aiError) {
          console.warn(`[LibraryRAGService] AI generation failed:`, aiError);
          // Return empty results if AI fails
          return [];
        }
      } else {
        // No AI binding available, return empty results
        console.warn(
          `[LibraryRAGService] No AI binding available for content generation`
        );
        return [];
      }
    } catch (error) {
      console.error(`[LibraryRAGService] Search error:`, error);
      return [];
    }
  }

  /**
   * Sync - no external service to sync with
   */
  async sync(): Promise<void> {
    // LibraryRAGService handles everything internally - no sync needed
    console.log(
      `[LibraryRAGService] Sync not needed - all processing is internal`
    );
  }

  async processFileFromR2(
    fileKey: string,
    username: string,
    fileBucket: any,
    metadata: any
  ): Promise<{
    suggestedMetadata?: {
      displayName?: string;
      description: string;
      tags: string[];
    };
    vectorId?: string;
  }> {
    try {
      // Get file from R2
      const file = await fileBucket.get(fileKey);
      if (!file) {
        throw new FileNotFoundError(fileKey);
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
        username,
        text
      );

      // Store embeddings in Vectorize if available
      let vectorId: string | undefined;
      if (this.vectorize && text) {
        try {
          vectorId = await this.storeEmbeddings(text, metadata.id || fileKey);
          console.log(
            `[LibraryRAGService] Stored embeddings for ${fileKey} with vector ID: ${vectorId}`
          );
        } catch (error) {
          console.error(
            `[LibraryRAGService] Failed to store embeddings for ${fileKey}:`,
            error
          );
        }
      }

      if (semanticResult) {
        return {
          suggestedMetadata: {
            displayName: semanticResult.displayName,
            description: semanticResult.description,
            tags: semanticResult.tags,
          },
          vectorId,
        };
      }

      return { vectorId };
    } catch (error) {
      console.error(
        `[LibraryRAGService] Error processing file from R2: ${fileKey}`,
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
