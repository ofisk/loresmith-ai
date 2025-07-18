import { useCallback, useEffect, useState } from "react";
import { USER_MESSAGES } from "../../constants";
import { authenticatedFetchWithExpiration } from "../../lib/auth";
import { API_CONFIG } from "../../shared";
import type { Campaign, CampaignListProps } from "../../types/campaign";

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

      const { response, jwtExpired } = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE)
      );

      if (jwtExpired) {
        throw new Error("Authentication required. Please log in.");
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch campaigns: ${response.status}`);
      }

      const data = (await response.json()) as { campaigns: Campaign[] };
      setCampaigns(data.campaigns || []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : USER_MESSAGES.HOOK_FAILED_TO_FETCH_CAMPAIGNS
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

  if (loading) {
    return <div>Loading campaigns...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Campaigns</h2>
        <button
          type="button"
          onClick={onCreateCampaign}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Create Campaign
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No campaigns found. Create your first campaign to get started.
        </div>
      ) : (
        <div className="grid gap-4">
          {campaigns.map((campaign) => (
            <button
              type="button"
              key={campaign.campaignId}
              onClick={() => handleCampaignClick(campaign.campaignId)}
              className="w-full text-left p-4 border rounded-lg cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label={`View campaign: ${campaign.name}`}
            >
              <h3 className="font-medium">{campaign.name}</h3>
              <p className="text-sm text-gray-500">
                Created: {new Date(campaign.createdAt).toLocaleDateString()}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
