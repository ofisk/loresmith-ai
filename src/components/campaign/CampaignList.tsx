import { useCallback, useEffect } from "react";
import { USER_MESSAGES } from "../../constants";
import { authenticatedFetchWithExpiration } from "../../lib/auth";
import { API_CONFIG } from "../../shared";
import { useAsyncOperation } from "../../hooks/useAsyncOperation";
import { AsyncList } from "../ui/AsyncList";
import type { Campaign, CampaignListProps } from "../../types/campaign";

export function CampaignList({
  onViewCampaign,
  onCreateCampaign,
}: CampaignListProps) {
  const fetchCampaigns = useCallback(async () => {
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
    return data.campaigns || [];
  }, []);

  const {
    execute,
    loading,
    error,
    data: campaigns,
  } = useAsyncOperation(fetchCampaigns, {
    errorMessage: USER_MESSAGES.HOOK_FAILED_TO_FETCH_CAMPAIGNS,
  });

  useEffect(() => {
    execute();
  }, [execute]);

  const handleCampaignClick = useCallback(
    (campaignId: string) => {
      onViewCampaign(campaignId);
    },
    [onViewCampaign]
  );

  const renderCampaign = useCallback(
    (campaign: Campaign) => (
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
    ),
    [handleCampaignClick]
  );

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

      <AsyncList
        data={campaigns}
        loading={loading}
        error={error}
        renderItem={renderCampaign}
        onRetry={execute}
        emptyComponent={
          <div className="text-center py-8 text-gray-500">
            No campaigns found. Create your first campaign to get started.
          </div>
        }
      />
    </div>
  );
}
