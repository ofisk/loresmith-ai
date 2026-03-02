import { ArrowLeft } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { JWT_STORAGE_KEY } from "@/app-constants";
import loresmith from "@/assets/loresmith.png";
import { PrimaryActionButton } from "@/components/button";
import type { BillingLimits, BillingStatus } from "@/hooks/useBillingStatus";
import { API_CONFIG } from "@/shared-config";

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

function formatNumber(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
	return n.toLocaleString();
}

interface BillingPageProps {
	onBack?: () => void;
}

export function BillingPage({ onBack }: BillingPageProps) {
	const [status, setStatus] = useState<BillingStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
	const [upgrading, setUpgrading] = useState<string | null>(null);

	const jwt =
		typeof window !== "undefined"
			? localStorage.getItem(JWT_STORAGE_KEY)
			: null;

	useEffect(() => {
		// Read checkout result from URL
		if (typeof window !== "undefined") {
			const params = new URLSearchParams(window.location.search);
			const result = params.get("checkout");
			if (result === "success") {
				setCheckoutMessage("Subscription activated. Thank you!");
				window.history.replaceState(null, "", "/billing");
			} else if (result === "canceled") {
				setCheckoutMessage("Checkout was canceled.");
				window.history.replaceState(null, "", "/billing");
			}
		}
	}, []);

	useEffect(() => {
		if (!jwt) {
			setLoading(false);
			return;
		}

		let cancelled = false;

		async function fetchStatus() {
			try {
				const res = await fetch(
					API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.BILLING.STATUS),
					{ headers: { Authorization: `Bearer ${jwt}` } }
				);
				if (cancelled) return;
				if (res.ok) {
					const json = (await res.json()) as BillingStatus;
					setStatus(json);
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		}

		fetchStatus();
		return () => {
			cancelled = true;
		};
	}, [jwt]);

	async function handleCheckout(tier: "basic" | "pro") {
		if (!jwt) return;
		setUpgrading(tier);
		try {
			const res = await fetch(
				API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.BILLING.CHECKOUT),
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${jwt}`,
					},
					body: JSON.stringify({ tier }),
				}
			);
			const json = (await res.json()) as { url?: string; error?: string };
			if (json.url) {
				window.location.href = json.url;
			} else {
				setCheckoutMessage(json.error ?? "Checkout failed");
			}
		} catch (err) {
			setCheckoutMessage(
				err instanceof Error ? err.message : "Checkout failed"
			);
		} finally {
			setUpgrading(null);
		}
	}

	async function handleManageSubscription() {
		if (!jwt) return;
		setUpgrading("portal");
		try {
			const res = await fetch(
				API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.BILLING.PORTAL),
				{
					method: "POST",
					headers: { Authorization: `Bearer ${jwt}` },
				}
			);
			const json = (await res.json()) as { url?: string; error?: string };
			if (json.url) {
				window.location.href = json.url;
			} else {
				setCheckoutMessage(json.error ?? "Could not open billing portal");
			}
		} catch (err) {
			setCheckoutMessage(err instanceof Error ? err.message : "Portal failed");
		} finally {
			setUpgrading(null);
		}
	}

	if (!jwt) {
		return (
			<div className="min-h-screen flex flex-col items-center justify-center p-6 bg-neutral-50 dark:bg-neutral-950">
				<p className="text-neutral-600 dark:text-neutral-400 mb-4">
					Sign in to view billing
				</p>
				{onBack && (
					<button
						type="button"
						onClick={onBack}
						className="text-sm text-neutral-600 dark:text-neutral-400 hover:underline"
					>
						Back to app
					</button>
				)}
			</div>
		);
	}

	if (loading || !status) {
		return (
			<div className="min-h-screen flex items-center justify-center p-6 bg-neutral-50 dark:bg-neutral-950">
				<p className="text-neutral-600 dark:text-neutral-400">Loading...</p>
			</div>
		);
	}

	const limits = status.limits as BillingLimits;
	const isPaid = status.tier !== "free";

	return (
		<div className="min-h-screen p-6 bg-neutral-50 dark:bg-neutral-950">
			<div className="max-w-2xl mx-auto">
				<div className="flex items-center gap-4 mb-8">
					{onBack && (
						<button
							type="button"
							onClick={onBack}
							className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
						>
							<ArrowLeft size={18} />
							Back
						</button>
					)}
					<div className="flex items-center gap-3">
						<img src={loresmith} alt="LoreSmith" width={32} height={32} />
						<h1 className="text-xl font-semibold">Billing</h1>
					</div>
				</div>

				{checkoutMessage && (
					<div className="mb-6 p-4 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-sm">
						{checkoutMessage}
					</div>
				)}

				<div className="mb-8 p-6 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
					<h2 className="text-lg font-semibold mb-2">Current plan</h2>
					<p className="text-3xl font-bold capitalize text-neutral-800 dark:text-neutral-100">
						{status.tier}
					</p>
					{isPaid && status.currentPeriodEnd && (
						<p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
							Renews {new Date(status.currentPeriodEnd).toLocaleDateString()}
						</p>
					)}
					{isPaid && (
						<button
							type="button"
							onClick={handleManageSubscription}
							disabled={!!upgrading}
							className="mt-4 text-sm text-neutral-600 dark:text-neutral-400 hover:underline disabled:opacity-50"
						>
							Manage subscription
						</button>
					)}
				</div>

				<div className="mb-8 p-6 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
					<h2 className="text-lg font-semibold mb-4">Plan limits</h2>
					<table className="w-full text-sm">
						<tbody className="text-neutral-600 dark:text-neutral-400">
							<tr>
								<td className="py-2">Campaigns</td>
								<td className="py-2 text-right">
									{limits.maxCampaigns >= 999_999
										? "Unlimited"
										: limits.maxCampaigns}
								</td>
							</tr>
							<tr>
								<td className="py-2">Files</td>
								<td className="py-2 text-right">{limits.maxFiles}</td>
							</tr>
							<tr>
								<td className="py-2">Storage</td>
								<td className="py-2 text-right">
									{formatBytes(limits.storageBytes)}
								</td>
							</tr>
							<tr>
								<td className="py-2">Tokens per day</td>
								<td className="py-2 text-right">{formatNumber(limits.tpd)}</td>
							</tr>
							{limits.monthlyTokens !== undefined && (
								<tr>
									<td className="py-2">Monthly tokens (free tier)</td>
									<td className="py-2 text-right">
										{formatNumber(limits.monthlyTokens)}
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>

				{status.tier === "free" && (
					<div className="space-y-4">
						<h2 className="text-lg font-semibold">Upgrade</h2>
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="p-6 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
								<h3 className="font-semibold">Basic — $9/month</h3>
								<p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
									5 campaigns, 25 files, 25MB storage, higher rate limits
								</p>
								<PrimaryActionButton
									onClick={() => handleCheckout("basic")}
									disabled={!!upgrading}
									className="mt-4 w-full"
								>
									{upgrading === "basic"
										? "Redirecting..."
										: "Upgrade to Basic"}
								</PrimaryActionButton>
							</div>
							<div className="p-6 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
								<h3 className="font-semibold">Pro — $18/month</h3>
								<p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
									Unlimited campaigns, 100 files, 100MB, 2× rate limits
								</p>
								<PrimaryActionButton
									onClick={() => handleCheckout("pro")}
									disabled={!!upgrading}
									className="mt-4 w-full"
								>
									{upgrading === "pro" ? "Redirecting..." : "Upgrade to Pro"}
								</PrimaryActionButton>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
