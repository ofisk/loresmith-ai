import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import { FileStatusIndicator } from "@/components/upload/FileStatusIndicator";
import { FileDAO } from "@/dao";
import type { ResourceFileWithCampaigns } from "@/hooks/useResourceFiles";
import { getDisplayName } from "@/lib/display-name-utils";
import { isLibraryEntityDiscoveryInFlight } from "@/lib/library-entity-pipeline";
import { cn } from "@/lib/utils";
import { AuthService } from "@/services/core/auth-service";
import type { Campaign } from "@/types/campaign";
import { LibraryEntityIndexingProgress } from "./LibraryEntityIndexingProgress";
import { ResourceFileDetails } from "./ResourceFileDetails";

interface ResourceFileItemProps {
	file: ResourceFileWithCampaigns;
	progress: number | undefined;
	campaignProgress: number | undefined;
	isExpanded: boolean;
	onToggleExpand: () => void;
	onRetryFile: (fileKey: string, fileName: string) => Promise<void>;
	onAddToCampaign?: (file: ResourceFileWithCampaigns) => void;
	onEditFile?: (file: ResourceFileWithCampaigns) => void;
	onDeleteFile?: (fileKey: string) => Promise<void>;
	onOpenAddToLibrary?: () => void;
	onRetryIndexing: (fileKey: string) => Promise<void>;
	fetchResources: () => Promise<void>;
	campaigns?: Campaign[];
	retryLimitStatus?: { canRetry: boolean; reason?: string };
}

/**
 * Individual resource file item component
 */
export function ResourceFileItem({
	file,
	progress,
	campaignProgress,
	isExpanded,
	onToggleExpand,
	onRetryFile,
	onAddToCampaign,
	onEditFile,
	onDeleteFile,
	onOpenAddToLibrary,
	onRetryIndexing,
	fetchResources,
	campaigns = [],
	retryLimitStatus,
}: ResourceFileItemProps) {
	const isImageLibraryFile = /\.(jpe?g|png|webp)$/i.test(
		file.file_name || file.display_name || ""
	);

	const libraryDiscoveryInFlight = isLibraryEntityDiscoveryInFlight(
		file.library_entity_discovery_status
	);
	const statusForDisplayProgress =
		file.status === FileDAO.STATUS.COMPLETED && libraryDiscoveryInFlight
			? FileDAO.STATUS.INDEXING
			: file.status;

	const progressPercentage = (() => {
		// Check for campaign addition progress first
		if (typeof campaignProgress === "number") {
			return campaignProgress;
		}

		// Then check for file upload progress
		if (typeof progress === "number") {
			return progress;
		}

		// Progress based on status
		switch (statusForDisplayProgress) {
			case FileDAO.STATUS.UPLOADING:
				return 20;
			case FileDAO.STATUS.UPLOADED:
				return 40;
			case FileDAO.STATUS.SYNCING:
				return 60;
			case FileDAO.STATUS.PROCESSING:
				return 80;
			case FileDAO.STATUS.INDEXING:
				return 90;
			case FileDAO.STATUS.COMPLETED:
				return 100;
			case FileDAO.STATUS.ERROR:
				return 100;
			default:
				return undefined;
		}
	})();

	const progressColor = (() => {
		// Check for campaign addition progress first
		if (typeof campaignProgress === "number") {
			return "rgba(147, 51, 234, 0.12)"; // Purple for campaign addition
		}

		// Then check for file status
		return file.status === "error"
			? "rgba(239,68,68,0.15)"
			: "rgba(147,197,253,0.12)";
	})();

	const isQueuedForUpload = file.status === "queued_for_upload";

	return (
		<button
			type="button"
			className={cn(
				"relative p-2 border rounded-lg bg-white dark:bg-neutral-900 shadow-sm overflow-hidden cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors duration-200 w-full text-left",
				isQueuedForUpload
					? "border-l-4 border-l-amber-500 border-neutral-200 dark:border-neutral-800"
					: "border border-neutral-200 dark:border-neutral-800"
			)}
			onClick={onToggleExpand}
		>
			{/* Progress fill (transparent overlay) */}
			{progressPercentage !== undefined && (
				<div
					className="absolute inset-y-0 left-0 pointer-events-none"
					style={{
						width: `${progressPercentage}%`,
						transition: "width 300ms ease",
						background: progressColor,
					}}
				/>
			)}
			<div className="flex flex-col h-full">
				<div className="flex items-center justify-between">
					<div className="flex items-start gap-2 flex-1 mr-3 min-w-0">
						<div className="min-w-0 flex-1">
							<h4
								className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate max-w-[var(--width-truncate-sm)] sm:max-w-[var(--width-truncate-md)]"
								onClick={(e) => e.stopPropagation()}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										e.stopPropagation();
									}
								}}
							>
								{getDisplayName(file)}
							</h4>
							{isImageLibraryFile ? (
								<p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
									Visual inspiration
								</p>
							) : null}
							<LibraryEntityIndexingProgress
								queueMessage={file.library_entity_discovery_queue_message}
								status={file.library_entity_discovery_status}
							/>
						</div>
						{AuthService.getUsernameFromStoredJwt() && (
							<FileStatusIndicator
								tenant={AuthService.getUsernameFromStoredJwt()!}
								initialStatus={file.status}
								libraryEntityDiscoveryStatus={
									file.library_entity_discovery_status
								}
								fileKey={file.file_key}
								fileName={file.file_name}
								fileSize={file.file_size}
								processingError={file.processing_error}
								onRetry={onRetryFile}
								retryLimitDisabled={
									retryLimitStatus && !retryLimitStatus.canRetry
								}
								retryLimitTooltip={retryLimitStatus?.reason}
								className="flex-shrink-0"
							/>
						)}
					</div>
					<button
						onClick={(e) => {
							e.stopPropagation();
							onToggleExpand();
						}}
						type="button"
						className="flex-shrink-0 p-1 rounded-md bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors duration-200"
					>
						{isExpanded ? (
							<CaretDownIcon
								size={16}
								className="text-purple-600 dark:text-purple-400"
							/>
						) : (
							<CaretRightIcon
								size={16}
								className="text-purple-600 dark:text-purple-400"
							/>
						)}
					</button>
				</div>

				{isExpanded && (
					<ResourceFileDetails
						file={file}
						onAddToCampaign={onAddToCampaign}
						onEditFile={onEditFile}
						onDeleteFile={onDeleteFile}
						onOpenAddToLibrary={onOpenAddToLibrary}
						onRetryIndexing={onRetryIndexing}
						fetchResources={fetchResources}
						campaigns={campaigns}
						retryLimitDisabled={retryLimitStatus && !retryLimitStatus.canRetry}
						retryLimitTooltip={retryLimitStatus?.reason}
					/>
				)}
			</div>
		</button>
	);
}
