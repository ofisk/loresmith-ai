import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, type ToolResult } from "../../app-constants";
import { authenticatedFetch, handleAuthError } from "../../lib/tool-auth";
import { AUTH_CODES } from "../../shared-config";
import {
	commonSchemas,
	createToolError,
	createToolSuccess,
	extractUsernameFromJwt,
	type ToolExecuteOptions,
} from "../utils";

const searchFileLibrarySchema = z.object({
	query: z.string().describe("The search query to find relevant PDF resources"),
	context: z
		.string()
		.optional()
		.describe("Additional context about what the user is looking for"),
	limit: z
		.number()
		.optional()
		.describe("Maximum number of results to return (default: 5)"),
	jwt: commonSchemas.jwt,
});

// file library tools

export const searchFileLibrary = tool({
	description:
		"Search through the user's file library for resources relevant to campaign planning, world-building, or specific topics",
	inputSchema: searchFileLibrarySchema,
	execute: async (
		input: z.infer<typeof searchFileLibrarySchema>,
		options: ToolExecuteOptions
	): Promise<ToolResult> => {
		const { query, context, limit = 5, jwt } = input;
		console.log("[Tool] searchFileLibrary received query:", query);
		console.log("[Tool] searchFileLibrary options:", options);

		const toolCallId = options?.toolCallId ?? "unknown";
		console.log("[searchFileLibrary] Using toolCallId:", toolCallId);

		try {
			console.log("[searchFileLibrary] Using JWT:", jwt);

			const searchQuery = context ? `${query} ${context}` : query;
			const searchUrl = new URL(
				API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.LIBRARY.SEARCH)
			);
			searchUrl.searchParams.set("q", searchQuery);
			searchUrl.searchParams.set("limit", limit.toString());

			const response = await fetch(searchUrl.toString(), {
				method: "GET",
				headers: {
					...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
				},
			});

			console.log("[searchFileLibrary] Response status:", response.status);
			if (!response.ok) {
				const errorText = await response.text();
				console.error("[searchFileLibrary] Error response:", errorText);
				return createToolError(
					`Failed to search file library: ${response.status} - ${errorText}`,
					{ error: `HTTP ${response.status}` },
					AUTH_CODES.ERROR,
					toolCallId
				);
			}

			const result = (await response.json()) as {
				success: boolean;
				results: Array<{
					file_key: string;
					file_name: string;
					description?: string;
					tags?: string[];
					file_size: number;
					created_at: string;
					status: string;
				}>;
				query: string;
				pagination: {
					limit: number;
					offset: number;
					total: number;
				};
			};

			if (!result.results || result.results.length === 0) {
				return createToolSuccess(
					"No relevant resources found in your file library for this query.",
					{ results: [], empty: true },
					toolCallId
				);
			}

			// Format results for better presentation
			const formattedResults = result.results.map((file) => ({
				fileName: file.file_name,
				fileKey: file.file_key,
				description: file.description || "No description available",
				tags: file.tags || [],
				fileSize: file.file_size,
				status: file.status,
				createdAt: file.created_at,
			}));

			return createToolSuccess(
				`Found ${formattedResults.length} relevant resources in your file library: ${formattedResults.map((r) => r.fileName).join(", ")}`,
				{
					results: formattedResults,
					empty: false,
					count: formattedResults.length,
					query,
				},
				toolCallId
			);
		} catch (error) {
			console.error("Error searching file library:", error);
			return createToolError(
				`Failed to search file library: ${error instanceof Error ? error.message : String(error)}`,
				{ error: error instanceof Error ? error.message : String(error) },
				AUTH_CODES.ERROR,
				toolCallId
			);
		}
	},
});

const getFileLibraryStatsSchema = z.object({
	jwt: commonSchemas.jwt,
});

export const getFileLibraryStats = tool({
	description:
		"Get statistics about the user's file library to understand available resources",
	inputSchema: getFileLibraryStatsSchema,
	execute: async (
		input: z.infer<typeof getFileLibraryStatsSchema>,
		options: ToolExecuteOptions
	): Promise<ToolResult> => {
		const { jwt } = input;
		const toolCallId = options?.toolCallId ?? "unknown";
		console.log("[Tool] getFileLibraryStats received JWT:", jwt);
		console.log("[Tool] getFileLibraryStats options:", options);
		console.log("[getFileLibraryStats] Using toolCallId:", toolCallId);

		try {
			console.log("[getFileLibraryStats] Using JWT:", jwt);

			const response = await fetch(
				API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.LIBRARY.FILES),
				{
					method: "GET",
					headers: {
						...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
					},
				}
			);

			console.log("[getFileLibraryStats] Response status:", response.status);
			if (!response.ok) {
				const errorText = await response.text();
				console.error("[getFileLibraryStats] Error response:", errorText);
				return createToolError(
					`Failed to get file library stats: ${response.status} - ${errorText}`,
					{ error: `HTTP ${response.status}` },
					AUTH_CODES.ERROR,
					toolCallId
				);
			}

			const result = (await response.json()) as {
				success: boolean;
				files: Array<{
					file_key: string;
					file_name: string;
					description?: string;
					tags?: string[];
					file_size: number;
					created_at: string;
					status: string;
				}>;
				pagination: {
					limit: number;
					offset: number;
					total: number;
				};
			};

			if (!result.files || result.files.length === 0) {
				return createToolSuccess(
					"Your file library is empty. Consider uploading some game resources to get started with campaign planning!",
					{ files: [], empty: true },
					toolCallId
				);
			}

			// Analyze the library for campaign planning insights
			const totalFiles = result.files.length;
			const totalSize = result.files.reduce(
				(sum, file) => sum + (file.file_size || 0),
				0
			);
			const processedFiles = result.files.filter(
				(file) => file.status === "completed" || file.status === "processed"
			).length;

			// Categorize files by tags and descriptions
			const categories = result.files.reduce(
				(acc, file) => {
					const tags = file.tags || [];
					const description = file.description || "";
					const fileName = file.file_name.toLowerCase();

					// Simple categorization logic
					if (
						tags.some((tag) => tag.toLowerCase().includes("monster")) ||
						description.toLowerCase().includes("monster") ||
						fileName.includes("monster")
					) {
						acc.monsters = (acc.monsters || 0) + 1;
					}
					if (
						tags.some((tag) => tag.toLowerCase().includes("spell")) ||
						description.toLowerCase().includes("spell") ||
						fileName.includes("spell")
					) {
						acc.spells = (acc.spells || 0) + 1;
					}
					if (
						tags.some((tag) => tag.toLowerCase().includes("adventure")) ||
						description.toLowerCase().includes("adventure") ||
						fileName.includes("adventure")
					) {
						acc.adventures = (acc.adventures || 0) + 1;
					}
					if (
						tags.some((tag) => tag.toLowerCase().includes("world")) ||
						description.toLowerCase().includes("world") ||
						fileName.includes("world")
					) {
						acc.worldBuilding = (acc.worldBuilding || 0) + 1;
					}
					return acc;
				},
				{} as Record<string, number>
			);

			return createToolSuccess(
				`Your file library contains ${totalFiles} files (${processedFiles} processed) with ${(totalSize / 1024 / 1024).toFixed(1)}MB of content. Available categories: ${Object.entries(
					categories
				)
					.map(([cat, count]) => `${cat} (${count})`)
					.join(", ")}`,
				{
					files: result.files,
					empty: false,
					stats: {
						totalFiles,
						processedFiles,
						totalSizeMB: totalSize / 1024 / 1024,
						categories,
					},
				},
				toolCallId
			);
		} catch (error) {
			console.error("Error getting file library stats:", error);
			return createToolError(
				`Failed to get file library stats: ${error instanceof Error ? error.message : String(error)}`,
				{ error: error instanceof Error ? error.message : String(error) },
				AUTH_CODES.ERROR,
				toolCallId
			);
		}
	},
});

const uploadInspirationImageSchema = z.object({
	campaignId: commonSchemas.campaignId,
	fileName: z.string().describe("Image filename (jpg, jpeg, png, or webp)"),
	fileContentBase64: z
		.string()
		.describe("Base64-encoded image content to upload"),
	contentType: z
		.enum(["image/jpeg", "image/png", "image/webp"])
		.optional()
		.describe(
			"Optional explicit MIME type; inferred from filename when omitted"
		),
	description: z
		.string()
		.optional()
		.describe("Optional user-supplied description for the inspiration image"),
	tags: z
		.array(z.string())
		.optional()
		.describe("Optional tags to save with the uploaded inspiration image"),
	jwt: commonSchemas.jwt,
});

function inferImageContentType(fileName: string): string | null {
	const lower = fileName.toLowerCase();
	if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
	if (lower.endsWith(".png")) return "image/png";
	if (lower.endsWith(".webp")) return "image/webp";
	return null;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
	const normalized = base64.includes(",") ? base64.split(",")[1] : base64;
	const binary = atob(normalized);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes.buffer;
}

function isImageFileName(fileName: string): boolean {
	const lower = fileName.toLowerCase();
	return (
		lower.endsWith(".jpg") ||
		lower.endsWith(".jpeg") ||
		lower.endsWith(".png") ||
		lower.endsWith(".webp")
	);
}

export const uploadInspirationImageTool = tool({
	description:
		"Upload a visual inspiration image, trigger indexing, and attach it to a campaign resource list.",
	inputSchema: uploadInspirationImageSchema,
	execute: async (
		input: z.infer<typeof uploadInspirationImageSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const {
			campaignId,
			fileName,
			fileContentBase64,
			contentType,
			description,
			tags = [],
			jwt,
		} = input;
		const toolCallId = options?.toolCallId ?? "unknown";

		try {
			if (!isImageFileName(fileName)) {
				return createToolError(
					"Invalid image file type",
					"Only jpg, jpeg, png, and webp files are supported.",
					400,
					toolCallId
				);
			}

			const userId = extractUsernameFromJwt(jwt);
			if (!userId) {
				return createToolError(
					"Invalid authentication token",
					"Authentication failed",
					401,
					toolCallId
				);
			}

			const resolvedContentType =
				contentType || inferImageContentType(fileName);
			if (!resolvedContentType) {
				return createToolError(
					"Could not determine image content type",
					"Provide a supported image extension or contentType",
					400,
					toolCallId
				);
			}

			const uploadResponse = await fetch(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.UPLOAD.DIRECT(
						encodeURIComponent(userId),
						encodeURIComponent(fileName)
					)
				),
				{
					method: "PUT",
					headers: {
						Authorization: jwt ? `Bearer ${jwt}` : "",
						"Content-Type": resolvedContentType,
					},
					body: base64ToArrayBuffer(fileContentBase64),
				}
			);

			if (!uploadResponse.ok) {
				const authError = handleAuthError(uploadResponse);
				if (authError) {
					return createToolError(
						authError,
						"Authentication failed",
						uploadResponse.status,
						toolCallId
					);
				}
				return createToolError(
					"Failed to upload inspiration image",
					await uploadResponse.text(),
					uploadResponse.status,
					toolCallId
				);
			}

			const uploadData = (await uploadResponse.json()) as {
				key: string;
				size: number;
			};

			if (description || tags.length > 0) {
				await authenticatedFetch(
					API_CONFIG.buildUrl(
						API_CONFIG.ENDPOINTS.LIBRARY.UPDATE_METADATA(uploadData.key)
					),
					{
						method: "PUT",
						jwt,
						body: JSON.stringify({
							display_name: fileName,
							description: description ?? "",
							tags,
						}),
					}
				);
			}

			const attachResponse = await authenticatedFetch(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE(campaignId)
				),
				{
					method: "POST",
					jwt,
					body: JSON.stringify({
						type: "document",
						id: uploadData.key,
						name: fileName,
					}),
				}
			);

			if (!attachResponse.ok) {
				const authError = handleAuthError(attachResponse);
				if (authError) {
					return createToolError(
						authError,
						"Authentication failed",
						attachResponse.status,
						toolCallId
					);
				}
				return createToolError(
					"Image uploaded but could not attach to campaign",
					await attachResponse.text(),
					attachResponse.status,
					toolCallId
				);
			}

			return createToolSuccess(
				`Uploaded inspiration image "${fileName}" and linked it to the campaign.`,
				{
					campaignId,
					fileKey: uploadData.key,
					fileName,
					fileSize: uploadData.size,
					contentType: resolvedContentType,
					processing: "scheduled",
				},
				toolCallId
			);
		} catch (error) {
			console.error("[uploadInspirationImageTool] Error:", error);
			return createToolError(
				"Failed to upload inspiration image",
				error instanceof Error ? error.message : String(error),
				500,
				toolCallId
			);
		}
	},
});

const searchVisualInspirationSchema = z.object({
	query: z.string().describe("Search query for visual mood, style, or setting"),
	context: z.string().optional().describe("Optional extra search context"),
	limit: z
		.number()
		.min(1)
		.max(20)
		.optional()
		.describe("Maximum number of results to return (default: 5)"),
	jwt: commonSchemas.jwt,
});

export const searchVisualInspirationTool = tool({
	description:
		"Search uploaded visual inspiration references by mood, setting, color palette, and style.",
	inputSchema: searchVisualInspirationSchema,
	execute: async (
		input: z.infer<typeof searchVisualInspirationSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const { query, context, limit = 5, jwt } = input;
		const toolCallId = options?.toolCallId ?? "unknown";

		try {
			const searchQuery = context ? `${query} ${context}` : query;
			const searchUrl = new URL(
				API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.LIBRARY.SEARCH)
			);
			searchUrl.searchParams.set("q", searchQuery);
			searchUrl.searchParams.set("limit", limit.toString());
			searchUrl.searchParams.set("includeSemantic", "true");

			const response = await authenticatedFetch(searchUrl.toString(), {
				method: "GET",
				jwt,
			});

			if (!response.ok) {
				const authError = handleAuthError(response);
				if (authError) {
					return createToolError(
						authError,
						"Authentication failed",
						response.status,
						toolCallId
					);
				}
				return createToolError(
					"Failed to search visual inspiration",
					await response.text(),
					response.status,
					toolCallId
				);
			}

			const result = (await response.json()) as {
				results?: Array<{
					file_key: string;
					file_name: string;
					description?: string;
					tags?: string[];
					file_size: number;
					created_at: string;
					status: string;
				}>;
			};

			const visualResults = (result.results || []).filter((file) =>
				isImageFileName(file.file_name)
			);

			if (visualResults.length === 0) {
				return createToolSuccess(
					"No matching visual inspiration references were found.",
					{ results: [], empty: true, query },
					toolCallId
				);
			}

			return createToolSuccess(
				`Found ${visualResults.length} visual inspiration reference(s).`,
				{
					results: visualResults.map((file) => ({
						fileName: file.file_name,
						fileKey: file.file_key,
						description: file.description || "",
						tags: file.tags || [],
						status: file.status,
						fileSize: file.file_size,
						createdAt: file.created_at,
					})),
					empty: false,
					count: visualResults.length,
					query,
				},
				toolCallId
			);
		} catch (error) {
			console.error("[searchVisualInspirationTool] Error:", error);
			return createToolError(
				"Failed to search visual inspiration",
				error instanceof Error ? error.message : String(error),
				500,
				toolCallId
			);
		}
	},
});
