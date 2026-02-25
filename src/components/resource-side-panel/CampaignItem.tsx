import { DotsThreeVertical } from "@phosphor-icons/react";
import { RebuildStatusIndicator } from "@/components/graph/RebuildStatusIndicator";
import {
	CAMPAIGN_ROLE_LABELS,
	CAMPAIGN_ROLES,
} from "@/constants/campaign-roles";
import { useRebuildStatus } from "@/hooks/useRebuildStatus";
import type { Campaign } from "@/types/campaign";

interface CampaignItemProps {
	campaign: Campaign;
	onCampaignClick?: (campaign: Campaign) => void;
}

export function CampaignItem({ campaign, onCampaignClick }: CampaignItemProps) {
	const { activeRebuild } = useRebuildStatus({
		campaignId: campaign.campaignId,
		enabled: true, // Only poll when component is mounted
	});

	return (
		<button
			type="button"
			className="w-full p-3 border-b border-neutral-200 dark:border-neutral-700 last:border-b-0 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer group text-left"
			onClick={() => onCampaignClick?.(campaign)}
		>
			<div className="flex items-center justify-between">
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 flex-wrap">
						<div className="font-medium text-gray-900 dark:text-gray-100 truncate">
							{campaign.name}
						</div>
						{campaign.role && (
							<span
								className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
									campaign.role === CAMPAIGN_ROLES.OWNER
										? "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300"
										: "bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400"
								}`}
							>
								{CAMPAIGN_ROLE_LABELS[campaign.role] ?? campaign.role}
							</span>
						)}
						{activeRebuild && (
							<RebuildStatusIndicator
								rebuildStatus={activeRebuild}
								className="flex-shrink-0"
							/>
						)}
					</div>
					<div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
						Created {new Date(campaign.createdAt).toLocaleString()}
					</div>
				</div>
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onCampaignClick?.(campaign);
					}}
					className="opacity-0 group-hover:opacity-100 p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-all"
					title="Manage campaign"
				>
					<DotsThreeVertical size={16} className="text-gray-500" />
				</button>
			</div>
		</button>
	);
}
