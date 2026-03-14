import { useCallback, useEffect, useState } from "react";
import { PrimaryActionButton } from "@/components/button";
import { Modal } from "@/components/modal/Modal";
import { CAMPAIGN_ROLES, SHARE_ROLE_OPTIONS } from "@/constants/campaign-roles";
import { useAuthenticatedRequest } from "@/hooks/useAuthenticatedRequest";
import { API_CONFIG } from "@/shared-config";
import type { Campaign } from "@/types/campaign";

interface ShareCampaignModalProps {
	campaign: Campaign | null;
	isOpen: boolean;
	onClose: () => void;
}

interface PlayerCharacterClaim {
	username: string;
	entityId: string;
	entityName: string;
	assignedBy: string;
	updatedAt: string;
}

interface UnclaimedOption {
	id: string;
	name: string;
}

export function ShareCampaignModal({
	campaign,
	isOpen,
	onClose,
}: ShareCampaignModalProps) {
	const [role, setRole] = useState<
		(typeof SHARE_ROLE_OPTIONS)[number]["value"]
	>(CAMPAIGN_ROLES.READONLY_PLAYER);
	const [expiresAt, setExpiresAt] = useState("");
	const [maxUses, setMaxUses] = useState("");
	const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
	const [links, setLinks] = useState<
		Array<{
			token: string;
			role: string;
			expiresAt: string | null;
			maxUses: number | null;
			useCount: number;
			createdAt: string;
		}>
	>([]);
	const [loading, setLoading] = useState(false);
	const [listing, setListing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [claims, setClaims] = useState<PlayerCharacterClaim[]>([]);
	const [unclaimedOptions, setUnclaimedOptions] = useState<UnclaimedOption[]>(
		[]
	);
	const [claimSelections, setClaimSelections] = useState<
		Record<string, string>
	>({});
	const [claimsListing, setClaimsListing] = useState(false);
	const [claimError, setClaimError] = useState<string | null>(null);
	const [savingClaimFor, setSavingClaimFor] = useState<string | null>(null);
	const [clearingClaimFor, setClearingClaimFor] = useState<string | null>(null);
	const [claimSaveErrorByUser, setClaimSaveErrorByUser] = useState<
		Record<string, string>
	>({});
	const [hasAnyPcEntities, setHasAnyPcEntities] = useState<boolean | null>(
		null
	);

	const { makeRequest } = useAuthenticatedRequest();

	const fetchLinks = useCallback(async () => {
		if (!campaign?.campaignId) return;
		setListing(true);
		setError(null);
		try {
			const res = await makeRequest(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.CAMPAIGNS.SHARE_LINKS(campaign.campaignId)
				)
			);
			const data = (await res.json()) as {
				links?: Array<{
					token: string;
					role: string;
					expiresAt: string | null;
					maxUses: number | null;
					useCount: number;
					createdAt: string;
				}>;
			};
			if (res.ok && data.links) {
				setLinks(data.links);
			}
		} catch {
			setError("Failed to load share links");
		} finally {
			setListing(false);
		}
	}, [campaign?.campaignId, makeRequest]);

	const fetchClaims = useCallback(async () => {
		if (!campaign?.campaignId) return;
		setClaimsListing(true);
		setClaimError(null);
		setClaimSaveErrorByUser({});
		try {
			const res = await makeRequest(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.CAMPAIGNS.PLAYER_CHARACTER_CLAIMS(
						campaign.campaignId
					)
				)
			);
			const data = (await res.json()) as {
				claims?: PlayerCharacterClaim[];
				unclaimedOptions?: UnclaimedOption[];
				error?: string;
			};
			if (res.ok) {
				const nextClaims = data.claims ?? [];
				const nextUnclaimed = data.unclaimedOptions ?? [];
				setClaims(nextClaims);
				setUnclaimedOptions(nextUnclaimed);
				setHasAnyPcEntities(nextClaims.length + nextUnclaimed.length > 0);
				setClaimSelections(
					nextClaims.reduce<Record<string, string>>((acc, claim) => {
						acc[claim.username] = claim.entityId;
						return acc;
					}, {})
				);
			} else {
				setHasAnyPcEntities(null);
				setClaimError(data.error ?? "Failed to load player character claims");
			}
		} catch {
			setHasAnyPcEntities(null);
			setClaimError("Failed to load player character claims");
		} finally {
			setClaimsListing(false);
		}
	}, [campaign?.campaignId, makeRequest]);

	const handleClaimSelectionChange = (username: string, entityId: string) => {
		setClaimSelections((prev) => ({ ...prev, [username]: entityId }));
		setClaimSaveErrorByUser((prev) => ({ ...prev, [username]: "" }));
	};

	const handleSaveClaim = async (username: string) => {
		if (!campaign?.campaignId) return;
		const selectedEntityId = claimSelections[username];
		if (!selectedEntityId) {
			setClaimSaveErrorByUser((prev) => ({
				...prev,
				[username]: "Select a player character before saving",
			}));
			return;
		}

		setSavingClaimFor(username);
		setClaimSaveErrorByUser((prev) => ({ ...prev, [username]: "" }));
		try {
			const res = await makeRequest(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.CAMPAIGNS.PLAYER_CHARACTER_CLAIM_ASSIGN(
						campaign.campaignId,
						username
					)
				),
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ entityId: selectedEntityId }),
				}
			);
			const data = (await res.json()) as { error?: string };
			if (res.ok) {
				await fetchClaims();
			} else {
				setClaimSaveErrorByUser((prev) => ({
					...prev,
					[username]: data.error ?? "Failed to save player character claim",
				}));
			}
		} catch {
			setClaimSaveErrorByUser((prev) => ({
				...prev,
				[username]: "Failed to save player character claim",
			}));
		} finally {
			setSavingClaimFor(null);
		}
	};

	const handleClearClaim = async (username: string) => {
		if (!campaign?.campaignId) return;
		setClearingClaimFor(username);
		setClaimSaveErrorByUser((prev) => ({ ...prev, [username]: "" }));
		try {
			const res = await makeRequest(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.CAMPAIGNS.PLAYER_CHARACTER_CLAIM_ASSIGN(
						campaign.campaignId,
						username
					)
				),
				{
					method: "DELETE",
				}
			);
			const data = (await res.json()) as { error?: string };
			if (res.ok) {
				await fetchClaims();
			} else {
				setClaimSaveErrorByUser((prev) => ({
					...prev,
					[username]: data.error ?? "Failed to clear player character claim",
				}));
			}
		} catch {
			setClaimSaveErrorByUser((prev) => ({
				...prev,
				[username]: "Failed to clear player character claim",
			}));
		} finally {
			setClearingClaimFor(null);
		}
	};

	const handleGenerate = async () => {
		if (!campaign?.campaignId) return;
		setLoading(true);
		setError(null);
		setGeneratedUrl(null);
		try {
			const res = await makeRequest(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.CAMPAIGNS.SHARE_LINKS(campaign.campaignId)
				),
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						role,
						expiresAt: expiresAt || null,
						maxUses: maxUses ? parseInt(maxUses, 10) : null,
					}),
				}
			);
			const data = (await res.json()) as {
				token?: string;
				url?: string;
				error?: string;
			};
			if (res.ok && data.url) {
				setGeneratedUrl(data.url);
				fetchLinks();
			} else {
				setError(data.error ?? "Failed to create share link");
			}
		} catch {
			setError("Failed to create share link");
		} finally {
			setLoading(false);
		}
	};

	const handleCopy = async () => {
		if (!generatedUrl) return;
		try {
			await navigator.clipboard.writeText(generatedUrl);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			setError("Failed to copy to clipboard");
		}
	};

	const handleRevoke = async (token: string) => {
		if (!campaign?.campaignId) return;
		try {
			const url = API_CONFIG.buildUrl(
				API_CONFIG.ENDPOINTS.CAMPAIGNS.SHARE_LINKS_REVOKE(
					campaign.campaignId,
					token
				)
			);
			const res = await makeRequest(url, { method: "DELETE" });
			if (res.ok) {
				fetchLinks();
				if (generatedUrl?.includes(token)) {
					setGeneratedUrl(null);
				}
			}
		} catch {
			setError("Failed to revoke link");
		}
	};

	const loadLinks = useCallback(() => {
		if (isOpen && campaign?.campaignId) {
			fetchLinks();
		}
	}, [isOpen, campaign?.campaignId, fetchLinks]);

	useEffect(() => {
		if (!isOpen || !campaign?.campaignId) return;
		void Promise.all([fetchLinks(), fetchClaims()]);
	}, [isOpen, campaign?.campaignId, fetchLinks, fetchClaims]);

	const isPlayerShareRole =
		role === CAMPAIGN_ROLES.EDITOR_PLAYER ||
		role === CAMPAIGN_ROLES.READONLY_PLAYER;
	const showNoPcShareWarning =
		isPlayerShareRole && hasAnyPcEntities === false && !claimsListing;

	return (
		<Modal isOpen={isOpen} onClose={onClose} className="modal-size-standard">
			<div className="p-6 space-y-4">
				<h2 className="text-lg font-semibold text-neutral-100 mb-4">
					Share campaign
				</h2>
				{error && (
					<div className="rounded bg-red-500/10 px-3 py-2 text-sm text-red-400">
						{error}
					</div>
				)}

				<div>
					<label
						htmlFor="share-role"
						className="block text-sm font-medium text-neutral-300 mb-1"
					>
						Role for new link
					</label>
					<select
						id="share-role"
						value={role}
						onChange={(e) =>
							setRole(
								e.target.value as (typeof SHARE_ROLE_OPTIONS)[number]["value"]
							)
						}
						className="w-full rounded border border-neutral-600 bg-neutral-800 px-3 py-2 text-neutral-100"
					>
						{SHARE_ROLE_OPTIONS.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</select>
				</div>
				{showNoPcShareWarning && (
					<div className="rounded border border-amber-600/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
						No player characters exist in this campaign yet. Create at least one
						PC before sending player share links so players can claim a
						character when they join.
					</div>
				)}

				<div>
					<label
						htmlFor="share-expires"
						className="block text-sm font-medium text-neutral-300 mb-1"
					>
						Expires at (optional)
					</label>
					<input
						id="share-expires"
						type="datetime-local"
						value={expiresAt}
						onChange={(e) => setExpiresAt(e.target.value)}
						className="w-full rounded border border-neutral-600 bg-neutral-800 px-3 py-2 text-neutral-100"
					/>
				</div>

				<div>
					<label
						htmlFor="share-max-uses"
						className="block text-sm font-medium text-neutral-300 mb-1"
					>
						Max uses (optional)
					</label>
					<input
						id="share-max-uses"
						type="number"
						min="1"
						placeholder="Unlimited"
						value={maxUses}
						onChange={(e) => setMaxUses(e.target.value)}
						className="w-full rounded border border-neutral-600 bg-neutral-800 px-3 py-2 text-neutral-100"
					/>
				</div>

				<PrimaryActionButton onClick={handleGenerate} disabled={loading}>
					{loading ? "Generating…" : "Generate link"}
				</PrimaryActionButton>

				{generatedUrl && (
					<div className="flex items-center gap-2 rounded border border-neutral-600 bg-neutral-800/50 p-3">
						<input
							readOnly
							value={generatedUrl}
							className="flex-1 truncate rounded bg-transparent text-sm text-neutral-300"
						/>
						<PrimaryActionButton onClick={handleCopy}>
							{copied ? "Copied" : "Copy"}
						</PrimaryActionButton>
					</div>
				)}

				<div className="border-t border-neutral-700 pt-4">
					<h3 className="mb-2 text-sm font-medium text-neutral-300">
						Active links
					</h3>
					{listing ? (
						<div className="text-sm text-neutral-500">Loading…</div>
					) : links.length === 0 ? (
						<div className="text-sm text-neutral-500">No active links</div>
					) : (
						<ul className="space-y-2">
							{links.map((l) => (
								<li
									key={l.token}
									className="flex items-center justify-between rounded border border-neutral-700 bg-neutral-800/50 px-3 py-2 text-sm"
								>
									<span className="text-neutral-300">
										{SHARE_ROLE_OPTIONS.find((o) => o.value === l.role)
											?.label ?? l.role}{" "}
										· {l.useCount} uses
										{l.expiresAt &&
											` · Expires ${new Date(l.expiresAt).toLocaleDateString()}`}
									</span>
									<button
										type="button"
										onClick={() => handleRevoke(l.token)}
										className="text-red-400 hover:underline"
									>
										Revoke
									</button>
								</li>
							))}
						</ul>
					)}
					<button
						type="button"
						onClick={loadLinks}
						className="mt-2 text-sm text-blue-400 hover:underline"
					>
						Refresh
					</button>
				</div>

				<div className="border-t border-neutral-700 pt-4">
					<h3 className="mb-2 text-sm font-medium text-neutral-300">
						Player character claims
					</h3>
					{claimError && (
						<div className="mb-2 rounded bg-red-500/10 px-3 py-2 text-sm text-red-400">
							{claimError}
						</div>
					)}
					{claimsListing ? (
						<div className="text-sm text-neutral-500">Loading…</div>
					) : claims.length === 0 ? (
						<div className="text-sm text-neutral-500">
							No player character claims
						</div>
					) : (
						<ul className="space-y-2">
							{claims.map((claim) => {
								const selectedEntityId =
									claimSelections[claim.username] ?? claim.entityId;
								const options = [
									{ id: claim.entityId, name: claim.entityName },
									...unclaimedOptions.filter(
										(opt) => opt.id !== claim.entityId
									),
								];
								const isSavingThisRow = savingClaimFor === claim.username;
								const isClearingThisRow = clearingClaimFor === claim.username;
								const hasSelectionChanged =
									selectedEntityId &&
									selectedEntityId.length > 0 &&
									selectedEntityId !== claim.entityId;
								return (
									<li
										key={claim.username}
										className="rounded border border-neutral-700 bg-neutral-800/50 px-3 py-3 text-sm"
									>
										<div className="mb-2 text-neutral-300">
											<span className="font-medium">{claim.username}</span>
											{" · "}
											<span>{claim.entityName}</span>
										</div>
										<div className="flex items-center gap-2">
											<select
												value={selectedEntityId}
												onChange={(e) =>
													handleClaimSelectionChange(
														claim.username,
														e.target.value
													)
												}
												className="flex-1 rounded border border-neutral-600 bg-neutral-800 px-3 py-2 text-neutral-100"
											>
												{options.map((opt) => (
													<option key={opt.id} value={opt.id}>
														{opt.name}
													</option>
												))}
											</select>
											<PrimaryActionButton
												onClick={() => handleSaveClaim(claim.username)}
												disabled={
													!hasSelectionChanged ||
													isSavingThisRow ||
													isClearingThisRow
												}
											>
												{isSavingThisRow ? "Saving…" : "Save"}
											</PrimaryActionButton>
											<button
												type="button"
												onClick={() => handleClearClaim(claim.username)}
												disabled={isSavingThisRow || isClearingThisRow}
												className="rounded border border-red-700/50 bg-red-900/20 px-3 py-2 text-sm text-red-200 hover:bg-red-900/30 disabled:cursor-not-allowed disabled:opacity-50"
											>
												{isClearingThisRow ? "Clearing…" : "Clear claim"}
											</button>
										</div>
										{claimSaveErrorByUser[claim.username] && (
											<div className="mt-2 text-xs text-red-400">
												{claimSaveErrorByUser[claim.username]}
											</div>
										)}
									</li>
								);
							})}
						</ul>
					)}
				</div>
			</div>
		</Modal>
	);
}
