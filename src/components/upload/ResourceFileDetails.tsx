import { useState } from "react";
import { MEMORY_LIMIT_COPY } from "@/app-constants";
import { Button } from "@/components/button/Button";
import { Tooltip } from "@/components/tooltip/Tooltip";
import { FileDAO } from "@/dao";
import type { ResourceFileWithCampaigns } from "@/hooks/useResourceFiles";
import {
	isFileReadyForCampaignAdd,
	isLibraryEntityDiscoveryInFlight,
} from "@/lib/library-entity-pipeline";
import {
	authenticatedFetchWithExpiration,
	getStoredJwt,
} from "@/services/core/auth-service";
import { API_CONFIG } from "@/shared-config";
import type { Campaign } from "@/types/campaign";

const LIBRARY_DISCOVERY_LABEL: Record<string, string> = {
	pending: "Pending",
	processing: "Processing",
	complete: "Complete",
	failed: "Failed",
};

interface ResourceFileDetailsProps {
	file: ResourceFileWithCampaigns;
	onAddToCampaign?: (file: ResourceFileWithCampaigns) => void;
	onEditFile?: (file: ResourceFileWithCampaigns) => void;
	onDeleteFile?: (fileKey: string) => Promise<void>;
	/** Called after successful "Retry upload" delete so the Add to library modal can open */
	onOpenAddToLibrary?: () => void;
	onRetryIndexing: (fileKey: string) => Promise<void>;
	fetchResources: () => Promise<void>;
	campaigns?: Campaign[];
	retryLimitDisabled?: boolean;
	retryLimitTooltip?: string;
}

/**
 * Expanded file details component
 */
export function ResourceFileDetails({
	file,
	onAddToCampaign,
	onEditFile,
	onDeleteFile,
	onOpenAddToLibrary,
	onRetryIndexing,
	fetchResources,
	campaigns = [],
	retryLimitDisabled = false,
	retryLimitTooltip,
}: ResourceFileDetailsProps) {
	const canAddToCampaign = isFileReadyForCampaignAdd(file);
	const [isDeleting, setIsDeleting] = useState(false);
	const [retryingEntityPipeline, setRetryingEntityPipeline] = useState(false);
	const discoveryInFlight = isLibraryEntityDiscoveryInFlight(
		file.library_entity_discovery_status
	);
	const showRetryEntityExtraction =
		file.status === FileDAO.STATUS.COMPLETED &&
		!discoveryInFlight &&
		(file.library_entity_discovery_status === "failed" ||
			file.library_pipeline_ready === false);

	const handleRetryEntityExtraction = async () => {
		const jwt = getStoredJwt();
		if (!jwt) return;
		setRetryingEntityPipeline(true);
		try {
			const { response } = await authenticatedFetchWithExpiration(
				API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.LIBRARY.RETRY_ENTITY_PIPELINE),
				{
					method: "POST",
					jwt,
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ fileKey: file.file_key }),
				}
			);
			if (response.ok) {
				await fetchResources();
			}
		} finally {
			setRetryingEntityPipeline(false);
		}
	};
	const handleRetryIndexing = async () => {
		await onRetryIndexing(file.file_key);
		await fetchResources();
	};
	const handleDelete = async () => {
		if (!onDeleteFile) return;
		setIsDeleting(true);
		try {
			await onDeleteFile(file.file_key);
			await fetchResources();
		} finally {
			setIsDeleting(false);
		}
	};
	const handleRetryUpload = async () => {
		if (!onDeleteFile) return;
		setIsDeleting(true);
		try {
			await onDeleteFile(file.file_key);
			await fetchResources();
			onOpenAddToLibrary?.();
		} finally {
			setIsDeleting(false);
		}
	};

	// Calculate available campaigns (campaigns the file isn't already in)
	const availableCampaigns = campaigns.filter((campaign) => {
		if (!file.campaigns) return true;
		return !file.campaigns.some(
			(existingCampaign) => existingCampaign.campaignId === campaign.campaignId
		);
	});

	return (
		<div
			className={`overflow-y-auto transition-all duration-300 ease-in-out max-h-96 opacity-100`}
		>
			<div className="mt-4 text-xs space-y-1">
				{file.display_name && (
					<div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
						<span className="text-neutral-600 dark:text-neutral-400">
							Display name:
						</span>
						<span className="font-medium text-neutral-900 dark:text-neutral-100 break-words">
							{file.display_name}
						</span>
					</div>
				)}
				<div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
					<span className="text-neutral-600 dark:text-neutral-400">
						Filename:
					</span>
					<span className="font-medium text-neutral-900 dark:text-neutral-100 break-all">
						{file.file_name}
					</span>
				</div>
				<div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
					<span className="text-neutral-600 dark:text-neutral-400">
						Uploaded:
					</span>
					<span className="font-medium text-neutral-900 dark:text-neutral-100">
						{new Date(file.created_at || file.updated_at)
							.toLocaleDateString("en-US", {
								month: "short",
								day: "numeric",
								year: "2-digit",
								hour: "numeric",
								minute: "2-digit",
								hour12: true,
							})
							.replace(",", "")
							.replace(" PM", "p")
							.replace(" AM", "a")}
					</span>
				</div>
				<div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
					<span className="text-neutral-600 dark:text-neutral-400">Size:</span>
					<span className="font-medium text-neutral-900 dark:text-neutral-100">
						{file.file_size
							? (file.file_size / 1024 / 1024).toFixed(2)
							: "Unknown"}{" "}
						MB
					</span>
				</div>
				{file.status === FileDAO.STATUS.COMPLETED &&
					file.library_entity_discovery_status && (
						<div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
							<span className="text-neutral-600 dark:text-neutral-400">
								Entity discovery:
							</span>
							<span className="font-medium text-neutral-900 dark:text-neutral-100">
								{LIBRARY_DISCOVERY_LABEL[
									file.library_entity_discovery_status
								] ?? file.library_entity_discovery_status}
							</span>
						</div>
					)}
			</div>

			{file.description && (
				<div className="mt-3">
					<p className="text-sm text-neutral-600 dark:text-neutral-300">
						{file.description}
					</p>
				</div>
			)}
			{file.tags && Array.isArray(file.tags) && file.tags.length > 0 && (
				<div className="mt-3">
					<div className="flex flex-wrap gap-1">
						{file.tags.map((tag: string) => (
							<span
								key={tag}
								className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded"
							>
								{tag}
							</span>
						))}
					</div>
				</div>
			)}

			{file.campaigns && file.campaigns.length > 0 && (
				<div className="mt-3">
					<p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
						Linked campaigns:
					</p>
					<div className="flex flex-wrap gap-1">
						{file.campaigns.map((campaign) => (
							<span
								key={campaign.campaignId}
								className="px-2 py-1 text-xs bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded"
							>
								{campaign.name}
							</span>
						))}
					</div>
				</div>
			)}

			<div className="mt-4 space-y-2">
				{/* Check if file has memory limit error */}
				{(() => {
					let isMemoryLimitError = false;
					if (file.processing_error) {
						try {
							const errorData = JSON.parse(file.processing_error);
							isMemoryLimitError = errorData.code === "MEMORY_LIMIT_EXCEEDED";
						} catch {
							// If parsing fails, ignore
						}
					}

					// Show retry button for error/unindexed/failed statuses, but not for memory limit errors
					const isFailedStatus =
						file.status === FileDAO.STATUS.UNINDEXED ||
						file.status === FileDAO.STATUS.ERROR ||
						file.status === "failed" ||
						file.status === "error";

					const retryButton = (
						<Button
							onClick={retryLimitDisabled ? undefined : handleRetryIndexing}
							disabled={retryLimitDisabled}
							variant="secondary"
							size="sm"
							className="w-full !text-orange-600 dark:!text-orange-400 hover:!text-orange-700 dark:hover:!text-orange-300 border-orange-200 dark:border-orange-700 hover:border-orange-300 dark:hover:border-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							Retry Indexing
						</Button>
					);
					const tooltipContent = retryLimitDisabled
						? (retryLimitTooltip ?? "Retry limit reached")
						: null;
					return (
						isFailedStatus &&
						!isMemoryLimitError &&
						(tooltipContent ? (
							<Tooltip content={tooltipContent}>
								<span className="block w-full">{retryButton}</span>
							</Tooltip>
						) : (
							<span className="block w-full">{retryButton}</span>
						))
					);
				})()}
				{file.processing_error &&
					(() => {
						try {
							const errorData = JSON.parse(file.processing_error);
							if (errorData.code === "MEMORY_LIMIT_EXCEEDED") {
								return (
									<div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-sm text-yellow-800 dark:text-yellow-200">
										<p className="font-medium mb-1">⚠️ File too large</p>
										<p className="text-xs mb-2">
											{errorData.message || MEMORY_LIMIT_COPY.fallback}
										</p>
										<p className="text-xs mb-2">
											Delete this file and add it again to split into smaller,
											indexable parts.
										</p>
										{onDeleteFile && (
											<Button
												onClick={handleRetryUpload}
												disabled={isDeleting}
												variant="secondary"
												size="sm"
												className="w-full !text-yellow-800 dark:!text-yellow-200 border-yellow-300 dark:border-yellow-700 hover:!text-yellow-900 dark:hover:!text-yellow-100"
											>
												{isDeleting ? "Deleting…" : "Retry upload"}
											</Button>
										)}
									</div>
								);
							}
						} catch {
							// If parsing fails, ignore
						}
						return null;
					})()}
				{availableCampaigns.length > 0 && onAddToCampaign && (
					<Button
						onClick={() => {
							onAddToCampaign(file);
						}}
						variant="secondary"
						size="sm"
						className="w-full !text-purple-600 dark:!text-purple-400 hover:!text-purple-700 dark:hover:!text-purple-300 border-purple-200 dark:border-purple-700 hover:border-purple-300 dark:hover:border-purple-600"
						disabled={!canAddToCampaign}
					>
						{canAddToCampaign
							? "Add to campaign"
							: discoveryInFlight
								? "Indexing entities…"
								: "File not ready"}
					</Button>
				)}
				{showRetryEntityExtraction && (
					<Button
						onClick={handleRetryEntityExtraction}
						disabled={retryingEntityPipeline}
						variant="secondary"
						size="sm"
						className="w-full !text-primary border-primary/35 hover:border-primary/50"
					>
						{retryingEntityPipeline ? "Queuing…" : "Retry entity extraction"}
					</Button>
				)}
				<Button
					onClick={() => {
						onEditFile?.(file);
					}}
					variant="secondary"
					size="sm"
					className="w-full text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
				>
					Edit
				</Button>
				{onDeleteFile && (
					<Button
						onClick={handleDelete}
						disabled={isDeleting}
						variant="secondary"
						size="sm"
						className="w-full text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 border-red-200 dark:border-red-800 hover:border-red-300 dark:hover:border-red-700"
					>
						{isDeleting ? "Deleting…" : "Delete"}
					</Button>
				)}
			</div>
		</div>
	);
}
