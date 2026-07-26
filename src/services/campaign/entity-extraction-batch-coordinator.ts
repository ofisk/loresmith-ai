/**
 * The seam between entity staging and the Anthropic Message Batches path
 * (issue #735).
 *
 * Staging plans its chunks, then asks the coordinator what to do with them.
 * That keeps the batch state machine (submit in one Worker invocation, collect
 * in a later one) entirely outside the staging pipeline: staging never learns
 * about batch ids, deadlines, or cron ticks, and the merge / dedupe / embedding
 * / notification stages downstream run identically either way.
 */

/** One chunk of the document, with its index in the full chunk list. */
export interface PlannedChunk {
	chunk: string;
	globalIndex: number;
}

export interface ChunkBatchPlan {
	chunks: PlannedChunk[];
	/** Chunk count for the whole document, not just this run's window. */
	totalChunks: number;
	chunkWindowStart: number;
	chunkWindowEnd: number;
	sourceName: string;
}

export type ChunkBatchDecision =
	/**
	 * A batch is in flight (just submitted, or submitted earlier and not yet
	 * finished). Staging returns without extracting; the owning queue job stays
	 * pending and asks again on the next tick.
	 */
	| { status: "awaiting"; detail?: string }
	/**
	 * Batch results are in. `outputsByChunkIndex` holds the validated extraction
	 * payload per chunk. Chunks absent from the map (batch-errored, expired, or
	 * unparseable output) fall through to an inline call, so a partially failed
	 * batch costs only the chunks that actually failed.
	 */
	| { status: "ready"; outputsByChunkIndex: Map<number, unknown> }
	/** Do not batch this run — extract inline, exactly as before. */
	| { status: "inline"; reason?: string };

export interface EntityExtractionBatchCoordinator {
	resolveChunkOutputs(plan: ChunkBatchPlan): Promise<ChunkBatchDecision>;
}
