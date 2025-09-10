import {
  CaretDown,
  CaretRight,
  FileText,
  Plus,
  DotsThreeVertical,
} from "@phosphor-icons/react";
import { Card } from "../card/Card";
import type { Campaign } from "../../types/campaign";

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
    <Card className="p-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-3 flex items-center justify-between text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-purple-600" />
          <span className="font-medium">Your campaigns</span>
        </div>
        {isOpen ? <CaretDown size={16} /> : <CaretRight size={16} />}
      </button>

      {isOpen && (
        <div className="border-t border-neutral-200 dark:border-neutral-700 h-96 overflow-y-auto">
          <div className="p-3">
            <button
              type="button"
              onClick={onCreateCampaign}
              className="w-full px-3 py-1.5 bg-neutral-200 dark:bg-neutral-700 text-purple-600 dark:text-purple-400 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <Plus size={14} />
              Create campaign
            </button>
          </div>
          {campaignsLoading ? (
            <div className="border-t border-neutral-200 dark:border-neutral-700 p-4 text-center">
              <div className="text-gray-500 mb-2">Loading campaigns...</div>
            </div>
          ) : campaignsError ? (
            <div className="border-t border-neutral-200 dark:border-neutral-700 p-4 text-center">
              <div className="text-red-500 mb-2">Error loading campaigns</div>
              <p className="text-sm text-gray-400">{campaignsError}</p>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="border-t border-neutral-200 dark:border-neutral-700 p-4 text-center">
              <div className="text-gray-500 mb-2">The war room awaits</div>
              <p className="text-sm text-gray-400">
                Forge your first campaign to begin the adventure
              </p>
            </div>
          ) : (
            <div className="border-t border-neutral-200 dark:border-neutral-700">
              {campaigns.map((campaign) => (
                <div
                  key={campaign.campaignId}
                  className="p-3 border-b border-neutral-200 dark:border-neutral-700 last:border-b-0 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer group"
                  onClick={() => onCampaignClick?.(campaign)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {campaign.name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Created {new Date(campaign.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <button
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
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
