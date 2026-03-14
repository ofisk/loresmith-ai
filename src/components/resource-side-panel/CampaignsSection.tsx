import { Plus } from "@phosphor-icons/react";
import campaignIcon from "@/assets/campaign.png";
import { CollapsibleCard } from "@/components/collapsible/CollapsibleCard";
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
	return (
		<CollapsibleCard
			header={
				<>
					<img
						src={campaignIcon}
						alt="Campaign"
						className="w-8 h-8"
						width={32}
						height={32}
					/>
					<span className="font-medium text-sm">Your campaigns</span>
				</>
			}
			isOpen={isOpen}
			onToggle={onToggle}
			tourClassName="tour-campaigns-section"
		>
			<div className="p-2">
				<button
					type="button"
					onClick={onCreateCampaign}
					className="w-full px-2 py-1.5 bg-neutral-200 dark:bg-neutral-700 text-blue-600 dark:text-blue-400 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors flex items-center justify-center gap-2 text-sm"
				>
					<Plus size={14} />
					Create campaign
				</button>
			</div>
			{campaignsLoading ? (
				<div className="border-t border-neutral-200 dark:border-neutral-700 p-4 space-y-2">
					{["a", "b", "c", "d"].map((id) => (
						<div
							key={id}
							className="h-8 rounded bg-neutral-200 dark:bg-neutral-700 animate-pulse"
							aria-hidden
						/>
					))}
				</div>
			) : campaignsError ? (
				<div className="border-t border-neutral-200 dark:border-neutral-700 p-4 text-center">
					<div className="text-red-500 mb-2">Error loading campaigns</div>
					<p className="text-sm text-muted-foreground">{campaignsError}</p>
				</div>
			) : campaigns.length === 0 ? (
				<div className="border-t border-neutral-200 dark:border-neutral-700 p-4 text-center">
					<div className="text-muted-foreground mb-2">The table awaits</div>
					<p className="text-sm text-muted-foreground">
						Forge your first campaign to begin the adventure
					</p>
				</div>
			) : (
				<div className="border-t border-neutral-200 dark:border-neutral-700 max-h-48 overflow-y-auto">
					{campaigns.map((campaign) => (
						<CampaignItem
							key={campaign.campaignId}
							campaign={campaign}
							onCampaignClick={onCampaignClick}
						/>
					))}
				</div>
			)}
		</CollapsibleCard>
	);
}
