import { JWT_STORAGE_KEY } from "@/app-constants";
import { PrimaryActionButton } from "@/components/button";
import type { BillingStatus } from "@/hooks/useBillingStatus";
import { API_CONFIG } from "@/shared-config";

interface CreditPurchaseSectionProps {
	status: BillingStatus;
	onPurchaseError?: (message: string) => void;
}

export function CreditPurchaseSection({
	status,
	onPurchaseError,
}: CreditPurchaseSectionProps) {
	if (status.tier !== "free") return null;
	if (status.limits.monthlyTokens === undefined) return null;

	const jwt =
		typeof window !== "undefined"
			? localStorage.getItem(JWT_STORAGE_KEY)
			: null;

	async function handleBuyCredits() {
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
				One-time credits extend your monthly token limit for AI indexing (adding
				files to campaigns). Credits never expire.
			</p>
			<div className="flex flex-wrap items-center justify-between gap-4">
				<div className="text-sm">
					<p className="text-neutral-600 dark:text-neutral-400">
						This month:{" "}
						<strong className="text-neutral-800 dark:text-neutral-200">
							{monthlyUsage.toLocaleString()} /{" "}
							{effectiveLimit.toLocaleString()} tokens
						</strong>
					</p>
					{credits > 0 && (
						<p className="text-neutral-500 dark:text-neutral-500 mt-0.5">
							{credits.toLocaleString()} credits purchased
						</p>
					)}
				</div>
				<PrimaryActionButton onClick={handleBuyCredits} className="shrink-0">
					Buy 5,000 tokens
				</PrimaryActionButton>
			</div>
		</div>
	);
}
