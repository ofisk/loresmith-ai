import type { FileDAO } from "@/dao/file-dao";
import type { FileAnalysisService } from "./file-analysis-service";

export interface FileAnalysisOrchestratorConfig {
  autoTriggerAnalysis: boolean;
  batchSize: number;
  delayBetweenBatches: number;
}

export interface FileAnalysisResult {
  status: "completed" | "waiting_for_indexing" | "failed";
  fileKey: string;
  error?: string;
  analysis?: {
    content_summary: string;
    key_topics: string[];
    content_type_categories: string[];
    difficulty_level: string;
    target_audience: string;
    campaign_themes: string[];
    recommended_campaign_types: string[];
    content_quality_score: number;
  };
}

export interface BatchAnalysisResult {
  totalFiles: number;
  analyzedCount: number;
  waitingCount: number;
  errorCount: number;
}

export class FileAnalysisOrchestrator {
  private fileAnalysisService: FileAnalysisService;
  private fileDAO: FileDAO;
  private config: FileAnalysisOrchestratorConfig;

  constructor(
    fileAnalysisService: FileAnalysisService,
    fileDAO: FileDAO,
    config: Partial<FileAnalysisOrchestratorConfig> = {}
  ) {
    this.fileAnalysisService = fileAnalysisService;
    this.fileDAO = fileDAO;
    this.config = {
      autoTriggerAnalysis: true,
      batchSize: 5,
      delayBetweenBatches: 1000,
      ...config,
    };
  }

  /**
   * Core file analysis method - processes a single file
   * This is the foundation that all other methods build upon
   */
  async analyzeFile(
    fileKey: string,
    username: string
  ): Promise<FileAnalysisResult> {
    try {
      // Get file metadata
      const file = await this.fileDAO.getFileMetadata(fileKey);
      if (!file) {
        console.warn(
          `[FileAnalysisOrchestrator] File ${fileKey} not found for user ${username}`
        );
        return { status: "failed", fileKey, error: "File not found" };
      }

      // Update status to analyzing
      await this.fileDAO.updateEnhancedMetadata(fileKey, username, {
        analysis_status: "analyzing",
      });

      // Perform the analysis
      const analysisRequest = {
        fileKey,
        filename: file.file_name,
        description: file.description,
        tags: file.tags,
        username,
      };

      const analysisResult =
        await this.fileAnalysisService.analyzeFile(analysisRequest);

      // Store the analysis results and update status in a single operation
      await this.fileDAO.updateEnhancedMetadata(fileKey, username, {
        ...analysisResult,
        analysis_status: "completed",
      });

      console.log(
        `[FileAnalysisOrchestrator] Successfully analyzed file ${fileKey}`
      );
      return {
        status: "completed",
        fileKey,
        analysis: analysisResult,
      };
    } catch (error) {
      console.error(
        `[FileAnalysisOrchestrator] Error analyzing file ${fileKey}:`,
        error
      );

      // Update status to failed with error details
      try {
        await this.fileDAO.updateEnhancedMetadata(fileKey, username, {
          analysis_status: "failed",
          analysis_error:
            error instanceof Error ? error.message : "Unknown error",
        });
      } catch (dbError) {
        console.error(
          `[FileAnalysisOrchestrator] Failed to update error status for ${fileKey}:`,
          dbError
        );
      }

      return {
        status: "failed",
        fileKey,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Analyze multiple files in batches
   * This is the core batch processing method used by all batch operations
   */
  async analyzeFiles(
    fileKeys: string[],
    username: string
  ): Promise<BatchAnalysisResult> {
    if (!this.config.autoTriggerAnalysis) {
      console.log(
        `[FileAnalysisOrchestrator] Auto-analysis disabled for user ${username}`
      );
      return {
        totalFiles: 0,
        analyzedCount: 0,
        waitingCount: 0,
        errorCount: 0,
      };
    }

    if (fileKeys.length === 0) {
      console.log(
        `[FileAnalysisOrchestrator] No file keys provided for analysis`
      );
      return {
        totalFiles: 0,
        analyzedCount: 0,
        waitingCount: 0,
        errorCount: 0,
      };
    }

    try {
      console.log(
        `[FileAnalysisOrchestrator] Starting analysis for ${fileKeys.length} files for user ${username}`
      );

      let analyzedCount = 0;
      let waitingCount = 0;
      let errorCount = 0;

      // Process files in batches to avoid overwhelming the system
      for (let i = 0; i < fileKeys.length; i += this.config.batchSize) {
        const batch = fileKeys.slice(i, i + this.config.batchSize);

        const batchResults = await Promise.allSettled(
          batch.map((fileKey) => this.analyzeFile(fileKey, username))
        );

        // Count results
        batchResults.forEach((result) => {
          if (result.status === "fulfilled") {
            switch (result.value.status) {
              case "completed":
                analyzedCount++;
                break;
              case "waiting_for_indexing":
                waitingCount++;
                break;
              case "failed":
                errorCount++;
                break;
            }
          } else {
            errorCount++;
          }
        });

        // Small delay between batches
        if (i + this.config.batchSize < fileKeys.length) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.config.delayBetweenBatches)
          );
        }
      }

      console.log(
        `[FileAnalysisOrchestrator] Analysis completed for user ${username}: ${analyzedCount} analyzed, ${waitingCount} waiting, ${errorCount} failed`
      );

      return {
        totalFiles: fileKeys.length,
        analyzedCount,
        waitingCount,
        errorCount,
      };
    } catch (error) {
      console.error(
        `[FileAnalysisOrchestrator] Error analyzing files for user ${username}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Trigger analysis for files that have been successfully indexed
   * This is called after indexing completes
   */
  async triggerAnalysisForIndexedFiles(
    username: string
  ): Promise<BatchAnalysisResult> {
    if (!this.config.autoTriggerAnalysis) {
      console.log(
        `[FileAnalysisOrchestrator] Auto-analysis disabled for user ${username}`
      );
      return {
        totalFiles: 0,
        analyzedCount: 0,
        waitingCount: 0,
        errorCount: 0,
      };
    }

    try {
      console.log(
        `[FileAnalysisOrchestrator] Starting analysis for indexed files for user ${username}`
      );

      // Get all files that are pending analysis
      const pendingFiles = await this.fileDAO.getFilesPendingAnalysis(username);

      if (pendingFiles.length === 0) {
        console.log(
          `[FileAnalysisOrchestrator] No files pending analysis for user ${username}`
        );
        return {
          totalFiles: 0,
          analyzedCount: 0,
          waitingCount: 0,
          errorCount: 0,
        };
      }

      console.log(
        `[FileAnalysisOrchestrator] Found ${pendingFiles.length} files pending analysis for user ${username}`
      );

      // Extract file keys and use the batch processor
      const fileKeys = pendingFiles.map((file) => file.file_key);
      const result = await this.analyzeFiles(fileKeys, username);

      console.log(
        `[FileAnalysisOrchestrator] Analysis completed for user ${username}: ${result.analyzedCount} analyzed, ${result.waitingCount} waiting, ${result.errorCount} failed`
      );

      return result;
    } catch (error) {
      console.error(
        `[FileAnalysisOrchestrator] Error triggering analysis for user ${username}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get analysis statistics for a user
   */
  async getAnalysisStats(username: string): Promise<{
    total: number;
    completed: number;
    analyzing: number;
    waiting: number;
    failed: number;
    pending: number;
  }> {
    try {
      const allFiles = await this.fileDAO.getFilesByUser(username);

      const stats = {
        total: allFiles.length,
        completed: 0,
        analyzing: 0,
        waiting: 0,
        failed: 0,
        pending: 0,
      };

      allFiles.forEach((file) => {
        const status = file.analysis_status || "pending";
        switch (status) {
          case "completed":
            stats.completed++;
            break;
          case "analyzing":
            stats.analyzing++;
            break;
          case "waiting_for_indexing":
            stats.waiting++;
            break;
          case "failed":
            stats.failed++;
            break;
          default:
            stats.pending++;
            break;
        }
      });

      return stats;
    } catch (error) {
      console.error(
        `[FileAnalysisOrchestrator] Error getting analysis stats for user ${username}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Retry failed analyses for a user
   * This leverages the existing batch processing infrastructure
   */
  async retryFailedAnalyses(username: string): Promise<{
    retriedCount: number;
    successCount: number;
    errorCount: number;
  }> {
    try {
      // Get files with failed analysis status
      const allFiles = await this.fileDAO.getFilesByUser(username);
      const failedFiles = allFiles.filter(
        (file) => file.analysis_status === "failed"
      );

      if (failedFiles.length === 0) {
        return { retriedCount: 0, successCount: 0, errorCount: 0 };
      }

      console.log(
        `[FileAnalysisOrchestrator] Retrying analysis for ${failedFiles.length} failed files for user ${username}`
      );

      // Reset status to pending for retry in parallel
      await Promise.all(
        failedFiles.map((file) =>
          this.fileDAO.updateEnhancedMetadata(file.file_key, username, {
            analysis_status: "pending",
            analysis_error: undefined,
          })
        )
      );

      // Extract file keys and use the batch processing infrastructure
      const fileKeys = failedFiles.map((file) => file.file_key);
      const results = await this.analyzeFiles(fileKeys, username);

      return {
        retriedCount: failedFiles.length,
        successCount: results.analyzedCount,
        errorCount: results.errorCount,
      };
    } catch (error) {
      console.error(
        `[FileAnalysisOrchestrator] Error retrying failed analyses for user ${username}:`,
        error
      );
      throw error;
    }
  }
}
