import {
	ArrowClockwise,
	CheckCircle,
	Clock,
	Spinner,
	XCircle,
} from "@phosphor-icons/react";
import { useCallback } from "react";
import { MEMORY_LIMIT_COPY } from "@/app-constants";
import { Tooltip } from "@/components/tooltip/Tooltip";
import { FILE_UPLOAD_STATUS } from "@/lib/file/file-upload-status";
import { isLibraryEntityDiscoveryInFlight } from "@/lib/library-entity-pipeline";

interface FileStatusIndicatorProps {
	className?: string;
	initialStatus?: string;
	jobId?: string;
	ragId?: string;
	tenant: string;
	fileKey?: string;
	fileName?: string;
	fileSize?: number;
	processingError?: string; // JSON string containing error code and metadata
	onRetry?: (fileKey: string, fileName: string) => void;
	/** When true, retry button is disabled (e.g. limit reached) */
	retryLimitDisabled?: boolean;
	/** Tooltip text when retry is disabled due to limit */
	retryLimitTooltip?: string;
	/** When RAG is `completed` but library entity discovery is still running, show as processing */
	libraryEntityDiscoveryStatus?: string | null;
	/** From GET /library/files: false until indexing + library discovery complete */
	libraryPipelineReady?: boolean;
}

export function FileStatusIndicator({
	className = "",
	initialStatus = "uploaded",
	jobId: _jobId,
	ragId: _ragId,
	tenant: _tenant,
	fileKey,
	fileName,
	fileSize,
	processingError,
	onRetry,
	retryLimitDisabled = false,
	retryLimitTooltip,
	libraryEntityDiscoveryStatus,
	libraryPipelineReady,
}: FileStatusIndicatorProps) {
	// No local error timeout; rely on SSE-driven updates and server state

	// FileStatusIndicator now only displays status - refresh logic moved to ResourceList
	// This prevents multiple components from making duplicate refresh-all-statuses calls

	// Determine what to show based on status
	const statusConfig = {
		[FILE_UPLOAD_STATUS.ERROR]: {
			icon: XCircle,
			color: "text-red-500",
			text: "Failed",
			title: "Processing failed",
			spinning: false,
		},
		failed: {
			icon: XCircle,
			color: "text-red-500",
			text: "Failed",
			title: "Processing failed",
			spinning: false,
		},
		[FILE_UPLOAD_STATUS.COMPLETED]: {
			icon: CheckCircle,
			color: "text-green-500",
			text: "Ready",
			title: "Ready for your campaigns",
			spinning: false,
		},
		[FILE_UPLOAD_STATUS.UPLOADING]: {
			icon: Spinner,
			color: "text-blue-500",
			text: "Uploading",
			title: "Uploading file to storage",
			spinning: true,
		},
		[FILE_UPLOAD_STATUS.UPLOADED]: {
			icon: Spinner,
			color: "text-blue-500",
			text: "Queued",
			title: "File uploaded, waiting for processing",
			spinning: true,
		},
		[FILE_UPLOAD_STATUS.SYNCING]: {
			icon: Spinner,
			color: "text-blue-500",
			text: "Syncing",
			title: "Preparing file",
			spinning: true,
		},
		[FILE_UPLOAD_STATUS.PROCESSING]: {
			icon: Spinner,
			color: "text-blue-500",
			text: "Processing",
			title: "File is being prepared",
			spinning: true,
		},
		[FILE_UPLOAD_STATUS.INDEXING]: {
			icon: Spinner,
			color: "text-blue-500",
			text: "Indexing",
			title: "File is being prepared",
			spinning: true,
		},
		[FILE_UPLOAD_STATUS.UNINDEXED]: {
			icon: XCircle,
			color: "text-orange-500",
			text: "Not ready",
			title: "Needs processing before shards can be extracted",
			spinning: false,
		},
		queued_for_upload: {
			icon: Clock,
			color: "text-amber-600 dark:text-amber-400",
			text: "Queued for upload",
			title: "Will retry when capacity is available",
			spinning: false,
		},
	};

	// Parse processing error if present
	let errorCode: string | null = null;
	let errorMessage: string | null = null;
	if (processingError) {
		try {
			const errorData = JSON.parse(processingError);
			errorCode = errorData.code || null;
			errorMessage = errorData.message || null;
		} catch {
			// If parsing fails, ignore
		}
	}

	const isMemoryLimitError = errorCode === "MEMORY_LIMIT_EXCEEDED";

	// Get current status - use initialStatus if it exists in statusConfig, otherwise default to PROCESSING
	let currentStatus: keyof typeof statusConfig;

	// RAG can be "completed" while library entity pipeline is still running
	if (
		initialStatus === FILE_UPLOAD_STATUS.COMPLETED &&
		(libraryPipelineReady === false ||
			(libraryPipelineReady === undefined &&
				isLibraryEntityDiscoveryInFlight(libraryEntityDiscoveryStatus)))
	) {
		currentStatus = FILE_UPLOAD_STATUS.PROCESSING;
	} else if (initialStatus && initialStatus in statusConfig) {
		currentStatus = initialStatus as keyof typeof statusConfig;
	} else if (initialStatus === "failed") {
		// Handle legacy "failed" status
		currentStatus = "failed";
	} else {
		// Fall back to PROCESSING only if status is unknown
		currentStatus = FILE_UPLOAD_STATUS.PROCESSING;
	}

	const config = statusConfig[currentStatus];
	const IconComponent = config.icon;

	// Override title for memory limit errors
	const statusTitle = isMemoryLimitError
		? errorMessage || MEMORY_LIMIT_COPY.short
		: config.title;

	const handleRetry = useCallback(() => {
		if (fileKey && fileName && onRetry) {
			onRetry(fileKey, fileName);
		} else {
		}
	}, [fileKey, fileName, onRetry]);

	return (
		<div className={`flex items-center gap-1 ${className}`}>
			<div
				className={`flex items-center gap-1 ${config.color}`}
				title={statusTitle}
			>
				<IconComponent
					size={14}
					className={config.spinning ? "animate-spin" : ""}
				/>
				<span className="text-xs">{config.text}</span>
			</div>

			{/* Show retry button for failed or unindexed files, but not for memory limit errors */}
			{(currentStatus === FILE_UPLOAD_STATUS.ERROR ||
				currentStatus === "failed" ||
				currentStatus === FILE_UPLOAD_STATUS.UNINDEXED) &&
				fileKey &&
				fileName &&
				onRetry &&
				!isMemoryLimitError &&
				(() => {
					const button = (
						<button
							type="button"
							onClick={retryLimitDisabled ? undefined : handleRetry}
							disabled={retryLimitDisabled}
							className={`ml-1 p-1 transition-colors ${
								retryLimitDisabled
									? "text-neutral-400 dark:text-neutral-500 cursor-not-allowed opacity-60"
									: "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
							}`}
							title={!retryLimitTooltip ? "Retry processing" : undefined}
						>
							<ArrowClockwise size={12} />
						</button>
					);
					return retryLimitTooltip ? (
						<Tooltip content={retryLimitTooltip}>
							<span className="inline-flex">{button}</span>
						</Tooltip>
					) : (
						button
					);
				})()}
		</div>
	);
}
