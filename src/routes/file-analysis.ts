import { Hono } from "hono";
import { FileDAO } from "../dao/file-dao";
import { requireUserJwt } from "../middleware/auth";
import { FileAnalysisOrchestrator } from "../services/file-analysis-orchestrator-service";
import { FileAnalysisService } from "../services/file-analysis-service";
import { API_CONFIG } from "../shared";

const app = new Hono();

/**
 * Analyze a specific file using AutoRAG
 */
app.post(
  API_CONFIG.ENDPOINTS.FILE_ANALYSIS.ANALYZE(":fileKey"),
  requireUserJwt,
  async (c) => {
    try {
      const { fileKey } = c.req.param();
      const username = (c as any).var.userAuth.username;

      console.log(
        `[FileAnalysis] Starting analysis for file ${fileKey}, user: ${username}`
      );

      // Get file metadata
      const fileDAO = new FileDAO(c.env.DB);
      const fileMetadata = await fileDAO.getFileMetadata(fileKey);

      if (!fileMetadata) {
        return c.json({ error: "File not found" }, 404);
      }

      if (fileMetadata.username !== username) {
        return c.json({ error: "Access denied" }, 403);
      }

      // Use the orchestrator for consistent analysis logic
      const analysisService = new FileAnalysisService(c.env);
      const orchestrator = new FileAnalysisOrchestrator(
        analysisService,
        fileDAO
      );

      const result = await orchestrator.analyzeFile(fileKey, username);

      if (result.status === "completed") {
        return c.json({
          status: "completed",
          fileKey,
          analysis: result.analysis,
        });
      } else {
        return c.json(
          {
            status: "failed",
            fileKey,
            error: "Analysis failed",
            details: result.error || "Unknown error",
          },
          500
        );
      }
    } catch (error) {
      console.error(`[FileAnalysis] Error in analyze endpoint:`, error);
      return c.json(
        {
          error: "Internal server error",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  }
);

/**
 * Get analysis status for a file
 */
app.get(
  API_CONFIG.ENDPOINTS.FILE_ANALYSIS.STATUS(":fileKey"),
  requireUserJwt,
  async (c) => {
    try {
      const { fileKey } = c.req.param();
      const username = (c as any).var.userAuth.username;

      const fileDAO = new FileDAO(c.env.DB);
      const status = await fileDAO.getAnalysisStatus(fileKey, username);

      if (!status) {
        return c.json({ error: "File not found" }, 404);
      }

      return c.json({
        fileKey,
        status: status.analysis_status,
        last_analyzed_at: status.last_analyzed_at,
        error: status.analysis_error,
      });
    } catch (error) {
      console.error(`[FileAnalysis] Error in status endpoint:`, error);
      return c.json(
        {
          error: "Internal server error",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  }
);

/**
 * Get files pending analysis
 */
app.get(
  API_CONFIG.ENDPOINTS.FILE_ANALYSIS.PENDING,
  requireUserJwt,
  async (c) => {
    try {
      const username = (c as any).var.userAuth.username;

      const fileDAO = new FileDAO(c.env.DB);
      const pendingFiles = await fileDAO.getFilesPendingAnalysis(username);

      return c.json({
        pending_files: pendingFiles.map((file) => ({
          file_key: file.file_key,
          filename: file.file_name,
          status: file.analysis_status || "pending",
          created_at: file.created_at,
        })),
      });
    } catch (error) {
      console.error(`[FileAnalysis] Error in pending endpoint:`, error);
      return c.json(
        {
          error: "Internal server error",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  }
);

/**
 * Get file recommendations based on filters
 */
app.post(
  API_CONFIG.ENDPOINTS.FILE_ANALYSIS.RECOMMENDATIONS,
  requireUserJwt,
  async (c) => {
    try {
      const username = (c as any).var.userAuth.username;
      const filters = await c.req.json();

      const fileDAO = new FileDAO(c.env.DB);
      const recommendations = await fileDAO.getFilesForRecommendations(
        username,
        filters
      );

      return c.json({
        recommendations: recommendations.map((file) => ({
          file_key: file.file_key,
          filename: file.file_name,
          description: file.description,
          content_summary: file.content_summary,
          content_type_categories: file.content_type_categories,
          difficulty_level: file.difficulty_level,
          target_audience: file.target_audience,
          campaign_themes: file.campaign_themes,
          recommended_campaign_types: file.recommended_campaign_types,
          content_quality_score: file.content_quality_score,
          tags: file.tags,
          created_at: file.created_at,
        })),
      });
    } catch (error) {
      console.error(`[FileAnalysis] Error in recommendations endpoint:`, error);
      return c.json(
        {
          error: "Internal server error",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  }
);

/**
 * Trigger analysis for all pending files (admin/batch operation)
 */
app.post(
  API_CONFIG.ENDPOINTS.FILE_ANALYSIS.ANALYZE_ALL,
  requireUserJwt,
  async (c) => {
    try {
      const username = (c as any).var.userAuth.username;

      const fileDAO = new FileDAO(c.env.DB);
      const pendingFiles = await fileDAO.getFilesPendingAnalysis(username);

      if (pendingFiles.length === 0) {
        return c.json({
          message: "No files pending analysis",
          files_analyzed: 0,
        });
      }

      // Use the orchestrator for consistent batch processing
      const analysisService = new FileAnalysisService(c.env);
      const orchestrator = new FileAnalysisOrchestrator(
        analysisService,
        fileDAO
      );

      const results =
        await orchestrator.triggerAnalysisForIndexedFiles(username);

      return c.json({
        message: "Batch analysis completed",
        total_files: results.totalFiles,
        files_analyzed: results.analyzedCount,
        files_failed: results.errorCount,
        files_waiting: results.waitingCount,
      });
    } catch (error) {
      console.error(`[FileAnalysis] Error in batch analysis endpoint:`, error);
      return c.json(
        {
          error: "Internal server error",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  }
);

export default app;
