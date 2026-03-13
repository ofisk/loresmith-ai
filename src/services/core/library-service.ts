import { getDAOFactory } from "@/dao/dao-factory";
import {
	FileNotFoundError,
	LLMProviderAPIKeyError,
	MemoryLimitError,
	PDFExtractionError,
	StorageUsageError,
} from "@/lib/errors";
import type { Env } from "@/middleware/auth";
import { getSubscriptionService } from "@/services/billing/subscription-service";
import type { FileMetadata } from "@/types/upload";

export interface StorageUsage {
	username: string;
	totalBytes: number;
	fileCount: number;
	isAdmin: boolean;
	limitBytes: number;
	remainingBytes: number;
	usagePercentage: number;
}

export interface ProcessingResult {
	success: boolean;
	metadata?: {
		description: string;
		tags: string[];
	};
	vectorId?: string;
	error?: string;
	errorDetails?: string;
}

export interface ProcessingOptions {
	generateMetadata?: boolean;
	storeEmbeddings?: boolean;
	updateStatus?: boolean;
}

export class LibraryService {
	private readonly env: Env;

	constructor(env: Env) {
		this.env = env;
	}

	/**
	 * Get storage usage for a user
	 */
	async getUserStorageUsage(
		username: string,
		isAdmin: boolean
	): Promise<StorageUsage> {
		try {
			const fileDAO = getDAOFactory(this.env).fileDAO;

			// Storage usage only needs file_size + status; keep this query minimal and robust.
			const files = await fileDAO.getUserFilesForStorageUsage(username);

			// Calculate total bytes and file count (excluding error status)
			const validFiles = files.filter((file: any) => file.status !== "error");
			const totalBytes = validFiles.reduce(
				(sum: number, file: any) => sum + (file.file_size || 0),
				0
			);
			const fileCount = validFiles.length;

			// Admin users have unlimited storage; others use tier-based limits
			const subService = getSubscriptionService(this.env);
			const tier = await subService.getTier(username, isAdmin);
			const limits = subService.getTierLimits(tier);
			const limitBytes = isAdmin ? Infinity : limits.storageBytes;
			const remainingBytes = isAdmin
				? Infinity
				: Math.max(0, limitBytes - totalBytes);
			const usagePercentage = isAdmin ? 0 : (totalBytes / limitBytes) * 100;

			return {
				username,
				totalBytes,
				fileCount,
				isAdmin,
				limitBytes,
				remainingBytes,
				usagePercentage,
			};
		} catch (_error) {
			throw new StorageUsageError();
		}
	}

	/**
	 * Check if user can upload a file of given size
	 */
	async canUploadFile(
		username: string,
		fileSizeBytes: number,
		isAdmin: boolean
	): Promise<{
		canUpload: boolean;
		reason?: string;
		currentUsage: StorageUsage;
	}> {
		const currentUsage = await this.getUserStorageUsage(username, isAdmin);

		if (isAdmin) {
			return {
				canUpload: true,
				currentUsage,
			};
		}

		const subService = getSubscriptionService(this.env);
		const tier = await subService.getTier(username, isAdmin);
		const limits = subService.getTierLimits(tier);

		// Check file count limit
		if (currentUsage.fileCount >= limits.maxFiles) {
			return {
				canUpload: false,
				reason: `File limit (${limits.maxFiles}) reached. Upgrade for more files.`,
				currentUsage,
			};
		}

		// Check storage limit
		const wouldExceedLimit =
			currentUsage.totalBytes + fileSizeBytes > limits.storageBytes;

		if (wouldExceedLimit) {
			return {
				canUpload: false,
				reason: `Upload would exceed your ${this.formatBytes(limits.storageBytes)} storage limit. Current usage: ${this.formatBytes(currentUsage.totalBytes)}`,
				currentUsage,
			};
		}

		return {
			canUpload: true,
			currentUsage,
		};
	}

	/**
	 * Format bytes to human readable format
	 */
	private formatBytes(bytes: number): string {
		if (bytes === 0) return "0 B";
		const k = 1024;
		const sizes = ["B", "KB", "MB", "GB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
	}

	/**
	 * Get storage usage for all users (admin only)
	 */
	async getAllUsersStorageUsage(): Promise<StorageUsage[]> {
		try {
			const fileDAO = getDAOFactory(this.env).fileDAO;

			// Get all files and group by username
			const allFiles = await fileDAO.getAllFilesForStorageUsage();

			// Group files by username and calculate usage
			const userUsageMap = new Map<
				string,
				{ totalBytes: number; fileCount: number }
			>();

			allFiles.forEach((file: any) => {
				if (file.status === "error") return; // Skip error files

				const current = userUsageMap.get(file.username) || {
					totalBytes: 0,
					fileCount: 0,
				};
				current.totalBytes += file.file_size || 0;
				current.fileCount += 1;
				userUsageMap.set(file.username, current);
			});

			const entries = Array.from(userUsageMap.entries());
			const results = await Promise.all(
				entries.map(async ([username, usage]) => {
					// Admin users are managed directly in the users table (is_admin).
					// For this summary, we don't attempt to look up per-user admin flags.
					const isAdmin = false; // Default to false for now

					const totalBytes = usage.totalBytes;
					const fileCount = usage.fileCount;
					const subService = getSubscriptionService(this.env);
					const tier = await subService.getTier(username);
					const limits = subService.getTierLimits(tier);
					const limitBytes = isAdmin ? Infinity : limits.storageBytes;
					const remainingBytes = isAdmin
						? Infinity
						: Math.max(0, limitBytes - totalBytes);
					const usagePercentage = isAdmin ? 0 : (totalBytes / limitBytes) * 100;

					return {
						username,
						totalBytes,
						fileCount,
						isAdmin,
						limitBytes,
						remainingBytes,
						usagePercentage,
					};
				})
			);
			return results;
		} catch (_error) {
			throw new StorageUsageError();
		}
	}

	/**
	 * Delete a file from storage and database
	 */
	async deleteFile(
		fileKey: string,
		_username: string
	): Promise<{ success: boolean; error?: string }> {
		try {
			const fileDAO = getDAOFactory(this.env).fileDAO;

			// Delete the file using the DAO (this handles database, R2, and vector cleanup)
			await fileDAO.deleteFile(fileKey, this.env.FILE_BUCKET as any);
			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	/**
	 * Process an uploaded file with comprehensive error handling
	 */
	async processUploadedFile(
		fileKey: string,
		username: string,
		options: ProcessingOptions = {}
	): Promise<ProcessingResult> {
		const { updateStatus = true } = options;

		try {
			// Update status to processing if requested
			if (updateStatus) {
				await this.updateProcessingStatus(fileKey, "processing");
			}

			// Get file metadata from database
			const fileMetadata = await this.getFileMetadata(fileKey, username);
			if (!fileMetadata) {
				throw new FileNotFoundError();
			}

			// Update status to processed
			if (updateStatus) {
				await this.updateProcessingStatus(fileKey, "processed");
			}

			return {
				success: true,
				// Processing handles metadata and embeddings
			};
		} catch (error) {
			const errorInfo = this.categorizeError(error as Error);

			// Update status to error
			if (updateStatus) {
				await this.updateProcessingStatus(fileKey, "error");
			}

			return {
				success: false,
				error: errorInfo.message,
				errorDetails: errorInfo.details,
			};
		}
	}

	/**
	 * Update processing status in database
	 */
	async updateProcessingStatus(
		fileKey: string,
		status: string,
		_errorMessage?: string
	): Promise<void> {
		try {
			const fileDAO = getDAOFactory(this.env).fileDAO;
			await fileDAO.updateFileRecord(fileKey, status);
		} catch (_error) {}
	}

	/**
	 * Get file metadata from database
	 */
	private async getFileMetadata(
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
				contentType: "application/pdf",
				description: result.description as string,
				tags: result.tags ? JSON.parse(result.tags as string) : [],
				status: result.status as string,
				createdAt: result.created_at as string,
				updatedAt: result.updated_at as string,
			};
		} catch (_error) {
			return null;
		}
	}

	/**
	 * Categorize and format errors for consistent handling using structured error types
	 */
	private categorizeError(error: Error): { message: string; details: string } {
		// Check for structured error types first
		if (error instanceof FileNotFoundError) {
			return {
				message: "File not found in storage",
				details: "The uploaded file could not be found in storage.",
			};
		}

		if (error instanceof PDFExtractionError) {
			return {
				message: "PDF extraction failed",
				details:
					"The PDF file could not be parsed. It may be encrypted, corrupted, or contain no readable text.",
			};
		}

		if (error instanceof MemoryLimitError) {
			return {
				message: "File too large to process",
				details: error.message,
			};
		}

		if (error instanceof LLMProviderAPIKeyError) {
			return {
				message: "OpenAI API key required",
				details:
					"File processing requires an OpenAI API key for text analysis.",
			};
		}

		// Fallback for unknown errors
		return {
			message: "File processing failed",
			details: error.message,
		};
	}
}
