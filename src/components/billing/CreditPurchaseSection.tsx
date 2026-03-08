import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { useState } from "react";
import { JWT_STORAGE_KEY } from "@/app-constants";
import { PrimaryActionButton } from "@/components/button";
import type { BillingStatus } from "@/hooks/useBillingStatus";
import { API_CONFIG } from "@/shared-config";

const BOOST_OPTIONS = [
	{
		tokens: 50_000,
		label: "Small boost",
		price: "$0.99",
		rationale:
			"A couple of sourcebooks, a few character sheets, or a small batch of notes.",
	},
	{
		tokens: 200_000,
		label: "Standard boost",
		price: "$2.99",
		rationale:
			"A full campaign's worth of core setting materials, several adventures, and handouts.",
	},
	{
		tokens: 500_000,
		label: "Large boost",
		price: "$5.99",
		rationale:
			"Multiple campaigns at once, or a large world-building library in one go.",
	},
] as const;

const BOOST_HELP = {
	title: "Which boost is right for me?",
	intro:
		"Think about how much you're adding to your campaigns right now. The AI needs capacity to read and prepare each document so you can search it and ask questions later.",
	small:
		"**Small** – You're adding a few things to one campaign: a couple of sourcebooks, some character sheets, or a small stack of notes. Good for topping up when you hit the limit mid-session.",
	standard:
		"**Standard** – You're setting up a whole campaign: your core setting doc, a few adventures, and the handouts you'll need. Covers most import sessions.",
	large:
		"**Large** – You're doing a big import: multiple campaigns at once, or a large world-building library (dozens of documents). For heavy prep days.",
} as const;

interface CreditPurchaseSectionProps {
	status: BillingStatus;
	onPurchaseError?: (message: string) => void;
}

export function CreditPurchaseSection({
	status,
	onPurchaseError,
}: CreditPurchaseSectionProps) {
	const [helpExpanded, setHelpExpanded] = useState(false);

	if (status.tier !== "free") return null;
	if (status.limits.monthlyTokens === undefined) return null;

	const jwt =
		typeof window !== "undefined"
			? localStorage.getItem(JWT_STORAGE_KEY)
			: null;

	async function handleBuyCredits(amount: number) {
		if (!jwt) return;
		try {
			const res = await fetch(
				API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.BILLING.CHECKOUT_CREDITS),
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${jwt}`,
					},
					body: JSON.stringify({ amount }),
				}
			);
			const json = (await res.json()) as { url?: string; error?: string };
			if (json.url) {
				window.location.href = json.url;
			} else {
				onPurchaseError?.(json.error ?? "Checkout failed");
			}
		} catch (err) {
			onPurchaseError?.(err instanceof Error ? err.message : "Checkout failed");
		}
	}

	const baseLimit = status.limits.monthlyTokens;
	const credits = status.creditsRemaining ?? 0;
	const effectiveLimit = baseLimit + credits;
	const monthlyUsage = status.monthlyUsage ?? 0;

	return (
		<div
			id="credits-section"
			className="mb-8 p-6 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
		>
			<h2 className="text-lg font-semibold mb-2">Indexing credits</h2>
			<p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
				One-time credits give you more capacity to add documents to campaigns.
				Credits never expire.
			</p>

			{/* Help me choose - collapsible */}
			<div className="mb-4 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
				<button
					type="button"
					onClick={() => setHelpExpanded(!helpExpanded)}
					className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
				>
					{helpExpanded ? (
						<CaretDown size={16} className="shrink-0" />
					) : (
						<CaretRight size={16} className="shrink-0" />
					)}
					{BOOST_HELP.title}
				</button>
				{helpExpanded && (
					<div className="px-4 pb-4 pt-0 space-y-3 text-sm text-neutral-600 dark:text-neutral-400 border-t border-neutral-200 dark:border-neutral-700">
						<p>{BOOST_HELP.intro}</p>
						<div className="space-y-2 pl-6">
							<p>{BOOST_HELP.small.replace(/\*\*/g, "")}</p>
							<p>{BOOST_HELP.standard.replace(/\*\*/g, "")}</p>
							<p>{BOOST_HELP.large.replace(/\*\*/g, "")}</p>
						</div>
					</div>
				)}
			</div>

			<div className="mb-4">
				<p className="text-sm text-neutral-600 dark:text-neutral-400">
					This month:{" "}
					<strong className="text-neutral-800 dark:text-neutral-200">
						{monthlyUsage.toLocaleString()} / {effectiveLimit.toLocaleString()}{" "}
						tokens
					</strong>
				</p>
				{credits > 0 && (
					<p className="text-sm text-neutral-500 dark:text-neutral-500 mt-0.5">
						{credits.toLocaleString()} credits purchased
					</p>
				)}
			</div>
			<div className="grid gap-3 sm:grid-cols-3">
				{BOOST_OPTIONS.map((opt) => (
					<div
						key={opt.tokens}
						className="flex flex-col rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 p-4"
					>
						<div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
							{opt.label}
						</div>
						<div className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mt-1">
							{opt.price}
						</div>
						<p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 flex-1">
							{opt.tokens.toLocaleString()} tokens · {opt.rationale}
						</p>
						<PrimaryActionButton
							onClick={() => handleBuyCredits(opt.tokens)}
							className="mt-3 w-full text-sm"
						>
							Buy {opt.tokens >= 1000 ? `${opt.tokens / 1000}K` : opt.tokens}{" "}
							tokens
						</PrimaryActionButton>
					</div>
				))}
			</div>
		</div>
	);
}
