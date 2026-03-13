import type { Context } from "hono";
import { FileDAO } from "@/dao";
import type { Env } from "@/routes/env";
import { FileAnalysisOrchestrator } from "@/services/file/file-analysis-orchestrator-service";
import { FileAnalysisService } from "@/services/file/file-analysis-service";

export async function handleAnalyzeFile(c: Context<{ Bindings: Env }>) {
	try {
		const { fileKey } = c.req.param();
		const username = (c as any).var.userAuth.username;

		// Get file metadata
		const fileDAO = new FileDAO(c.env.DB);
		const fileMetadata = await fileDAO.getFileMetadata(fileKey);

		if (!fileMetadata) {
			return c.json({ error: "File not found" }, 404);
		}

		if (fileMetadata.username !== username) {
			return c.json({ error: "Access denied" }, 403);
		}

		const analysisService = new FileAnalysisService(c.env);
		const orchestrator = new FileAnalysisOrchestrator(analysisService, fileDAO);
		const result = await orchestrator.analyzeFile(fileKey, username);

		if (result.status === "completed") {
			return c.json({
				status: "completed",
				fileKey,
				analysis: result.analysis,
			});
		}
		return c.json(
			{
				status: "failed",
				fileKey,
				error: "Analysis failed",
				details: result.error || "Unknown error",
			},
			500
		);
	} catch (error) {
		return c.json(
			{
				error: "Internal server error",
				details: error instanceof Error ? error.message : "Unknown error",
			},
			500
		);
	}
}

export async function handleGetStatus(c: Context<{ Bindings: Env }>) {
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
		return c.json(
			{
				error: "Internal server error",
				details: error instanceof Error ? error.message : "Unknown error",
			},
			500
		);
	}
}

export async function handleGetPending(c: Context<{ Bindings: Env }>) {
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
		return c.json(
			{
				error: "Internal server error",
				details: error instanceof Error ? error.message : "Unknown error",
			},
			500
		);
	}
}

export async function handleGetRecommendations(c: Context<{ Bindings: Env }>) {
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
		return c.json(
			{
				error: "Internal server error",
				details: error instanceof Error ? error.message : "Unknown error",
			},
			500
		);
	}
}

export async function handleAnalyzeAll(c: Context<{ Bindings: Env }>) {
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

		const analysisService = new FileAnalysisService(c.env);
		const orchestrator = new FileAnalysisOrchestrator(analysisService, fileDAO);
		const results = await orchestrator.triggerAnalysisForIndexedFiles(username);

		return c.json({
			message: "Batch analysis completed",
			total_files: results.totalFiles,
			files_analyzed: results.analyzedCount,
			files_failed: results.errorCount,
			files_waiting: results.waitingCount,
		});
	} catch (error) {
		return c.json(
			{
				error: "Internal server error",
				details: error instanceof Error ? error.message : "Unknown error",
			},
			500
		);
	}
}
