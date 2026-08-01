/**
 * Library entity discovery runs after RAG completes. These helpers align UI and API
 * so "ready" and "add to campaign" wait until discovery is not in flight.
 */
export function isLibraryEntityDiscoveryInFlight(
	status: string | null | undefined
): boolean {
	return status === "pending" || status === "processing";
}

/**
 * RAG is done and, when the library-entity table reports status, it is not pending/processing.
 */
export function isFileReadyForCampaignAdd(file: {
	status: string;
	library_entity_discovery_status?: string | null;
	library_pipeline_ready?: boolean;
}): boolean {
	if (file.status !== "completed") return false;
	if (file.library_pipeline_ready === true) return true;
	if (file.library_pipeline_ready === false) return false;
	if (isLibraryEntityDiscoveryInFlight(file.library_entity_discovery_status)) {
		return false;
	}
	return true;
}

/**
 * Statuses where the upload/RAG pipeline is still running and will reach
 * `completed` on its own. Deliberately excludes `error` and `unindexed`, which
 * are terminal until something re-triggers indexing.
 */
const FILE_PIPELINE_IN_FLIGHT_STATUSES = new Set([
	"uploading",
	"uploaded",
	"syncing",
	"processing",
	"indexing",
]);

/**
 * True when RAG indexing is still under way for this file, so an add-to-campaign
 * should be deferred rather than rejected (see `ensureLibraryDiscoveryAndMarkResourcePending`).
 */
export function isFilePipelineInFlight(
	status: string | null | undefined
): boolean {
	return status != null && FILE_PIPELINE_IN_FLIGHT_STATUSES.has(status);
}

/**
 * A file can be added to a campaign right now, or added as a deferred (pending)
 * resource that finishes when its pipeline does. Only terminal-failure states
 * (`error`, `unindexed`) are neither — those need a retry first.
 */
export function isFileQueueableForCampaignAdd(file: {
	status?: string | null;
}): boolean {
	return file.status === "completed" || isFilePipelineInFlight(file.status);
}

/**
 * The add will be accepted but deferred: entities (and therefore shards) arrive
 * once indexing and library discovery finish.
 */
export function willCampaignAddBeDeferred(file: {
	status?: string | null;
	library_entity_discovery_status?: string | null;
	library_pipeline_ready?: boolean;
}): boolean {
	return (
		isFileQueueableForCampaignAdd(file) &&
		!isFileReadyForCampaignAdd({ ...file, status: file.status ?? "" })
	);
}
