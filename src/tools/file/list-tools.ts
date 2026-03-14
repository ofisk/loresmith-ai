import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, type ToolResult } from "@/app-constants";
import { getDAOFactory } from "@/dao/dao-factory";
import { getLibraryService } from "@/lib/service-factory";
import type { Env } from "@/middleware/auth";
import {
	createToolError,
	createToolSuccess,
	getEnvFromContext,
	type ToolExecuteOptions,
} from "@/tools/utils";
import type { FileResponse } from "@/types/file";
import { fileHelpers } from "@/types/file";

const listFilesSchema = z.object({
	jwt: z
		.string()
		.nullable()
		.optional()
		.describe("JWT token for authentication"),
});

export const listFiles = tool({
	description: "List all uploaded files for the current user",
	inputSchema: listFilesSchema,
	execute: async (
		input: z.infer<typeof listFilesSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const { jwt } = input;
		const toolCallId = options?.toolCallId ?? "unknown";
		const env = getEnvFromContext(options);

		try {
			// Extract username from JWT
			let username = "default";
			if (jwt) {
				try {
					const payload = JSON.parse(atob(jwt.split(".")[1]));
					username = payload.username || "default";
				} catch (_error) {}
			}

			// Check if we're running in the Worker environment (have access to env bindings)
			// This determines whether we can make direct service calls or need HTTP requests
			if (env?.DB) {
				// Get files directly from database
				const fileDAO = getDAOFactory(env).fileDAO;
				const files = await fileDAO.getFilesForRag(username);

				if (!files || files.length === 0) {
					return createToolSuccess(
						`No files found for user "${username}". Upload something to get started!`,
						{ files: [], count: 0, username },
						toolCallId
					);
				}

				// Convert SearchResult[] to File[] format for compatibility
				const fileList = files
					.map(
						(file) =>
							`- ${file.file_name} (${(file.file_size / 1024 / 1024).toFixed(2)} MB)`
					)
					.join("\n");

				return createToolSuccess(
					`📄 Found ${files.length} file(s) for user "${username}":\n${fileList}`,
					{
						files: files,
						count: files.length,
						username,
					},
					toolCallId
				);
			}

			const response = await fetch(
				API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.LIBRARY.FILES, env),
				{
					method: "GET",
					headers: {
						"Content-Type": "application/json",
						...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
					},
				}
			);

			if (!response.ok) {
				return createToolError(
					"Failed to list files",
					`HTTP ${response.status}: ${await response.text()}`,
					500,
					toolCallId
				);
			}

			const result = (await response.json()) as FileResponse;

			if (!result.files || result.files.length === 0) {
				return createToolSuccess(
					`No files found for user "${username}". Upload something to get started!`,
					{ files: [], count: 0, username },
					toolCallId
				);
			}

			const fileList = fileHelpers.formatFileList(result.files);

			return createToolSuccess(
				`📄 Found ${result.files.length} file(s) for user "${username}":\n${fileList}`,
				{
					files: result.files,
					count: result.files.length,
					username,
				},
				toolCallId
			);
		} catch (error) {
			return createToolError("Error listing files", error, 500, toolCallId);
		}
	},
});

const deleteFileSchema = z.object({
	fileKey: z.string().describe("The file key of the file to delete"),
	jwt: z
		.string()
		.nullable()
		.optional()
		.describe("JWT token for authentication"),
});

export const deleteFileExecution = async (
	input: z.infer<typeof deleteFileSchema>,
	options?: ToolExecuteOptions
): Promise<ToolResult> => {
	const { fileKey, jwt } = input;

	const toolCallId = options?.toolCallId ?? "unknown";
	const env = getEnvFromContext(options);

	try {
		if (!fileKey) {
			return createToolError(
				"No file key provided for deletion",
				"Missing fileKey",
				400,
				toolCallId
			);
		}

		// Check if we're running in the Worker environment (have access to env bindings)
		if (env?.DB) {
			// Extract username from JWT for database operations
			let username = "anonymous";
			if (jwt) {
				try {
					const payload = JSON.parse(atob(jwt.split(".")[1]));
					username = payload.username || "anonymous";
				} catch (_error) {}
			}

			// Get the library service for direct database access
			const libraryService = getLibraryService(env as Env);

			// Delete the file using the service
			const deleteResult = await libraryService.deleteFile(fileKey, username);

			if (deleteResult.success) {
				return createToolSuccess(
					`Successfully deleted file: ${fileKey}`,
					{ status: "deleted", fileKey, username },
					toolCallId
				);
			} else {
				return createToolError(
					"Failed to delete file from database",
					deleteResult.error || "Unknown error",
					500,
					toolCallId
				);
			}
		}

		const deleteUrl = API_CONFIG.buildUrl(
			API_CONFIG.ENDPOINTS.RAG.DELETE_FILE(fileKey),
			env
		);

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};

		if (jwt) {
			headers.Authorization = `Bearer ${jwt}`;
		}
		const response = await fetch(deleteUrl, {
			method: "DELETE",
			headers,
		});

		if (!response.ok) {
			const errorText = await response.text();

			// If it's a 404, the file might have already been deleted
			if (response.status === 404) {
				return createToolSuccess(
					"File was already deleted or not found",
					{ status: "already_deleted", fileKey },
					toolCallId
				);
			}

			return createToolError(
				"Failed to delete file",
				`HTTP ${response.status}: ${errorText}`,
				500,
				toolCallId
			);
		}

		// Verify the file was actually deleted by trying to list files
		const listResponse = await fetch(
			API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.LIBRARY.FILES, env),
			{
				headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
			}
		);

		if (listResponse.ok) {
			try {
				const responseData = (await listResponse.json()) as any;
				// Handle different response formats
				const files = Array.isArray(responseData)
					? responseData
					: responseData.files || responseData.data || [];

				if (Array.isArray(files)) {
					const fileStillExists = files.some(
						(file: any) => file.file_key === fileKey
					);

					if (fileStillExists) {
						return createToolError(
							"File deletion reported success but file still exists in database",
							"Deletion verification failed",
							500,
							toolCallId
						);
					}
				}
			} catch (_verificationError) {
				// Don't fail the deletion if verification fails
			}
		}

		return createToolSuccess(
			`File "${fileKey}" has been successfully deleted`,
			{ deletedFile: fileKey },
			toolCallId
		);
	} catch (error) {
		return createToolError(
			"Unexpected error during file deletion",
			error,
			500,
			toolCallId
		);
	}
};

export const deleteFile = tool({
	description:
		"Delete a specific file for the current user. This action requires confirmation before execution.",
	inputSchema: deleteFileSchema,
	strict: true,
	execute: deleteFileExecution,
});

const getFileStatsSchema = z.object({
	jwt: z
		.string()
		.nullable()
		.optional()
		.describe("JWT token for authentication"),
});

export const getFileStats = tool({
	description: "Get statistics about uploaded files",
	inputSchema: getFileStatsSchema,
	execute: async (
		input: z.infer<typeof getFileStatsSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const { jwt } = input;
		const toolCallId = options?.toolCallId ?? "unknown";

		try {
			// Call the server endpoint to get actual stats
			const response = await fetch(
				API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.LIBRARY.STATS),
				{
					method: "GET",
					headers: {
						"Content-Type": "application/json",
						...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
					},
				}
			);

			if (!response.ok) {
				return createToolError(
					"Failed to get file stats",
					`HTTP ${response.status}: ${await response.text()}`,
					500,
					toolCallId
				);
			}

			const result = (await response.json()) as {
				username: string;
				totalFiles: number;
				filesByStatus: {
					uploading: number;
					uploaded: number;
					parsing: number;
					parsed: number;
					error: number;
				};
			};

			return createToolSuccess(
				`PDF statistics for user "${result.username}": ${result.totalFiles} files uploaded`,
				{
					totalFiles: result.totalFiles,
					totalSize: 0, // Not calculated in current implementation
					averageFileSize: 0, // Not calculated in current implementation
					username: result.username,
					filesByStatus: result.filesByStatus,
				},
				toolCallId
			);
		} catch (error) {
			return createToolError(
				"Error getting file stats",
				error,
				500,
				toolCallId
			);
		}
	},
});
