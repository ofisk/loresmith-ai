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
