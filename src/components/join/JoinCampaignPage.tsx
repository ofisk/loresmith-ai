import { useCallback, useEffect, useState } from "react";
import loresmith from "@/assets/loresmith.png";
import { PrimaryActionButton } from "@/components/button";
import {
	type PlayerCharacterOption,
	PlayerCharacterSelectionPanel,
} from "@/components/campaign/PlayerCharacterSelectionModal";
import { CAMPAIGN_ROLE_LABELS } from "@/constants/campaign-roles";
import { clearJoinIntent, setJoinIntent } from "@/lib/join-intent";
import { API_CONFIG } from "@/shared-config";

interface JoinCampaignPageProps {
	token: string;
	jwt: string | null;
	onOpenAuthModal: () => void;
	onJoinSuccess: (campaignId: string) => void;
}

export function JoinCampaignPage({
	token,
	jwt,
	onOpenAuthModal,
	onJoinSuccess,
}: JoinCampaignPageProps) {
	const [status, setStatus] = useState<
		| "loading"
		| "preview"
		| "joining"
		| "needsCharacterSelection"
		| "success"
		| "error"
	>("loading");
	const [campaignName, setCampaignName] = useState<string | null>(null);
	const [role, setRole] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [campaignId, setCampaignId] = useState<string | null>(null);
	const [claimOptions, setClaimOptions] = useState<PlayerCharacterOption[]>([]);
	const [isSubmittingClaim, setIsSubmittingClaim] = useState(false);

	const loadClaimOptions = useCallback(
		async (resolvedCampaignId: string, authJwt: string) => {
			const optionsRes = await fetch(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.CAMPAIGNS.PLAYER_CHARACTER_CLAIM_OPTIONS(
						resolvedCampaignId
					)
				),
				{
					headers: { Authorization: `Bearer ${authJwt}` },
				}
			);
			const optionsData = (await optionsRes.json()) as {
				options?: PlayerCharacterOption[];
				requiresCharacterSelection?: boolean;
				error?: string;
			};
			if (!optionsRes.ok) {
				throw new Error(
					optionsData.error ?? "Failed to load available player characters"
				);
			}
			if (!optionsData.requiresCharacterSelection) {
				setStatus("success");
				onJoinSuccess(resolvedCampaignId);
				return;
			}
			setClaimOptions(optionsData.options ?? []);
			setStatus("needsCharacterSelection");
		},
		[onJoinSuccess]
	);

	useEffect(() => {
		let cancelled = false;

		async function checkLink() {
			try {
				const url = `${API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.JOIN)}?token=${encodeURIComponent(token)}`;
				const headers: Record<string, string> = {};
				if (jwt) {
					headers.Authorization = `Bearer ${jwt}`;
				}
				const res = await fetch(url, { headers });

				const data = (await res.json()) as {
					success?: boolean;
					campaignId?: string;
					campaignName?: string;
					role?: string;
					requiresCharacterSelection?: boolean;
					url?: string;
					error?: string;
					redirectToLogin?: boolean;
				};

				if (cancelled) return;

				if (res.ok && data.success) {
					clearJoinIntent();
					setCampaignId(data.campaignId ?? null);
					setCampaignName(data.campaignName ?? null);
					setRole(data.role ?? null);
					if (data.campaignId && data.requiresCharacterSelection && jwt) {
						await loadClaimOptions(data.campaignId, jwt);
						return;
					}
					setStatus("success");
					if (data.campaignId) {
						onJoinSuccess(data.campaignId);
					}
					return;
				}

				if (res.status === 401 && data.redirectToLogin) {
					setCampaignName(data.campaignName ?? null);
					setRole(data.role ?? null);
					setCampaignId(data.campaignId ?? null);
					setStatus("preview");
					// Store join intent so we can redirect back after auth (handles OAuth redirects, email verification)
					setJoinIntent({
						joinToken: token,
						campaignId: data.campaignId ?? null,
						campaignName: data.campaignName ?? null,
						role: data.role ?? null,
					});
					// Route unauthenticated users to sign-in; after auth, we stay on /join?token=xxx
					// and the effect will re-run with the new JWT to complete the join
					if (!jwt) {
						onOpenAuthModal();
					}
					return;
				}

				clearJoinIntent();
				setError(data.error ?? "Invalid or expired link");
				setStatus("error");
			} catch (_err) {
				if (cancelled) return;
				clearJoinIntent();
				setError("Failed to load invite");
				setStatus("error");
			}
		}

		checkLink();
		return () => {
			cancelled = true;
		};
	}, [token, jwt, onJoinSuccess, onOpenAuthModal, loadClaimOptions]);

	const handleJoin = async () => {
		if (!jwt) {
			onOpenAuthModal();
			return;
		}
		setStatus("joining");
		try {
			const url = `${API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.JOIN)}?token=${encodeURIComponent(token)}`;
			const res = await fetch(url, {
				headers: { Authorization: `Bearer ${jwt}` },
			});
			const data = (await res.json()) as {
				success?: boolean;
				campaignId?: string;
				campaignName?: string;
				role?: string;
				requiresCharacterSelection?: boolean;
				url?: string;
				error?: string;
			};
			if (res.ok && data.success && data.campaignId) {
				clearJoinIntent();
				setCampaignId(data.campaignId);
				setCampaignName(data.campaignName ?? null);
				setRole(data.role ?? null);
				if (data.requiresCharacterSelection) {
					await loadClaimOptions(data.campaignId, jwt);
					return;
				}
				setStatus("success");
				onJoinSuccess(data.campaignId);
			} else {
				clearJoinIntent();
				setError(data.error ?? "Failed to join campaign");
				setStatus("error");
			}
		} catch {
			clearJoinIntent();
			setError("Failed to join campaign");
			setStatus("error");
		}
	};

	const handleSubmitClaim = async (entityId: string) => {
		if (!jwt || !campaignId) return;
		setIsSubmittingClaim(true);
		setError(null);
		try {
			const response = await fetch(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.CAMPAIGNS.PLAYER_CHARACTER_CLAIM(campaignId)
				),
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${jwt}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ entityId }),
				}
			);
			const data = (await response.json()) as { error?: string };
			if (!response.ok) {
				throw new Error(data.error ?? "Failed to save player character claim");
			}
			clearJoinIntent();
			setStatus("success");
			onJoinSuccess(campaignId);
		} catch (claimError) {
			setError(
				claimError instanceof Error
					? claimError.message
					: "Failed to save player character claim"
			);
		} finally {
			setIsSubmittingClaim(false);
		}
	};

	if (status === "loading") {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 p-6">
				<div className="text-neutral-400">Checking invite link…</div>
			</div>
		);
	}

	if (status === "error") {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 p-6">
				<img
					src={loresmith}
					alt="LoreSmith"
					className="mb-6 h-12 w-auto opacity-90"
				/>
				<div className="text-center text-neutral-300">
					<p className="text-lg font-medium text-red-400">{error}</p>
					<a
						href="/"
						className="mt-4 inline-block text-sm text-blue-400 hover:underline"
					>
						Return to LoreSmith
					</a>
				</div>
			</div>
		);
	}

	if (status === "success") {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 p-6">
				<img
					src={loresmith}
					alt="LoreSmith"
					className="mb-6 h-12 w-auto opacity-90"
				/>
				<div className="text-center text-neutral-300">
					<p className="text-lg font-medium text-green-400">
						You joined the campaign
					</p>
					{campaignName && (
						<p className="mt-2 text-neutral-400">&quot;{campaignName}&quot;</p>
					)}
					<button
						type="button"
						className="mt-4 inline-block text-sm text-blue-400 hover:underline"
						onClick={() => campaignId && onJoinSuccess(campaignId)}
					>
						Go to campaign
					</button>
				</div>
			</div>
		);
	}

	if (status === "needsCharacterSelection") {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 p-6">
				<img
					src={loresmith}
					alt="LoreSmith"
					className="mb-6 h-12 w-auto opacity-90"
				/>
				<div className="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-900 p-6">
					<PlayerCharacterSelectionPanel
						title="Choose your character"
						description={
							campaignName
								? `Select your character for "${campaignName}" before entering the campaign.`
								: "Select your character before entering the campaign."
						}
						options={claimOptions}
						submitLabel="Continue to campaign"
						isSubmitting={isSubmittingClaim}
						error={error}
						onSubmit={handleSubmitClaim}
					/>
				</div>
			</div>
		);
	}

	// preview - show "Join as [role]?" and log in button
	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 p-6">
			<img
				src={loresmith}
				alt="LoreSmith"
				className="mb-6 h-12 w-auto opacity-90"
			/>
			<div className="max-w-sm rounded-lg border border-neutral-700 bg-neutral-900 p-6 text-center">
				<h1 className="text-xl font-semibold text-white">Join campaign</h1>
				{campaignName && (
					<p className="mt-2 text-neutral-300">&quot;{campaignName}&quot;</p>
				)}
				{role && (
					<p className="mt-1 text-sm text-neutral-400">
						You will join as{" "}
						{(CAMPAIGN_ROLE_LABELS as Record<string, string>)[role] ?? role}
					</p>
				)}
				<div className="mt-6 flex flex-col gap-3">
					<PrimaryActionButton
						onClick={handleJoin}
						disabled={status === "joining"}
					>
						{jwt
							? status === "joining"
								? "Joining…"
								: "Join campaign"
							: "Log in to join"}
					</PrimaryActionButton>
					<a
						href="/"
						className="text-sm text-neutral-500 hover:text-neutral-400"
					>
						Cancel
					</a>
				</div>
			</div>
		</div>
	);
}
