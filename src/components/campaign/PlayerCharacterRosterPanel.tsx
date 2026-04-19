import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/button/Button";
import { useAuthenticatedRequest } from "@/hooks/useAuthenticatedRequest";
import { API_CONFIG } from "@/shared-config";

export interface RosterClaim {
	username: string | null;
	assignedBy: string | null;
	claimStatus: "approved" | "pending";
	updatedAt: string;
}

export interface RosterCharacter {
	entityId: string;
	name: string;
	displayName: string;
	subtitle?: string;
	unclaimed: boolean;
	claim: RosterClaim | null;
}

export function PlayerCharacterRosterPanel({
	campaignId,
	canManageClaims,
}: {
	campaignId: string;
	canManageClaims: boolean;
}) {
	const { makeRequest } = useAuthenticatedRequest();
	const [roster, setRoster] = useState<{
		gameSystem: string;
		characters: RosterCharacter[];
		pcClaimRequiresGmApproval: boolean;
	} | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [approvingFor, setApprovingFor] = useState<string | null>(null);

	const fetchRoster = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await makeRequest(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.CAMPAIGNS.PLAYER_CHARACTER_ROSTER(campaignId)
				)
			);
			const data = (await res.json()) as {
				error?: string;
				gameSystem?: string;
				characters?: RosterCharacter[];
				pcClaimRequiresGmApproval?: boolean;
			};
			if (!res.ok) {
				setRoster(null);
				setError(data.error ?? "Failed to load party roster");
				return;
			}
			setRoster({
				gameSystem: data.gameSystem ?? "generic",
				characters: data.characters ?? [],
				pcClaimRequiresGmApproval: !!data.pcClaimRequiresGmApproval,
			});
		} catch {
			setRoster(null);
			setError("Failed to load party roster");
		} finally {
			setLoading(false);
		}
	}, [campaignId, makeRequest]);

	useEffect(() => {
		void fetchRoster();
	}, [fetchRoster]);

	const handleApprove = async (username: string) => {
		setApprovingFor(username);
		try {
			const res = await makeRequest(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.CAMPAIGNS.PLAYER_CHARACTER_CLAIM_APPROVE(
						campaignId,
						username
					)
				),
				{ method: "POST" }
			);
			if (res.ok) {
				await fetchRoster();
			}
		} finally {
			setApprovingFor(null);
		}
	};

	if (loading) {
		return (
			<div className="text-sm text-neutral-500 dark:text-neutral-400">
				Loading party roster…
			</div>
		);
	}

	if (error) {
		return (
			<div className="rounded bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
				{error}
			</div>
		);
	}

	if (!roster || roster.characters.length === 0) {
		return (
			<div className="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
				<p>
					No player characters in this campaign yet. Add or generate{" "}
					<code className="rounded bg-neutral-200 px-1 dark:bg-neutral-800">
						pcs
					</code>{" "}
					entities so players can claim them.
				</p>
				<p className="text-neutral-500 dark:text-neutral-500">
					Game system:{" "}
					<span className="font-medium text-neutral-700 dark:text-neutral-300">
						{roster?.gameSystem ?? "generic"}
					</span>
					{roster?.pcClaimRequiresGmApproval ? (
						<>
							{" "}
							· Self-claims require GM approval before they appear to the full
							party.
						</>
					) : null}
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
				<span>
					Game system:{" "}
					<span className="font-medium text-neutral-700 dark:text-neutral-300">
						{roster.gameSystem}
					</span>
				</span>
				{roster.pcClaimRequiresGmApproval ? (
					<span className="rounded-full border border-amber-600/40 bg-amber-500/10 px-2 py-0.5 text-amber-800 dark:text-amber-200">
						Self-claims need GM approval
					</span>
				) : null}
			</div>

			<ul className="space-y-2">
				{roster.characters.map((row) => (
					<li
						key={row.entityId}
						className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800/50"
					>
						<div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<div className="font-medium text-neutral-900 dark:text-neutral-100">
									{row.displayName}
								</div>
								{row.subtitle ? (
									<div className="text-xs text-neutral-600 dark:text-neutral-400">
										{row.subtitle}
									</div>
								) : null}
							</div>
							<div className="flex flex-wrap items-center gap-2">
								{row.unclaimed ? (
									<span className="text-xs text-neutral-500 dark:text-neutral-400">
										Open
									</span>
								) : row.claim?.claimStatus === "pending" ? (
									<span className="text-xs text-amber-700 dark:text-amber-300">
										Pending approval
										{row.claim.username ? ` · ${row.claim.username}` : ""}
									</span>
								) : (
									<span className="text-xs text-neutral-600 dark:text-neutral-300">
										{row.claim?.username ? `@${row.claim.username}` : "Claimed"}
									</span>
								)}
								{canManageClaims &&
								row.claim?.claimStatus === "pending" &&
								row.claim.username ? (
									<Button
										type="button"
										variant="primary"
										size="sm"
										className="h-8 px-3 text-xs"
										disabled={approvingFor === row.claim.username}
										onClick={() => void handleApprove(row.claim!.username!)}
									>
										{approvingFor === row.claim.username
											? "Approving…"
											: "Approve claim"}
									</Button>
								) : null}
							</div>
						</div>
					</li>
				))}
			</ul>
		</div>
	);
}
