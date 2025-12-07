import { DotsThreeVertical } from "@phosphor-icons/react";
import type { Campaign } from "@/types/campaign";
import { useRebuildStatus } from "@/hooks/useRebuildStatus";
import { RebuildStatusIndicator } from "@/components/graph/RebuildStatusIndicator";

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
          <div className="flex items-center gap-2">
            <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
              {campaign.name}
            </div>
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
