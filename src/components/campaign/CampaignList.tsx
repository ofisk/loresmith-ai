import { useCallback, useEffect, useState } from "react";
import { API_CONFIG } from "../../shared";
import type { Campaign } from "../../types/campaign";

interface CampaignListProps {
  onViewCampaign: (campaignId: string) => void;
  onCreateCampaign: () => void;
}

export function CampaignList({
  onViewCampaign,
  onCreateCampaign,
}: CampaignListProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCampaigns = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE)
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch campaigns: ${response.status}`);
      }
      const data = (await response.json()) as { campaigns: Campaign[] };
      setCampaigns(data.campaigns || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch campaigns"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const handleCampaignClick = useCallback(
    (campaignId: string) => {
      onViewCampaign(campaignId);
    },
    [onViewCampaign]
  );

  const handleCampaignKeyDown = useCallback(
    (event: React.KeyboardEvent, campaignId: string) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onViewCampaign(campaignId);
      }
    },
    [onViewCampaign]
  );

  if (loading) {
    return <div>Loading campaigns...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Campaigns</h2>
        <button
          type="button"
          onClick={onCreateCampaign}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Create Campaign
        </button>
      </div>
      {campaigns.length === 0 ? (
        <p>No campaigns found. Create your first campaign!</p>
      ) : (
        <div className="space-y-2">
          {campaigns.map((campaign) => (
            <button
              key={campaign.campaignId}
              type="button"
              className="w-full text-left p-4 border rounded cursor-pointer hover:bg-gray-50"
              onClick={() => handleCampaignClick(campaign.campaignId)}
              onKeyDown={(e) => handleCampaignKeyDown(e, campaign.campaignId)}
              aria-label={`View campaign: ${campaign.name}`}
            >
              <h3 className="font-semibold">{campaign.name}</h3>
              <p className="text-sm text-gray-600">
                Created: {new Date(campaign.createdAt).toLocaleDateString()}
              </p>
              <p className="text-sm text-gray-600">
                Resources: {campaign.resources.length}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
