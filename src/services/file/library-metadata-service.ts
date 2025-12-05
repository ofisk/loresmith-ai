import type { Env } from "@/middleware/auth";
import { chunkTextByCharacterCount } from "@/lib/text-chunking-utils";
import { getSemanticMetadataPrompt } from "@/lib/prompts/file-indexing-prompts";

const LLM_MODEL = "@cf/meta/llama-3.1-8b-instruct";

// Token estimation constants
const CHARS_PER_TOKEN = 4;
const PROMPT_TOKENS_ESTIMATE = 3000;
const MAX_RESPONSE_TOKENS = 16384;
const TPM_LIMIT = 30000;
const MAX_CONTENT_TOKENS =
  TPM_LIMIT - PROMPT_TOKENS_ESTIMATE - MAX_RESPONSE_TOKENS;
const MAX_CHUNK_SIZE = Math.floor(MAX_CONTENT_TOKENS * CHARS_PER_TOKEN); // ~42k characters
const CHUNK_PROCESSING_DELAY_MS = 2000;

export interface SemanticMetadataResult {
  displayName: string;
  description: string;
  tags: string[];
}

/**
 * Service for generating semantic metadata for library files
 */
export class LibraryMetadataService {
  constructor(private env: Env) {}

  /**
   * Generate semantic metadata from file content
   */
  async generateSemanticMetadata(
    fileName: string,
    fileKey: string,
    username: string,
    fileContent: string
  ): Promise<SemanticMetadataResult | undefined> {
    try {
      console.log(
        `[LibraryMetadataService] Starting semantic metadata generation for ${fileName}`
      );

      if (!this.env.AI) {
        console.warn(
          "[LibraryMetadataService] AI binding not available for semantic metadata generation"
        );
        return undefined;
      }

      // If no file content provided, analyze filename only
      if (!fileContent || fileContent.trim().length === 0) {
        console.warn(
          `[LibraryMetadataService] No file content provided for ${fileName}, analyzing filename only`
        );
        fileContent = "";
      }

      // Chunk content to respect token limits
      const chunks =
        fileContent.length > MAX_CHUNK_SIZE
          ? chunkTextByCharacterCount(fileContent, MAX_CHUNK_SIZE)
          : [fileContent];

      console.log(
        `[LibraryMetadataService] Processing ${chunks.length} chunk(s) for metadata generation (max chunk size: ${MAX_CHUNK_SIZE} chars)`
      );

      // Process chunks and merge results
      const allTags: Set<string> = new Set();
      const allDescriptions: string[] = [];
      const allDisplayNames: string[] = [];

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
            `[LibraryMetadataService] Processing chunk ${i + 1}/${chunks.length} for metadata generation`
          );

          const response = await this.env.AI.run(LLM_MODEL, {
            messages: [
              {
                role: "user",
                content: semanticPrompt,
              },
            ],
            max_tokens: MAX_RESPONSE_TOKENS,
          });

          const responseText = this.extractResponseText(response);

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
                `[LibraryMetadataService] Failed to parse JSON from chunk ${i + 1}:`,
                parseError
              );
            }
          }
        } catch (error) {
          console.error(
            `[LibraryMetadataService] Error processing chunk ${i + 1}:`,
            error
          );
          // Continue with other chunks even if one fails
        }
      }

      // Merge results from all chunks
      const finalDisplayName =
        allDisplayNames.length > 0
          ? allDisplayNames[0]
          : fileName.replace(/\.[^/.]+$/, "");
      const finalDescription =
        allDescriptions.length > 0
          ? allDescriptions.join(" ").substring(0, 500)
          : "";
      const finalTags = Array.from(allTags);

      if (finalDisplayName || finalDescription || finalTags.length > 0) {
        return {
          displayName: finalDisplayName,
          description: finalDescription,
          tags: finalTags,
        };
      }

      return undefined;
    } catch (error) {
      console.error(
        `[LibraryMetadataService] Error in generateSemanticMetadata:`,
        error
      );
      return undefined;
    }
  }

  /**
   * Extract text from AI response, handling different response types
   */
  private extractResponseText(response: any): string {
    if (typeof response === "string") {
      return response;
    } else if (
      response &&
      typeof response === "object" &&
      "response" in response
    ) {
      return (response as any).response;
    } else if (
      response &&
      typeof response === "object" &&
      "content" in response
    ) {
      return Array.isArray((response as any).content)
        ? (response as any).content.map((c: any) => c.text || c).join("\n")
        : JSON.stringify(response);
    } else {
      return JSON.stringify(response);
    }
  }
}
