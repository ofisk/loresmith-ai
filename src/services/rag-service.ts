// RAG service for metadata generation and search
// This service handles text extraction, embedding generation, and semantic search
// Updated to work with AutoRAG for enhanced content processing

import { getDAOFactory } from "../dao/dao-factory";
import type { Env } from "../middleware/auth";
import type { FileMetadata, SearchQuery, SearchResult } from "../types/upload";
import { BaseRAGService } from "./base-rag-service";

// LLM model configuration
const LLM_MODEL = "@cf/meta/llama-3.1-8b-instruct";

export class LibraryRAGService extends BaseRAGService {
  private ai: any;

  constructor(env: Env) {
    super(env.DB, env.VECTORIZE, env.OPENAI_API_KEY || "", env);
    this.ai = env.AI;
  }

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
      // Use AutoRAG's text extraction if available
      if (this.env.AI) {
        // AutoRAG handles file content directly - no extraction needed
        return `File content processed by AutoRAG (${buffer.byteLength} bytes)`;
      }

      // Fallback to basic text extraction
      const uint8Array = new Uint8Array(buffer);
      const decoder = new TextDecoder("utf-8", { fatal: false });
      const fileString = decoder.decode(uint8Array);

      // Simple text extraction patterns
      const textPatterns = [
        /\(([^)]+)\)/g, // Text in parentheses
        /BT\s*([^E]+?)ET/g, // Text between BT and ET
        /Tj\s*\(([^)]*)\)/g, // Text after Tj
      ];

      let extractedText = "";

      for (const pattern of textPatterns) {
        const matches = fileString.match(pattern) || [];
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
        `File content extracted (${buffer.byteLength} bytes)`
      );
    } catch (error) {
      console.error("Error extracting file text:", error);
      return `File content extracted (${buffer.byteLength} bytes)`;
    }
  }

  private async storeEmbeddings(
    text: string,
    metadataId: string
  ): Promise<string> {
    try {
      if (!this.vectorize) {
        throw new Error("Vectorize index is required");
      }

      // Generate embeddings using AutoRAG if available
      let embeddings: number[];
      if (this.env.AI) {
        try {
          // Use AutoRAG to generate embeddings
          const embeddingResponse = await this.env.AI.run(
            "@cf/baai/bge-base-en-v1.5",
            {
              text: text.substring(0, 4000),
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
            throw new Error("Invalid embedding response format");
          }
        } catch (error) {
          console.warn(
            `[LibraryRAGService] AutoRAG embedding failed, using fallback:`,
            error
          );
          // Fallback to basic embedding generation
          embeddings = this.generateBasicEmbeddings(text);
        }
      } else {
        // Fallback to basic embedding generation
        embeddings = this.generateBasicEmbeddings(text);
      }

      // Store in Vectorize
      const vectorId = `vector_${metadataId}_${Date.now()}`;
      await this.vectorize.insert([
        {
          id: vectorId,
          values: embeddings,
          metadata: {
            text: text.substring(0, 1000), // Store first 1000 chars as metadata
            metadataId,
            type: "pdf_content",
            timestamp: new Date().toISOString(),
          },
        },
      ]);

      return vectorId;
    } catch (error) {
      console.error(`[LibraryRAGService] Error storing embeddings:`, error);
      // Return a fallback vector ID
      return `vector_${metadataId}_fallback`;
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

      // Use Cloudflare AI binding instead of external AutoRAG service
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

              const typeSpecificPrompt = `You are extracting ${contentType} from RPG text.

TASK
From the provided text, identify and synthesize ALL relevant ${contentType} and output a JSON object. Return ONLY valid JSON (no comments, no markdown).

CONTEXT & HINTS
- Focus specifically on ${contentType} content
- Look for typical cues that indicate ${contentType}
- Normalize names (title case), keep dice notation and DCs
- Prefer concise, prep-usable summaries over flavor text

OUTPUT RULES
- Output one JSON object with the structure: { "${contentType}": [...] }
- Each ${contentType} should have: id, type:"${contentType}", name, summary, tags, source
- Do not invent rules outside the text; summarize faithfully
- Keep summary short (≤ 500 chars)

SPEC for ${contentType}:
- id: stable slug (lowercase kebab)
- type: "${contentType}"
- name: string
- summary: 1–5 sentence DM-usable summary
- tags: array of short tags
- source: { doc, pages?, anchor? }

RETURN ONLY JSON in this format:
{
  "${contentType}": [
    {
      "id": "example_id",
      "type": "${contentType}",
      "name": "Example Name",
      "summary": "Brief description",
      "tags": ["tag1", "tag2"],
      "source": { "doc": "document_id" }
    }
  ]
}`;

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
   * Sync with AutoRAG (delegates to the base)
   */
  async sync(): Promise<void> {
    // No external AutoRAG service to sync with
    console.log(`[LibraryRAGService] No external AutoRAG service to sync with`);
  }

  async processFileFromR2(
    fileKey: string,
    username: string,
    fileBucket: any,
    metadata: any
  ): Promise<{
    suggestedMetadata?: { description: string; tags: string[] };
    vectorId?: string;
  }> {
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
