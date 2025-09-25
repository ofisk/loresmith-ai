import { API_CONFIG } from "../../shared-config";

export interface FileRecommendationFilters {
  content_type_category?: string;
  difficulty_level?: string;
  target_audience?: string;
  campaign_themes?: string[];
  min_quality_score?: number;
  limit?: number;
}

export interface FileRecommendation {
  file_key: string;
  filename: string;
  description?: string;
  content_summary?: string;
  content_type_categories?: string[];
  difficulty_level?: string;
  target_audience?: string;
  campaign_themes?: string[];
  recommended_campaign_types?: string[];
  content_quality_score?: number;
  tags: string[];
  created_at: string;
}

export interface FileRecommendationResponse {
  recommendations: FileRecommendation[];
  total_count: number;
  filters_applied: FileRecommendationFilters;
}

/**
 * Tool for getting file recommendations based on enhanced metadata
 * This tool helps agents suggest relevant resources to users for their campaigns
 */
//TODO: revisit recommendations parameters
export const getFileRecommendations = {
  name: "getFileRecommendations",
  description:
    "Get file recommendations based on content analysis and metadata. Use this to suggest relevant resources to users for their campaigns.",
  parameters: {
    type: "object",
    properties: {
      content_type_categories: {
        type: "string",
        description:
          "Filter by content types (e.g., 'map' to find files containing maps, 'character' for character resources, etc.)",
      },
      difficulty_level: {
        type: "string",
        description:
          "Filter by difficulty level (beginner, intermediate, advanced, or expert)",
        enum: ["beginner", "intermediate", "advanced", "expert"],
      },
      target_audience: {
        type: "string",
        description: "Filter by target audience (players, dms, or both)",
        enum: ["players", "dms", "both"],
      },
      campaign_themes: {
        type: "array",
        items: { type: "string" },
        description:
          "Filter by campaign themes (e.g., fantasy, sci-fi, horror, mystery)",
      },
      min_quality_score: {
        type: "number",
        description: "Minimum content quality score (1-10)",
        minimum: 1,
        maximum: 10,
      },
      limit: {
        type: "number",
        description: "Maximum number of recommendations to return",
        minimum: 1,
        maximum: 50,
        default: 10,
      },
    },
  },
  execute: async (args: FileRecommendationFilters, options: any) => {
    const jwt = options.jwt;
    try {
      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.FILE_ANALYSIS.RECOMMENDATIONS),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify(args),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to get file recommendations: ${response.status} ${errorText}`
        );
      }

      const result: FileRecommendationResponse = await response.json();

      return {
        success: true,
        recommendations: result.recommendations,
        total_count: result.total_count,
        filters_applied: args,
        message: `Found ${result.recommendations.length} file recommendations based on your criteria.`,
      };
    } catch (error) {
      console.error(
        "[FileRecommendationTool] Error getting recommendations:",
        error
      );
      return {
        success: false,
        error: `Failed to get file recommendations: ${error instanceof Error ? error.message : "Unknown error"}`,
        recommendations: [],
        total_count: 0,
        filters_applied: args,
      };
    }
  },
};

/**
 * Tool for getting analysis status of files
 * This tool helps agents understand which files have been analyzed and are ready for recommendations
 */
export const getFileAnalysisStatus = {
  name: "getFileAnalysisStatus",
  description:
    "Get the analysis status of files to understand which resources are ready for recommendations.",
  parameters: {
    type: "object",
    properties: {
      file_key: {
        type: "string",
        description: "The file key to check analysis status for",
      },
    },
    required: ["file_key"],
  },
  execute: async (args: { file_key: string }, { jwt }: { jwt: string }) => {
    try {
      const response = await fetch(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.FILE_ANALYSIS.STATUS(args.file_key)
        ),
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${jwt}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to get file analysis status: ${response.status} ${errorText}`
        );
      }

      const result = (await response.json()) as any;

      return {
        success: true,
        file_key: result.file_key,
        status: result.status,
        last_analyzed_at: result.last_analyzed_at,
        error: result.analysis_error,
        message: `File ${args.file_key} has analysis status: ${result.status}`,
      };
    } catch (error) {
      console.error("[FileAnalysisStatusTool] Error getting status:", error);
      return {
        success: false,
        error: `Failed to get file analysis status: ${error instanceof Error ? error.message : "Unknown error"}`,
        file_key: args.file_key,
        status: "unknown",
      };
    }
  },
};

/**
 * Tool for triggering file analysis
 * This tool helps agents trigger analysis for files that haven't been analyzed yet
 */
export const triggerFileAnalysis = {
  name: "triggerFileAnalysis",
  description:
    "Trigger analysis for a specific file to generate enhanced metadata for recommendations.",
  parameters: {
    type: "object",
    properties: {
      file_key: {
        type: "string",
        description: "The file key to analyze",
      },
    },
    required: ["file_key"],
  },
  execute: async (args: { file_key: string }, { jwt }: { jwt: string }) => {
    try {
      const response = await fetch(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.FILE_ANALYSIS.ANALYZE(args.file_key)
        ),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${jwt}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to trigger file analysis: ${response.status} ${errorText}`
        );
      }

      const result = (await response.json()) as any;

      return {
        success: true,
        file_key: args.file_key,
        status: result.status,
        message:
          result.message || `Analysis triggered for file ${args.file_key}`,
        analysis: result.analysis,
      };
    } catch (error) {
      console.error(
        "[FileAnalysisTriggerTool] Error triggering analysis:",
        error
      );
      return {
        success: false,
        error: `Failed to trigger file analysis: ${error instanceof Error ? error.message : "Unknown error"}`,
        file_key: args.file_key,
        status: "failed",
      };
    }
  },
};

export const fileRecommendationTools = [
  getFileRecommendations,
  getFileAnalysisStatus,
  triggerFileAnalysis,
];
