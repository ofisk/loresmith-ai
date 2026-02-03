import { CaretDown, CaretRight, Plus } from "@phosphor-icons/react";
import type { Campaign } from "@/types/campaign";
import { Card } from "@/components/card/Card";
import campaignIcon from "@/assets/campaign.png";
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
    <Card className="tour-campaigns-section p-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-2 flex items-center justify-between text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <img src={campaignIcon} alt="Campaign" className="w-8 h-8" />
          <span className="font-medium text-sm">Your campaigns</span>
        </div>
        {isOpen ? <CaretDown size={16} /> : <CaretRight size={16} />}
      </button>

      {isOpen && (
        <div className="border-t border-neutral-200 dark:border-neutral-700">
          <div className="p-2">
            <button
              type="button"
              onClick={onCreateCampaign}
              className="w-full px-2 py-1.5 bg-neutral-200 dark:bg-neutral-700 text-purple-600 dark:text-purple-400 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors flex items-center justify-center gap-2 text-sm"
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
                <CampaignItem
                  key={campaign.campaignId}
                  campaign={campaign}
                  onCampaignClick={onCampaignClick}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
