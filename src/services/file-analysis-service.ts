import { BaseRAGService } from "./base-rag-service";

const AUTORAG_ENDPOINTS = {
  SEARCH: "/search",
  AI_SEARCH: "/ai-search",
} as const;

export interface FileAnalysisResult {
  content_summary: string;
  key_topics: string[];
  content_type_categories: string[];
  difficulty_level: string;
  target_audience: string;
  campaign_themes: string[];
  recommended_campaign_types: string[];
  content_quality_score: number;
}

export interface FileAnalysisRequest {
  fileKey: string;
  filename: string;
  description?: string;
  tags?: string[];
  username: string;
}

export class FileAnalysisService extends BaseRAGService {
  private apiToken: string;
  private searchUrl: string;

  constructor(env: any) {
    // Initialize with dummy values since we don't need the base RAG functionality
    // We only need the AutoRAG query capability
    super(null as any, null as any, "", env);
    this.apiToken = env.AUTORAG_API_TOKEN;
    this.searchUrl = `${env.AUTORAG_BASE_URL}${AUTORAG_ENDPOINTS.SEARCH}`;
  }

  /**
   * Analyze a file using AutoRAG to generate enhanced metadata
   */
  async analyzeFile(request: FileAnalysisRequest): Promise<FileAnalysisResult> {
    try {
      // Query AutoRAG to understand the file content
      const analysisPrompt = this.buildAnalysisPrompt(request);
      const searchResults = await this.queryAutoRAG(
        analysisPrompt,
        this.searchUrl,
        this.apiToken,
        {
          maxResults: 5,
          includeMetadata: true,
          includeChunks: false,
        }
      );

      // Parse and structure the analysis results
      const analysis = await this.parseAnalysisResults(searchResults, request);

      return analysis;
    } catch (error) {
      console.error(
        `[FileAnalysisService] Error analyzing file ${request.fileKey}:`,
        error
      );
      throw new Error(
        `File analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Build a comprehensive prompt for analyzing the file
   */
  private buildAnalysisPrompt(request: FileAnalysisRequest): string {
    const tagsText =
      request.tags && request.tags.length > 0
        ? `Tags: ${request.tags.join(", ")}`
        : "No tags provided";

    const descriptionText = request.description || "No description provided";

    return `Please analyze this file and provide structured metadata for a tabletop RPG resource library:

File: ${request.filename}
Description: ${descriptionText}
${tagsText}

Please provide a JSON response with the following structure:
{
  "content_summary": "A concise 2-3 sentence summary of what this resource contains",
  "key_topics": ["array", "of", "key", "topics", "or", "themes"],
  "content_type_categories": ["array", "of", "content", "types", "e.g.", "map", "character", "adventure"],
  "difficulty_level": "one of: beginner, intermediate, advanced, or expert",
  "target_audience": "one of: players, dms, both, or specific role",
  "campaign_themes": ["array", "of", "campaign", "themes", "this", "fits"],
  "recommended_campaign_types": ["array", "of", "campaign", "types", "this", "fits"],
  "content_quality_score": 1-10
}

Focus on making this resource discoverable and useful for campaign planning and resource recommendations.`;
  }

  /**
   * Parse the AutoRAG search results and generate structured analysis
   */
  private async parseAnalysisResults(
    searchResults: any,
    request: FileAnalysisRequest
  ): Promise<FileAnalysisResult> {
    try {
      // Extract the most relevant result and use it to generate analysis
      const results = searchResults.result?.results || [];

      if (results.length === 0) {
        throw new Error("No AutoRAG results found for analysis");
      }

      // Extract content from AutoRAG results to generate analysis
      const primaryResult = results[0];
      const resultText = primaryResult.text || primaryResult.content || "";

      // Parse the structured response from AutoRAG
      const analysis = this.parseAutoRAGResponse(resultText);
      return analysis;
    } catch (error) {
      console.error(
        `[FileAnalysisService] Failed to parse analysis results for ${request.fileKey}:`,
        error
      );
      throw error; // Re-throw to be handled by the caller
    }
  }

  /**
   * Parse structured analysis response from AutoRAG
   */
  private parseAutoRAGResponse(content: string): FileAnalysisResult {
    try {
      // Try to extract JSON from the AutoRAG response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Validate and return the parsed response
        return {
          content_summary: parsed.content_summary || "No summary provided",
          key_topics: Array.isArray(parsed.key_topics) ? parsed.key_topics : [],
          content_type_categories: Array.isArray(parsed.content_type_categories)
            ? parsed.content_type_categories
            : ["other"],
          difficulty_level: parsed.difficulty_level || "intermediate",
          target_audience: parsed.target_audience || "both",
          campaign_themes: Array.isArray(parsed.campaign_themes)
            ? parsed.campaign_themes
            : ["fantasy"],
          recommended_campaign_types: Array.isArray(
            parsed.recommended_campaign_types
          )
            ? parsed.recommended_campaign_types
            : ["general"],
          content_quality_score:
            typeof parsed.content_quality_score === "number"
              ? parsed.content_quality_score
              : 5,
        };
      }

      // Fallback if no JSON found
      throw new Error("No structured JSON response found in AutoRAG output");
    } catch (error) {
      console.error(
        "[FileAnalysisService] Failed to parse AutoRAG response:",
        error
      );
      throw new Error(
        `Failed to parse AutoRAG analysis response: ${error instanceof Error ? error.message : "Invalid format"}`
      );
    }
  }
}
