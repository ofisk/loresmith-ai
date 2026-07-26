import type { LLMCostEventDAO } from "@/dao/llm-cost-event-dao";
import type {
	CostAttributionResponse,
	CostTotals,
} from "@/types/cost-attribution";

export interface CostAttributionQuery {
	fromDate: string;
	toDate: string;
	/** Rows per breakdown. */
	topN?: number;
	/** Rows in the top-spender list. */
	spenderLimit?: number;
}

const EMPTY_TOTALS: CostTotals = {
	costUsd: 0,
	totalTokens: 0,
	promptTokens: 0,
	completionTokens: 0,
	cachedInputTokens: 0,
	cacheWriteTokens: 0,
	queryCount: 0,
	eventCount: 0,
	unpricedEvents: 0,
	distinctUsers: 0,
	cacheHitRate: 0,
};

/**
 * Assembles the admin cost-attribution snapshot: which agents, intents, models,
 * and tiers are actually spending the money (issue #738).
 */
export class CostAttributionService {
	constructor(private dao: LLMCostEventDAO) {}

	async getAttribution(
		query: CostAttributionQuery
	): Promise<CostAttributionResponse> {
		const window = { fromDate: query.fromDate, toDate: query.toDate };
		const topN = query.topN ?? 25;
		const spenderLimit = query.spenderLimit ?? 10;
		const now = new Date().toISOString();

		// An environment that has not run migration 0030 should show an empty
		// dashboard, not a 500.
		if (!(await this.dao.isAvailable())) {
			return {
				window: { from: query.fromDate, to: query.toDate },
				totals: EMPTY_TOTALS,
				byAgent: [],
				byIntent: [],
				byModel: [],
				byModelRole: [],
				bySurface: [],
				byTier: [],
				costPerTier: [],
				topSpenders: [],
				lastUpdated: now,
			};
		}

		// Totals first: every breakdown's `costShare` is relative to the window
		// total, so a truncated tail still reports honest percentages.
		const totals = await this.dao.getTotals(window);

		const [
			byAgent,
			byIntent,
			byModel,
			byModelRole,
			bySurface,
			byTier,
			costPerTier,
			topSpenders,
		] = await Promise.all([
			this.dao.getBreakdown("agent", window, totals.costUsd, topN),
			this.dao.getBreakdown("intent", window, totals.costUsd, topN),
			this.dao.getBreakdown("model", window, totals.costUsd, topN),
			this.dao.getBreakdown("modelRole", window, totals.costUsd, topN),
			this.dao.getBreakdown("surface", window, totals.costUsd, topN),
			this.dao.getBreakdown("tier", window, totals.costUsd, topN),
			this.dao.getCostPerTier(window),
			this.dao.getTopSpenders(window, spenderLimit),
		]);

		return {
			window: { from: query.fromDate, to: query.toDate },
			totals,
			byAgent,
			byIntent,
			byModel,
			byModelRole,
			bySurface,
			byTier,
			costPerTier,
			topSpenders,
			lastUpdated: now,
		};
	}
}
