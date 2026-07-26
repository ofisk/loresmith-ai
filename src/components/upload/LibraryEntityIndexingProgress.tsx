import {
	chunkProgressPercent,
	parseEntityExtractionBatchState,
	parseEntityExtractionProgress,
} from "@/lib/entity-extraction-progress";
import { FILE_UPLOAD_STATUS } from "@/lib/file/file-upload-status";

interface LibraryEntityIndexingProgressProps {
	fileStatus: string;
	ingestionChunkStats?: {
		total: number;
		completed: number;
		failed: number;
		pending: number;
		processing: number;
	} | null;
	/** `library_entity_discovery.queue_message` from GET /library/files */
	queueMessage?: string | null;
	/** `library_entity_discovery.status` */
	status?: string;
}

function ProgressBar(props: {
	pct: number;
	ariaLabel: string;
	caption: string;
}) {
	const { pct, ariaLabel, caption } = props;
	return (
		<>
			<div
				className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden"
				role="progressbar"
				aria-valuenow={pct}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-label={ariaLabel}
			>
				<div
					className="h-full rounded-full bg-primary transition-[width] duration-300"
					style={{ width: `${pct}%` }}
				/>
			</div>
			<p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 tabular-nums">
				{caption}
			</p>
		</>
	);
}

/**
 * Discovery section: a chunk-percent bar once `PROGRESS:a/b` exists, otherwise a
 * plain status line.
 *
 * Chunks sent as one Anthropic message batch complete together, so the percent
 * cannot advance until the batch lands — a correct-but-frozen bar reads as a
 * stall, so a pending batch is always named explicitly (issue #735).
 */
function DiscoveryProgress({ queueMessage }: { queueMessage?: string | null }) {
	const prog = parseEntityExtractionProgress(queueMessage ?? null);
	const batchState = parseEntityExtractionBatchState(queueMessage ?? null);
	const pct = prog ? chunkProgressPercent(prog.processed, prog.total) : null;

	if (pct === null || !prog) {
		return (
			<p className="text-xs text-neutral-600 dark:text-neutral-400">
				{batchState
					? `${batchState.chunkCount} chunks queued for batch processing…`
					: "Extracting entities…"}
			</p>
		);
	}

	const chunks = `${prog.processed} of ${prog.total} chunks`;
	const queued = batchState
		? ` — ${batchState.chunkCount} queued for batch processing`
		: "";
	return (
		<ProgressBar
			pct={pct}
			ariaLabel={`Entity extraction progress ${pct} percent`}
			caption={`${pct}% extracted (${chunks})${queued}`}
		/>
	);
}

/**
 * Chunk-level ingestion (vectorize) and library entity discovery (PROGRESS:a/b in queue_message).
 */
export function LibraryEntityIndexingProgress({
	fileStatus,
	ingestionChunkStats,
	queueMessage,
	status: discoveryStatus,
}: LibraryEntityIndexingProgressProps) {
	const showIngestion =
		fileStatus !== FILE_UPLOAD_STATUS.COMPLETED &&
		ingestionChunkStats != null &&
		ingestionChunkStats.total > 0;
	const ingPct =
		showIngestion && ingestionChunkStats
			? chunkProgressPercent(
					ingestionChunkStats.completed,
					ingestionChunkStats.total
				)
			: null;

	const discoveryInFlight =
		discoveryStatus === "pending" || discoveryStatus === "processing";

	if (!showIngestion && !discoveryInFlight) {
		return null;
	}

	return (
		<div className="mt-2 w-full space-y-2">
			{showIngestion && ingPct !== null && ingestionChunkStats && (
				<div>
					<ProgressBar
						pct={ingPct}
						ariaLabel={`Vectorizing progress ${ingPct} percent`}
						caption={`${ingPct}% vectorized (${ingestionChunkStats.completed} of ${ingestionChunkStats.total} chunks)`}
					/>
				</div>
			)}
			{discoveryInFlight && (
				<div>
					<DiscoveryProgress queueMessage={queueMessage} />
				</div>
			)}
		</div>
	);
}
