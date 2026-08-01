import { Plus } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import campaignIcon from "@/assets/campaign.png";
import { Card } from "@/components/card/Card";
import { Modal } from "@/components/modal/Modal";
import type { Campaign } from "@/types/campaign";
import { CampaignItem } from "./CampaignItem";

interface CampaignsSectionProps {
	campaigns: Campaign[];
	campaignsLoading: boolean;
	campaignsError: string | null;
	onToggle: () => void;
	isOpen: boolean;
	onCreateCampaign: () => void;
	onCampaignClick?: (campaign: Campaign) => void;
}

export function CampaignsSection({
	campaigns,
	campaignsLoading,
	campaignsError,
	onToggle,
	isOpen,
	onCreateCampaign,
	onCampaignClick,
}: CampaignsSectionProps) {
	// See NotificationBell: portal to <body> to escape ResourceSidePanel's
	// backdrop-blur-sm containing block for `position: fixed`.
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	return (
		<>
			<Card className="tour-campaigns-section p-0 flex flex-col">
				<button
					type="button"
					onClick={onToggle}
					className="w-full p-2 flex items-center gap-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
				>
					<img
						src={campaignIcon}
						alt="Campaign"
						className="w-8 h-8"
						width={32}
						height={32}
					/>
					<span className="flex flex-col min-w-0">
						<span className="font-medium text-sm">Campaigns</span>
						{!campaignsLoading && campaigns.length > 0 && (
							<span className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
								{campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}
							</span>
						)}
					</span>
				</button>
			</Card>

			{mounted &&
				createPortal(
					<Modal
						isOpen={isOpen}
						onClose={onToggle}
						className="modal-size-md"
						options={{ clickOutsideToClose: true }}
					>
						<div className="h-full flex flex-col">
							<div className="flex-shrink-0 p-4 pr-12 border-b border-neutral-200 dark:border-neutral-700">
								<h3 className="font-medium text-lg text-neutral-900 dark:text-neutral-100 mb-2">
									Campaigns
								</h3>
								<button
									type="button"
									onClick={onCreateCampaign}
									className="w-full px-2 py-1.5 bg-neutral-200 dark:bg-neutral-700 text-purple-600 dark:text-purple-400 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors flex items-center justify-center gap-2 text-sm"
								>
									<Plus size={14} />
									Create campaign
								</button>
							</div>

							<div className="flex-1 overflow-y-auto">
								{campaignsLoading ? (
									<div className="p-4 space-y-2">
										{["a", "b", "c", "d"].map((id) => (
											<div
												key={id}
												className="h-8 rounded bg-neutral-200 dark:bg-neutral-700 animate-pulse"
												aria-hidden
											/>
										))}
									</div>
								) : campaignsError ? (
									<div className="p-4 text-center">
										<div className="text-red-500 mb-2">
											Error loading campaigns
										</div>
										<p className="text-sm text-muted-foreground">
											{campaignsError}
										</p>
									</div>
								) : campaigns.length === 0 ? (
									<div className="p-4 text-center">
										<div className="text-muted-foreground mb-2">
											The table awaits
										</div>
										<p className="text-sm text-muted-foreground">
											Forge your first campaign to begin the adventure
										</p>
									</div>
								) : (
									campaigns.map((campaign) => (
										<CampaignItem
											key={campaign.campaignId}
											campaign={campaign}
											onCampaignClick={onCampaignClick}
										/>
									))
								)}
							</div>
						</div>
					</Modal>,
					document.body
				)}
		</>
	);
}
