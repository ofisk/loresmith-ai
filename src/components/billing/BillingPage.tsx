import { ArrowLeft } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { JWT_STORAGE_KEY } from "@/app-constants";
import loresmith from "@/assets/loresmith.png";
import { CreditPurchaseSection } from "@/components/billing/CreditPurchaseSection";
import { PrimaryActionButton } from "@/components/button";
import { Modal } from "@/components/modal/Modal";
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
	const [loadError, setLoadError] = useState<string | null>(null);
	const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
	const [upgrading, setUpgrading] = useState<string | null>(null);
	const [changingPlan, setChangingPlan] = useState<string | null>(null);
	const [confirmPlanChange, setConfirmPlanChange] = useState<
		"basic" | "pro" | null
	>(null);
	const [interval, setInterval] = useState<"monthly" | "annual">("monthly");

	const jwt =
		typeof window !== "undefined"
			? localStorage.getItem(JWT_STORAGE_KEY)
			: null;

	useEffect(() => {
		// Read checkout result from URL
		if (typeof window !== "undefined") {
			const params = new URLSearchParams(window.location.search);
			const result = params.get("checkout");
			const credits = params.get("credits");
			if (result === "success") {
				setCheckoutMessage("Subscription activated. Thank you!");
				window.history.replaceState(null, "", "/billing");
			} else if (result === "canceled") {
				setCheckoutMessage("Checkout was canceled.");
				window.history.replaceState(null, "", "/billing");
			} else if (credits === "purchased") {
				setCheckoutMessage(
					"Credits purchased successfully. Your quota has been updated."
				);
				window.history.replaceState(null, "", "/billing");
			}
			if (params.get("tab") === "credits") {
				setTimeout(() => {
					document.getElementById("credits-section")?.scrollIntoView({
						behavior: "smooth",
						block: "start",
					});
				}, 100);
			}
		}
	}, []);

	const fetchStatus = useCallback(async () => {
		if (!jwt) return;
		setLoading(true);
		setLoadError(null);
		try {
			const res = await fetch(
				API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.BILLING.STATUS),
				{ headers: { Authorization: `Bearer ${jwt}` } }
			);
			if (res.ok) {
				const json = (await res.json()) as BillingStatus;
				setStatus(json);
				setLoadError(null);
			} else {
				const data = (await res.json().catch(() => ({}))) as {
					error?: string;
				};
				setLoadError(
					data.error ??
						(res.status === 403
							? "Access denied"
							: res.status === 401
								? "Session expired"
								: "Failed to load billing")
				);
			}
		} catch (err) {
			setLoadError(
				err instanceof Error ? err.message : "Failed to load billing"
			);
		} finally {
			setLoading(false);
		}
	}, [jwt]);

	useEffect(() => {
		if (!jwt) {
			setLoading(false);
			return;
		}
		fetchStatus();
	}, [jwt, fetchStatus]);

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
					body: JSON.stringify({ tier, interval }),
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

	async function handleConfirmPlanChange(tier: "basic" | "pro") {
		setConfirmPlanChange(null);
		await handleChangePlan(tier);
	}

	async function handleChangePlan(tier: "basic" | "pro") {
		if (!jwt) return;
		setChangingPlan(tier);
		setCheckoutMessage(null);
		try {
			const res = await fetch(
				API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.BILLING.CHANGE_PLAN),
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${jwt}`,
					},
					body: JSON.stringify({ tier }),
				}
			);
			const json = (await res.json()) as {
				success?: boolean;
				error?: string;
				message?: string;
			};
			if (json.success) {
				setCheckoutMessage(json.message ?? "Plan updated successfully.");
				fetchStatus();
			} else {
				setCheckoutMessage(json.error ?? "Failed to change plan");
			}
		} catch (err) {
			setCheckoutMessage(
				err instanceof Error ? err.message : "Failed to change plan"
			);
		} finally {
			setChangingPlan(null);
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

	if (loading && !status) {
		return (
			<div className="min-h-screen flex items-center justify-center p-6 bg-neutral-50 dark:bg-neutral-950">
				<p className="text-neutral-600 dark:text-neutral-400">Loading...</p>
			</div>
		);
	}

	if (loadError) {
		return (
			<div className="min-h-screen flex flex-col items-center justify-center p-6 bg-neutral-50 dark:bg-neutral-950">
				<p className="text-neutral-600 dark:text-neutral-400 mb-4">
					{loadError}
				</p>
				<div className="flex gap-3">
					<button
						type="button"
						onClick={() => fetchStatus()}
						className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
					>
						Retry
					</button>
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
			</div>
		);
	}

	if (!status) {
		return null;
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
						<div className="mt-4 flex flex-wrap items-center gap-3">
							{status.tier === "basic" && (
								<PrimaryActionButton
									onClick={() => setConfirmPlanChange("pro")}
									disabled={!!changingPlan || !!upgrading}
									className="text-sm"
								>
									{changingPlan === "pro" ? "Updating..." : "Upgrade to Pro"}
								</PrimaryActionButton>
							)}
							{status.tier === "pro" && (
								<button
									type="button"
									onClick={() => setConfirmPlanChange("basic")}
									disabled={!!changingPlan || !!upgrading}
									className="rounded-lg border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
								>
									{changingPlan === "basic"
										? "Updating..."
										: "Downgrade to Basic"}
								</button>
							)}
							<button
								type="button"
								onClick={handleManageSubscription}
								disabled={!!upgrading || !!changingPlan}
								className="text-sm text-neutral-600 dark:text-neutral-400 hover:underline disabled:opacity-50"
							>
								Manage subscription
							</button>
						</div>
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
								<>
									<tr>
										<td className="py-2">Monthly tokens (free tier)</td>
										<td className="py-2 text-right">
											{status.monthlyUsage !== undefined
												? `${formatNumber(status.monthlyUsage)} / `
												: ""}
											{formatNumber(
												limits.monthlyTokens + (status.creditsRemaining ?? 0)
											)}
										</td>
									</tr>
									{(status.creditsRemaining ?? 0) > 0 && (
										<tr>
											<td className="py-2">Credits purchased</td>
											<td className="py-2 text-right">
												{formatNumber(status.creditsRemaining ?? 0)}
											</td>
										</tr>
									)}
								</>
							)}
						</tbody>
					</table>
				</div>

				<CreditPurchaseSection
					status={status}
					onPurchaseError={(msg) => setCheckoutMessage(msg)}
				/>

				{status.tier === "free" && (
					<div className="space-y-4">
						<div className="flex items-center justify-between">
							<h2 className="text-lg font-semibold">Upgrade</h2>
							<div className="flex rounded-lg border border-neutral-200 dark:border-neutral-700 p-0.5 bg-neutral-100 dark:bg-neutral-800">
								<button
									type="button"
									onClick={() => setInterval("monthly")}
									className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
										interval === "monthly"
											? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 font-medium shadow-sm"
											: "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
									}`}
								>
									Monthly
								</button>
								<button
									type="button"
									onClick={() => setInterval("annual")}
									className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
										interval === "annual"
											? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 font-medium shadow-sm"
											: "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
									}`}
								>
									Annual
									<span className="ml-1.5 text-xs text-emerald-600 dark:text-emerald-400">
										Save ~15%
									</span>
								</button>
							</div>
						</div>
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="p-6 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
								<h3 className="font-semibold">
									Basic — {interval === "monthly" ? "$9/month" : "$92/year"}
								</h3>
								<p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
									Several campaigns with room for sourcebooks, character sheets,
									and handouts in each. Great for running one or two tables.
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
								<h3 className="font-semibold">
									Pro — {interval === "monthly" ? "$18/month" : "$184/year"}
								</h3>
								<p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
									Unlimited campaigns and a large library. Run multiple tables
									or build a big collection of sourcebooks and adventures.
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

			<Modal
				isOpen={confirmPlanChange !== null}
				onClose={() => setConfirmPlanChange(null)}
				clickOutsideToClose={true}
			>
				<div className="p-4 sm:p-6 max-w-md">
					<h3 className="text-lg font-semibold mb-3">
						{confirmPlanChange === "pro"
							? "Upgrade to Pro"
							: "Downgrade to Basic"}
					</h3>
					{confirmPlanChange === "pro" ? (
						<p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
							You will be charged a prorated amount immediately for the
							remainder of your billing period. You will get unlimited campaigns
							and a large library for sourcebooks, adventures, and character
							sheets.
						</p>
					) : (
						<p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
							You will receive a prorated credit for the unused portion of your
							Pro subscription. If you have already exceeded Basic tier limits
							(several campaigns and a smaller library), you may be locked out
							of creating new content until you reduce your usage.
						</p>
					)}
					<div className="flex gap-3 justify-end">
						<button
							type="button"
							onClick={() => setConfirmPlanChange(null)}
							className="rounded-lg border border-neutral-300 dark:border-neutral-600 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
						>
							Cancel
						</button>
						<PrimaryActionButton
							onClick={() =>
								confirmPlanChange && handleConfirmPlanChange(confirmPlanChange)
							}
							disabled={!confirmPlanChange || !!changingPlan}
							className="text-sm"
						>
							{changingPlan ? "Updating..." : "Confirm"}
						</PrimaryActionButton>
					</div>
				</div>
			</Modal>
		</div>
	);
}
