// AutoRAG-based content extraction provider implementation
import type { Env } from "@/middleware/auth";
import type {
  ContentExtractionProvider,
  ContentExtractionOptions,
  ContentExtractionResult,
} from "../content-extraction-provider";
import { getLibraryAutoRAGService } from "@/lib/service-factory";
import { RPG_EXTRACTION_PROMPTS } from "@/lib/prompts/rpg-extraction-prompts";

/**
 * AutoRAG-based content extraction provider
 * Uses AutoRAG AI search to extract content from files
 */
export class AutoRAGContentExtractionProvider
  implements ContentExtractionProvider
{
  constructor(
    private env: Env,
    private username: string
  ) {}

  async extractContent(
    options: ContentExtractionOptions
  ): Promise<ContentExtractionResult> {
    try {
      const { resource, searchPath, maxResults = 50 } = options;

      const libraryAutoRAG = getLibraryAutoRAGService(this.env, this.username);
      const structuredExtractionPrompt =
        RPG_EXTRACTION_PROMPTS.formatStructuredContentPrompt(
          resource.file_name || resource.id
        );

      // Get file content via AutoRAG search
      const fullPathForFilter = searchPath;
      const searchResult = await libraryAutoRAG.aiSearch(
        structuredExtractionPrompt,
        {
          max_results: maxResults,
          rewrite_query: false,
          filters: {
            type: "and",
            filters: [
              {
                type: "gt",
                key: "folder",
                value: `${fullPathForFilter}//`,
              },
              {
                type: "lte",
                key: "folder",
                value: `${fullPathForFilter}/z`,
              },
            ],
          },
        }
      );

      // Extract text content from search results
      let fileContent = "";
      if (searchResult?.data && Array.isArray(searchResult.data)) {
        // AutoRAGAISearchResult has data array with content arrays
        fileContent = searchResult.data
          .flatMap(
            (item) =>
              item.content
                ?.filter((c) => c.type === "text")
                .map((c) => c.text) || []
          )
          .join("\n\n");
      } else if (typeof searchResult === "string") {
        fileContent = searchResult;
      } else if (searchResult?.response) {
        fileContent = searchResult.response;
      }

      if (!fileContent || fileContent.trim().length === 0) {
        return {
          content: "",
          success: false,
          error: `No content extracted from AutoRAG search for resource: ${resource.id}`,
        };
      }

      return {
        content: fileContent,
        success: true,
      };
    } catch (error) {
      console.error(
        `[AutoRAGContentExtractionProvider] Error extracting content:`,
        error
      );
      return {
        content: "",
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown extraction error",
      };
    }
  }
}
