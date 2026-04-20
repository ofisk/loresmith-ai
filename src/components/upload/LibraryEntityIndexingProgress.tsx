import {
	chunkProgressPercent,
	parseEntityExtractionProgress,
} from "@/lib/entity-extraction-progress";

interface LibraryEntityIndexingProgressProps {
	/** `library_entity_discovery.queue_message` from GET /library/files */
	queueMessage?: string | null;
	/** `library_entity_discovery.status` */
	status?: string;
}

/**
 * Chunk-level entity discovery progress for a library file (PROGRESS:a/b in queue_message).
 */
export function LibraryEntityIndexingProgress({
	queueMessage,
	status,
}: LibraryEntityIndexingProgressProps) {
	const inFlight = status === "pending" || status === "processing";
	if (!inFlight) return null;

	const prog = parseEntityExtractionProgress(queueMessage ?? null);
	const pct = prog ? chunkProgressPercent(prog.processed, prog.total) : null;

	return (
		<div className="mt-2 w-full">
			{pct !== null && prog ? (
				<>
					<div
						className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden"
						role="progressbar"
						aria-valuenow={pct}
						aria-valuemin={0}
						aria-valuemax={100}
						aria-label={`Indexing progress ${pct} percent`}
					>
						<div
							className="h-full rounded-full bg-primary transition-[width] duration-300"
							style={{ width: `${pct}%` }}
						/>
					</div>
					<p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 tabular-nums">
						{pct}% indexed ({prog.processed} of {prog.total} chunks)
					</p>
				</>
			) : (
				<p className="text-xs text-neutral-600 dark:text-neutral-400">
					Indexing entities…
				</p>
			)}
		</div>
	);
}
