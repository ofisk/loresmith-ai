import { useCallback, useEffect, useMemo, useState } from "react";
import { MEMORY_LIMIT_COPY } from "@/app-constants";
import { Button } from "@/components/button/Button";
import { FileDAO } from "@/dao";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useResourceFileEvents } from "@/hooks/useResourceFileEvents";
import type { ResourceFileWithCampaigns } from "@/hooks/useResourceFiles";
import { useRetryLimitStatus } from "@/hooks/useRetryLimitStatus";
import { APP_EVENT_TYPE } from "@/lib/app-events";
import { logger } from "@/lib/logger";
import { matchesResourceSearch } from "@/lib/resource-tags";
import {
	authenticatedFetchWithExpiration,
	getStoredJwt,
} from "@/services/core/auth-service";
import { API_CONFIG } from "@/shared-config";
import type { Campaign } from "@/types/campaign";
import { ResourceFileItem } from "./ResourceFileItem";

interface ResourceListProps {
	files: ResourceFileWithCampaigns[];
	setFiles: React.Dispatch<React.SetStateAction<ResourceFileWithCampaigns[]>>;
	loading: boolean;
	error: string | null;
	setError: React.Dispatch<React.SetStateAction<string | null>>;
	setLoading: React.Dispatch<React.SetStateAction<boolean>>;
	fetchResources: () => Promise<void>;
	onAddToCampaign?: (file: ResourceFileWithCampaigns) => void;
	onEditFile?: (file: ResourceFileWithCampaigns) => void;
	onDeleteFile?: (fileKey: string) => Promise<void>;
	onOpenAddToLibrary?: () => void;
	campaigns?: Campaign[];
	campaignAdditionProgress?: Record<string, number>;
	_isAddingToCampaigns?: boolean;
	/** Client-side filter for sidebar library search */
	searchQuery?: string;
}

/**
 * ResourceList component - displays a list of uploaded files with their status and details
 */
export function ResourceList({
	files,
	setFiles,
	loading,
	error,
	setError,
	setLoading: _setLoading,
	fetchResources,
	onAddToCampaign,
	onEditFile,
	onDeleteFile: onDeleteFileProp,
	onOpenAddToLibrary,
	campaigns = [],
	campaignAdditionProgress = {},
	_isAddingToCampaigns = false,
	searchQuery = "",
}: ResourceListProps) {
	const handleDeleteFile = useCallback(
		async (fileKey: string) => {
			const jwt = getStoredJwt();
			if (!jwt) return;
			const url = API_CONFIG.buildUrl(
				API_CONFIG.ENDPOINTS.LIBRARY.FILE_DELETE(encodeURIComponent(fileKey))
			);
			const { response, jwtExpired } = await authenticatedFetchWithExpiration(
				url,
				{ method: "DELETE", jwt }
			);
			if (jwtExpired || !response.ok) {
				const msg = await response.text();
				logger.scope("[ResourceList]").warn("Delete file failed", {
					status: response.status,
					body: msg,
				});
				throw new Error(response.ok ? "Auth expired" : msg || "Delete failed");
			}
			await fetchResources();
		},
		[fetchResources]
	);
	const onDeleteFile = onDeleteFileProp ?? handleDeleteFile;
	const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
	const [progressByFileKey, setProgressByFileKey] = useState<
		Record<string, number>
	>({});
	const authReady = useAuthReady();

	const visibleFiles = useMemo(() => {
		if (!searchQuery.trim()) return files;
		return files.filter((f) => matchesResourceSearch(f, searchQuery));
	}, [files, searchQuery]);

	const needsLibraryDiscoveryPoll = useMemo(
		() =>
			files.some(
				(f) =>
					f.library_entity_discovery_status === "pending" ||
					f.library_entity_discovery_status === "processing"
			),
		[files]
	);

	useEffect(() => {
		if (!needsLibraryDiscoveryPoll) return;
		const id = window.setInterval(() => {
			void fetchResources();
		}, 20000);
		return () => window.clearInterval(id);
	}, [needsLibraryDiscoveryPoll, fetchResources]);

	// File event handling - manages progress state internally and via prop setter
	useResourceFileEvents({
		files,
		setFiles,
		setProgressByFileKey,
		fetchResources,
	});

	// Fetch retry limit status for files that can show retry (error/failed/unindexed, not memory limit)
	const retryEligibleFileKeys = files
		.filter((f) => {
			const isFailed =
				f.status === FileDAO.STATUS.ERROR ||
				f.status === "failed" ||
				f.status === FileDAO.STATUS.UNINDEXED;
			if (!isFailed) return false;
			try {
				const err = f.processing_error ? JSON.parse(f.processing_error) : null;
				return err?.code !== "MEMORY_LIMIT_EXCEEDED";
			} catch {
				return true;
			}
		})
		.map((f) => f.file_key);
	const { status: retryLimitStatus } = useRetryLimitStatus(
		retryEligibleFileKeys.length > 0 ? retryEligibleFileKeys : null
	);

	const handleRetryFile = useCallback(
		async (fileKey: string, fileName: string) => {
			try {
				// Immediately update UI to show retry in progress
				setProgressByFileKey((prev) => ({ ...prev, [fileKey]: 0 }));

				const jwt = getStoredJwt();
				if (!jwt) {
					return;
				}

				// Call the RAG trigger indexing endpoint to retry processing for existing files
				const retryUrl = API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.RAG.TRIGGER_INDEXING
				);

				const response = await authenticatedFetchWithExpiration(retryUrl, {
					method: "POST",
					jwt,
					body: JSON.stringify({ fileKey }),
					headers: {
						"Content-Type": "application/json",
					},
				});

				// Parse response (server always returns JSON, even for errors)
				const result = (await response.response.json()) as {
					success: boolean;
					message?: string;
					error?: string;
					queued: boolean;
					isIndexed?: boolean;
				};

				// Check for errors: either HTTP error status or success: false in response
				if (!response.response.ok || !result.success) {
					const errorMessage =
						result.message ||
						result.error ||
						`Retry failed with status ${response.response.status}`;

					// Check if this is a memory limit error (non-retryable)
					if (
						result.error === "MEMORY_LIMIT_EXCEEDED" ||
						errorMessage.includes("too large")
					) {
						// Show a user-friendly error message for memory limit errors
						alert(MEMORY_LIMIT_COPY.retryAlert(fileName, errorMessage));
						return; // Don't throw, just return early
					}

					throw new Error(errorMessage);
				}

				// Immediately update file status in UI to show processing started
				setFiles((prevFiles) => {
					return prevFiles.map((file) => {
						if (file.file_key === fileKey) {
							return {
								...file,
								status: FileDAO.STATUS.SYNCING,
								updated_at: new Date().toISOString(),
							};
						}
						return file;
					});
				});

				// If queued, show immediate feedback
				if (result.queued) {
					setProgressByFileKey((prev) => ({ ...prev, [fileKey]: 10 }));
				} else {
					// Start progress animation for immediate retry
					setProgressByFileKey((prev) => ({ ...prev, [fileKey]: 25 }));
				}

				// Refresh the file list to get updated status from server
				fetchResources();
			} catch (_error) {
				// Reset progress on error
				setProgressByFileKey((prev) => {
					const newProgress = { ...prev };
					delete newProgress[fileKey];
					return newProgress;
				});
			}
		},
		[fetchResources, setFiles]
	);

	const handleRetryIndexing = useCallback(
		async (fileKey: string) => {
			try {
				const jwt = getStoredJwt();
				if (!jwt) return;

				const { response } = await authenticatedFetchWithExpiration(
					API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.RAG.TRIGGER_INDEXING),
					{
						method: "POST",
						jwt,
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							fileKey,
						}),
					}
				);

				if (response.ok) {
					// Refresh the file list to show updated status
					await fetchResources();
				}
			} catch (_error) {
				setError("Failed to retry indexing. Please try again.");
			}
		},
		[fetchResources, setError]
	);

	const toggleFileExpansion = useCallback((fileKey: string) => {
		setExpandedFiles((prev) => {
			const newExpandedFiles = new Set(prev);
			if (newExpandedFiles.has(fileKey)) {
				newExpandedFiles.delete(fileKey);
			} else {
				newExpandedFiles.add(fileKey);
			}
			return newExpandedFiles;
		});
	}, []);

	if (loading) {
		return (
			<div className="flex items-center justify-center h-32">
				<div className="text-muted-foreground">Loading resources...</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="text-center py-8">
				<div className="text-red-500 mb-2">{error}</div>
				<Button
					onClick={() => {
						const log = logger.scope("[ResourceList]");
						log.debug("Retry button clicked");
						const jwt = getStoredJwt();
						log.debug("Current auth state", {
							authReady,
							hasJwt: !!jwt,
						});

						if (!authReady || !jwt) {
							log.warn("Auth not ready or no JWT - triggering auth modal");
							// Dispatch jwt-expired event to trigger auth modal
							window.dispatchEvent(
								new CustomEvent(APP_EVENT_TYPE.JWT_EXPIRED, {
									detail: {
										message: "Authentication required. Please sign in again.",
									},
								})
							);
							return;
						}

						fetchResources();
					}}
					variant="secondary"
					size="sm"
					className="mx-auto"
				>
					Retry
				</Button>
			</div>
		);
	}

	if (files.length === 0) {
		return (
			<div className="text-center py-8">
				<div className="text-muted-foreground mb-2">The shelves lie bare</div>
				<p className="text-sm text-muted-foreground">
					Place a scroll upon the archive to awaken it
				</p>
			</div>
		);
	}

	if (visibleFiles.length === 0 && searchQuery.trim()) {
		return (
			<div className="text-center py-8 px-2">
				<p className="text-sm text-muted-foreground">
					No resources match your search
				</p>
			</div>
		);
	}

	return (
		<div className="h-full overflow-y-auto">
			<div className="space-y-3">
				{visibleFiles.map((file) => (
					<ResourceFileItem
						key={file.file_key}
						file={file}
						progress={progressByFileKey[file.file_key]}
						campaignProgress={campaignAdditionProgress[file.file_key]}
						isExpanded={expandedFiles.has(file.file_key)}
						onToggleExpand={() => toggleFileExpansion(file.file_key)}
						onRetryFile={handleRetryFile}
						onAddToCampaign={onAddToCampaign}
						onEditFile={onEditFile}
						onDeleteFile={onDeleteFile}
						onOpenAddToLibrary={onOpenAddToLibrary}
						onRetryIndexing={handleRetryIndexing}
						fetchResources={fetchResources}
						campaigns={campaigns}
						retryLimitStatus={retryLimitStatus[file.file_key]}
					/>
				))}
			</div>
		</div>
	);
}
