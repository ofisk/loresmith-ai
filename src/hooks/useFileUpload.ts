import { useCallback, useState } from "react";
import { PROCESSING_LIMITS } from "@/app-constants";
import type { FileUploadEvent } from "@/lib/event-bus";
import { EVENT_TYPES, useEvent } from "@/lib/event-bus";
import { buildStagingFileKey } from "@/lib/file/file-utils";
import {
	shouldUseLargeFileUpload,
	uploadLargeFile,
} from "@/lib/file/large-file-upload-helper";
import { splitPdfIntoParts } from "@/lib/file/pdf-split-helper";
import {
	AuthService,
	authenticatedFetchWithExpiration,
	getStoredJwt,
} from "@/services/core/auth-service";
import { API_CONFIG } from "@/shared-config";

interface UseFileUploadProps {
	onUploadSuccess?: (filename: string, fileKey: string) => void;
	onUploadStart?: () => void;
}

export function useFileUpload({
	onUploadSuccess,
	onUploadStart,
}: UseFileUploadProps = {}) {
	const [currentUploadId, setCurrentUploadId] = useState<string | null>(null);
	const [uploadedFileInfo, setUploadedFileInfo] = useState<{
		filename: string;
		fileKey: string;
	} | null>(null);

	const send = useEvent();

	const handleUpload = useCallback(
		async (
			file: File,
			filename: string,
			_description: string,
			_tags: string[]
		) => {
			// Early authentication check to prevent unnecessary logging when unauthenticated
			const jwt = getStoredJwt();
			if (!jwt) {
				throw new Error("No authentication token found");
			}

			const tenant = AuthService.getUsernameFromStoredJwt();
			if (!tenant) {
				throw new Error("No username/tenant available for upload");
			}

			const maxPdfBytes = PROCESSING_LIMITS.MAX_PDF_SIZE_FOR_RANGE_BYTES;
			if (file.type === "application/pdf" && file.size > maxPdfBytes) {
				send({
					type: EVENT_TYPES.FILE_UPLOAD.PROGRESS,
					fileKey: buildStagingFileKey(tenant, filename),
					filename,
					fileSize: file.size,
					progress: 5,
					status: "splitting",
					source: "useFileUpload",
				} as FileUploadEvent);

				const parts = await splitPdfIntoParts(file, maxPdfBytes);
				for (let i = 0; i < parts.length; i++) {
					if (i > 0) {
						send({
							type: EVENT_TYPES.FILE_UPLOAD.STARTED,
							fileKey: buildStagingFileKey(tenant, parts[i].filename),
							filename: parts[i].filename,
							fileSize: parts[i].file.size,
							source: "useFileUpload",
						} as FileUploadEvent);
					}
					await performOneUpload(
						parts[i].file,
						parts[i].filename,
						tenant,
						jwt,
						i === 0
					);
				}
				return;
			}

			await performOneUpload(file, filename, tenant, jwt, true);
		},
		[send, onUploadSuccess, onUploadStart]
	);

	async function performOneUpload(
		file: File,
		filename: string,
		tenant: string,
		jwt: string,
		emitStart: boolean
	): Promise<void> {
		const uploadId = `${filename}`;
		setCurrentUploadId(uploadId);
		const fileKey = buildStagingFileKey(tenant, filename);

		if (emitStart) {
			send({
				type: EVENT_TYPES.FILE_UPLOAD.STARTED,
				fileKey,
				filename,
				fileSize: file.size,
				source: "useFileUpload",
			} as FileUploadEvent);
			onUploadStart?.();
		}

		try {
			const useLargeFileUpload = shouldUseLargeFileUpload(file.size);

			if (useLargeFileUpload) {
				// Use multipart upload for large files
				const result = await uploadLargeFile(
					file,
					filename,
					tenant,
					fileKey,
					send
				);

				if (!result.success) {
					throw new Error(result.error || "Large file upload failed");
				}
			} else {
				// Step 1: Upload file directly to storage
				send({
					type: EVENT_TYPES.FILE_UPLOAD.PROGRESS,
					fileKey,
					filename,
					fileSize: file.size,
					progress: 20,
					status: "uploading",
					source: "useFileUpload",
				} as FileUploadEvent);

				const uploadUrl = API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.UPLOAD.DIRECT(tenant, filename)
				);
				const uploadResponse = await authenticatedFetchWithExpiration(
					uploadUrl,
					{
						method: "PUT",
						jwt,
						body: file,
						headers: {
							"Content-Type": file.type || "application/pdf",
						},
					}
				);

				if (uploadResponse.jwtExpired) {
					throw new Error("Authentication expired. Please log in again.");
				}

				if (!uploadResponse.response.ok) {
					const errorText = await uploadResponse.response.text();
					let body: { code?: string; error?: string } = {};
					try {
						body = JSON.parse(errorText) as { code?: string; error?: string };
					} catch {
						// ignore parse errors
					}
					const err = new Error(
						body.error ??
							`Upload failed: ${uploadResponse.response.status} ${errorText}`
					) as Error & {
						isUploadLimitExceeded?: boolean;
						isDuplicateFilename?: boolean;
					};
					if (
						uploadResponse.response.status === 403 &&
						body.code === "UPLOAD_LIMIT_EXCEEDED"
					) {
						err.isUploadLimitExceeded = true;
					}
					if (
						uploadResponse.response.status === 409 &&
						body.code === "DUPLICATE_FILENAME"
					) {
						err.isDuplicateFilename = true;
					}
					throw err;
				}
			}
			send({
				type: EVENT_TYPES.FILE_UPLOAD.COMPLETED,
				fileKey,
				filename,
				fileSize: file.size,
				progress: 40,
				status: "uploaded",
				source: "useFileUpload",
			} as FileUploadEvent);

			// Success state - file processing will be handled by the queue consumer; progress will arrive via SSE
			setUploadedFileInfo({
				filename: filename,
				fileKey: fileKey,
			});

			// Call success callback
			onUploadSuccess?.(filename, fileKey);
		} catch (error) {
			const isLimitExceeded = (
				error as Error & { isUploadLimitExceeded?: boolean }
			)?.isUploadLimitExceeded;
			const isDuplicate = (error as Error & { isDuplicateFilename?: boolean })
				?.isDuplicateFilename;
			const fileKeyForEvent = buildStagingFileKey(tenant, filename);

			send({
				type:
					isLimitExceeded || isDuplicate
						? EVENT_TYPES.FILE_UPLOAD.QUEUED
						: EVENT_TYPES.FILE_UPLOAD.FAILED,
				fileKey: fileKeyForEvent,
				filename,
				fileSize: file.size,
				error: error instanceof Error ? error.message : "Unknown error",
				source: "useFileUpload",
			} as FileUploadEvent);

			if (isLimitExceeded || isDuplicate) {
				throw error;
			}
		}
	}

	const clearUploadedFileInfo = useCallback(() => {
		setUploadedFileInfo(null);
	}, []);

	return {
		currentUploadId,
		uploadedFileInfo,
		handleUpload,
		clearUploadedFileInfo,
	};
}
