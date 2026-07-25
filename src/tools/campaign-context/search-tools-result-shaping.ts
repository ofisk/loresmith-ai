/**
 * Result shaping for searchCampaignContext: relevance filtering, sorting,
 * pagination, and the human-readable summary returned to the model.
 */

// Search results are assembled from several heterogeneous sources
// (entities, digests, traversal), so fields are addressed defensively.
export type SearchResult = Record<string, any>;

// Scores assigned by non-semantic paths: entity matches (0.8), traversed
// entities (0.7), exact name matches (1.0), and unscored results (0).
const DEFAULT_SCORES = new Set([0, 0.7, 0.8, 1.0]);

export function hasSemanticRelevanceScores(results: SearchResult[]): boolean {
	return results.some((r) => !DEFAULT_SCORES.has(r.score || 0));
}

/**
 * When a query strongly matches specific entity names ("tell me about X"),
 * narrow to those entities so the answer stays focused. Session readouts keep
 * every result so encounter-detail entities are not dropped.
 */
export function filterToStrongNameMatches(
	results: SearchResult[],
	options: {
		forSessionReadout: boolean;
		hasStrongNameMatches: boolean;
		similarityScores: Map<string, number>;
		threshold: number;
	}
): SearchResult[] {
	const {
		forSessionReadout,
		hasStrongNameMatches,
		similarityScores,
		threshold,
	} = options;

	if (
		forSessionReadout ||
		!hasStrongNameMatches ||
		similarityScores.size === 0
	) {
		return results;
	}

	const nameMatched = results.filter((result) => {
		const nameScore = similarityScores.get(result.entityId || "");
		return nameScore !== undefined && nameScore >= threshold;
	});

	return nameMatched.length > 0 ? nameMatched : results;
}

function displayName(result: SearchResult): string {
	return (
		result.title ||
		result.name ||
		result.display_name ||
		result.id ||
		""
	).toLowerCase();
}

/** Sorts in place by semantic score when available, else alphabetically. */
export function sortByRelevance(
	results: SearchResult[],
	useSemanticScores: boolean
): SearchResult[] {
	results.sort((a, b) => {
		const scoreA = a.score || 0;
		const scoreB = b.score || 0;
		if (useSemanticScores && scoreB !== scoreA) {
			return scoreB - scoreA;
		}
		return displayName(a).localeCompare(displayName(b));
	});
	return results;
}

export function applyResultLimit(
	results: SearchResult[],
	effectiveLimit: number
): { pageResults: SearchResult[]; hasMore: boolean } {
	if (results.length > effectiveLimit) {
		return { pageResults: results.slice(0, effectiveLimit), hasMore: true };
	}
	return { pageResults: results, hasMore: false };
}

function buildPaginationInfo(options: {
	isListAll: boolean;
	hasMore: boolean;
	totalCount: number | undefined;
	shownCount: number;
	matchedCount: number;
	offset: number;
	effectiveLimit: number;
}): string {
	const {
		isListAll,
		hasMore,
		totalCount,
		shownCount,
		matchedCount,
		offset,
		effectiveLimit,
	} = options;
	const nextPage = `Use offset=${offset + effectiveLimit} to retrieve the next page.`;

	if (hasMore && totalCount !== undefined) {
		const noun = isListAll ? "shards" : "results";
		return ` ⚠️ LIMIT REACHED: Showing ${shownCount} of ${totalCount} total ${noun}. There are ${totalCount - shownCount} more ${noun} not shown. ${nextPage}`;
	}
	if (hasMore && !isListAll) {
		return ` ⚠️ LIMIT REACHED: Showing ${shownCount} of ${matchedCount}+ results. There are more results not shown. ${nextPage}`;
	}
	if (totalCount !== undefined) {
		return ` (${totalCount} total)`;
	}
	return "";
}

export function buildSearchSummary(options: {
	query: string;
	entityType?: string | null;
	isListAll: boolean;
	hasSemanticScores: boolean;
	forSessionReadout: boolean;
	hasMore: boolean;
	totalCount: number | undefined;
	shownCount: number;
	matchedCount: number;
	offset: number;
	effectiveLimit: number;
}): string {
	const entityTypeLabel = options.entityType ? ` (${options.entityType})` : "";
	const sortInfo = options.hasSemanticScores
		? " Results are sorted from most to least relevant."
		: " Results are sorted alphabetically by name.";
	const readoutReminder = options.forSessionReadout
		? " For session readout: include the full 'text' of each result in your reply; do not summarize."
		: "";
	const count = options.totalCount ?? options.shownCount;

	return `Found ${count} results for "${options.query}"${entityTypeLabel}.${sortInfo}${buildPaginationInfo(options)}${readoutReminder}`;
}
