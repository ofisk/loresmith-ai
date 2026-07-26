import type { Meta, StoryObj } from "@storybook/react";
import { JWT_STORAGE_KEY } from "@/app-constants";
import type {
	CostAttributionResponse,
	CostBreakdownRow,
	TelemetryAlertsResponse,
} from "@/types/cost-attribution";
import { CostAttributionPanel } from "./CostAttributionPanel";

/**
 * The panel loads its own data through `useCostAttribution` / `useTelemetryAlerts`,
 * so these stories stub `fetch` rather than taking props. That keeps the component
 * itself free of a story-only injection seam.
 */

const FROM = "2026-07-19T00:00:00.000Z";
const TO = "2026-07-26T00:00:00.000Z";

function row(
	key: string,
	costUsd: number,
	totalTokens: number,
	queryCount: number,
	totalCost: number,
	extra: Partial<CostBreakdownRow> = {}
): CostBreakdownRow {
	return {
		key,
		costUsd,
		costShare: totalCost > 0 ? costUsd / totalCost : 0,
		totalTokens,
		promptTokens: Math.round(totalTokens * 0.8),
		completionTokens: Math.round(totalTokens * 0.2),
		cachedInputTokens: 0,
		cacheWriteTokens: 0,
		queryCount,
		eventCount: queryCount,
		unpricedEvents: 0,
		...extra,
	};
}

const TOTAL = 428.6;

const ATTRIBUTION: CostAttributionResponse = {
	window: { from: FROM, to: TO },
	totals: {
		costUsd: TOTAL,
		totalTokens: 41_200_000,
		promptTokens: 26_800_000,
		completionTokens: 4_400_000,
		cachedInputTokens: 10_000_000,
		cacheWriteTokens: 1_100_000,
		queryCount: 18_430,
		eventCount: 18_430,
		unpricedEvents: 620,
		distinctUsers: 84,
		cacheHitRate: 10_000_000 / (10_000_000 + 26_800_000),
	},
	byAgent: [
		row("ResourceAgent", 168.2, 16_100_000, 4_120, TOTAL),
		row("CampaignAgent", 96.4, 9_050_000, 5_310, TOTAL),
		row("EntityGraphAgent", 61.9, 6_400_000, 1_870, TOTAL),
		row("SessionDigestAgent", 44.3, 4_100_000, 940, TOTAL),
		row("RecapAgent", 31.5, 3_050_000, 1_260, TOTAL),
		row("unattributed", 26.3, 2_500_000, 4_930, TOTAL, { unpricedEvents: 620 }),
	],
	byIntent: [
		row("entity_extraction", 191.7, 18_600_000, 5_240, TOTAL),
		row("user_prompt", 118.9, 10_400_000, 7_910, TOTAL),
		row("graph_rebuild", 58.2, 5_900_000, 1_480, TOTAL),
		row("conversation_summary", 29.4, 3_100_000, 2_260, TOTAL),
		row("shard_embedding", 18.6, 2_300_000, 1_040, TOTAL),
		row("session_plan_readout", 11.8, 900_000, 500, TOTAL),
	],
	byModel: [
		row("claude-sonnet-5", 349.1, 26_800_000, 9_120, TOTAL),
		row("claude-haiku-4-5", 78.9, 13_900_000, 8_690, TOTAL),
		row("text-embedding-3-small", 0.6, 500_000, 620, TOTAL),
	],
	byModelRole: [
		row("PIPELINE_STRUCTURED", 209.4, 19_100_000, 5_400, TOTAL),
		row("INTERACTIVE", 131.2, 11_200_000, 8_010, TOTAL),
		row("PIPELINE_LIGHT", 52.8, 8_300_000, 3_720, TOTAL),
		row("ANALYSIS", 35.2, 2_600_000, 1_300, TOTAL),
	],
	bySurface: [
		row("pipeline", 279.5, 28_400_000, 8_120, TOTAL),
		row("interactive", 149.1, 12_800_000, 10_310, TOTAL),
	],
	byTier: [
		row("pro", 264.1, 24_900_000, 9_400, TOTAL),
		row("basic", 131.8, 12_600_000, 6_800, TOTAL),
		row("free", 32.7, 3_700_000, 2_230, TOTAL),
	],
	costPerTier: [
		{
			tier: "pro",
			costUsd: 264.1,
			userCount: 21,
			costPerUserUsd: 264.1 / 21,
			totalTokens: 24_900_000,
			eventCount: 9_400,
		},
		{
			tier: "basic",
			costUsd: 131.8,
			userCount: 38,
			costPerUserUsd: 131.8 / 38,
			totalTokens: 12_600_000,
			eventCount: 6_800,
		},
		{
			tier: "free",
			costUsd: 32.7,
			userCount: 25,
			costPerUserUsd: 32.7 / 25,
			totalTokens: 3_700_000,
			eventCount: 2_230,
		},
	],
	topSpenders: [
		{
			username: "dm_aurelia",
			tier: "pro",
			costUsd: 41.9,
			totalTokens: 3_900_000,
			eventCount: 1_210,
		},
		{
			username: "keeper_of_vaults",
			tier: "pro",
			costUsd: 33.4,
			totalTokens: 3_100_000,
			eventCount: 980,
		},
		{
			username: "brindle",
			tier: "basic",
			costUsd: 18.2,
			totalTokens: 1_800_000,
			eventCount: 740,
		},
	],
	lastUpdated: TO,
};

const ALERTS: TelemetryAlertsResponse = {
	alerts: [
		{
			id: "user_hourly_spend:dm_aurelia",
			type: "user_hourly_spend",
			severity: "critical",
			title: "High hourly spend for dm_aurelia",
			detail: "$12.40 across 318 LLM calls in the last hour (threshold $5.00).",
			value: 12.4,
			threshold: 5,
			username: "dm_aurelia",
			observedAt: TO,
		},
		{
			id: "org_hourly_spend",
			type: "org_hourly_spend",
			severity: "warning",
			title: "High org-wide hourly spend",
			detail:
				"$61.80 across 1,940 LLM calls from 27 users in the last hour (threshold $50.00).",
			value: 61.8,
			threshold: 50,
			observedAt: TO,
		},
		{
			id: "unpriced_spend",
			type: "unpriced_spend",
			severity: "info",
			title: "Cost figures are understated",
			detail:
				"620 of 18430 calls in the last hour could not be priced (3%). Add the missing models to MODEL_RATES in src/config/model-pricing.ts.",
			value: 0.034,
			threshold: 0.2,
			observedAt: TO,
		},
	],
	thresholds: {
		userHourlySpendUsd: 5,
		orgHourlySpendUsd: 50,
		unpricedShare: 0.2,
	},
	lastUpdated: TO,
};

const EMPTY_ATTRIBUTION: CostAttributionResponse = {
	...ATTRIBUTION,
	totals: {
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
	},
	byAgent: [],
	byIntent: [],
	byModel: [],
	byModelRole: [],
	bySurface: [],
	byTier: [],
	costPerTier: [],
	topSpenders: [],
};

function stubFetch(
	attribution: CostAttributionResponse,
	alerts: TelemetryAlertsResponse
) {
	localStorage.setItem(JWT_STORAGE_KEY, "storybook-fixture-token");
	window.fetch = (async (input: RequestInfo | URL) => {
		const url = String(
			typeof input === "string" || input instanceof URL ? input : input.url
		);
		const body = url.includes("/alerts") ? alerts : attribution;
		return new Response(JSON.stringify(body), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}) as typeof window.fetch;
}

const meta = {
	title: "Admin/CostAttributionPanel",
	component: CostAttributionPanel,
	parameters: { layout: "fullscreen" },
	args: { fromDate: FROM, toDate: TO },
	decorators: [
		(Story) => (
			<div className="p-4 bg-neutral-100 dark:bg-neutral-900 min-h-screen">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof CostAttributionPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Populated window with alerts firing — the everyday admin view. */
export const WithSpend: Story = {
	decorators: [
		(Story) => {
			stubFetch(ATTRIBUTION, ALERTS);
			return <Story />;
		},
	],
};

/** Fresh install: migration applied, but no attributed spend recorded yet. */
export const NoSpendRecorded: Story = {
	decorators: [
		(Story) => {
			stubFetch(EMPTY_ATTRIBUTION, {
				...ALERTS,
				alerts: [],
			});
			return <Story />;
		},
	],
};
