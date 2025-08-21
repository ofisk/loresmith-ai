import { useEffect, useState } from "react";
import { USER_MESSAGES } from "../constants";
import { API_CONFIG } from "../shared";
import type { Campaign, CampaignResource } from "../types/campaign";
import { useAuthenticatedRequest } from "./useAuthenticatedRequest";
import { useBaseAsync } from "./useBaseAsync";

/**
 * Comprehensive hook for managing all campaign operations.
 *
 * This hook consolidates the functionality of:
 * - useCampaigns (list campaigns)
 * - useCampaignDetail (single campaign)
 * - useCampaignActions (CRUD operations)
 *
 * @example
 * ```typescript
 * const {
 *   campaigns,
 *   currentCampaign,
 *   loading,
 *   error,
 *   createCampaign,
 *   fetchCampaign,
 *   addResource,
 *   removeResource,
 *   refetch
 * } = useCampaigns();
 *
 * // List campaigns
 * useEffect(() => {
 *   refetch();
 * }, []);
 *
 * // Create a campaign
 * await createCampaign("My Campaign");
 *
 * // Fetch specific campaign
 * await fetchCampaign("campaign-id");
 * ```
 */
export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [currentCampaign, setCurrentCampaign] = useState<Campaign | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { makeRequestWithData } = useAuthenticatedRequest();

  // Fetch all campaigns
  const fetchCampaigns = useBaseAsync(
    async () => {
      const data = await makeRequestWithData<{ campaigns: Campaign[] }>(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE)
      );
      return data.campaigns || [];
    },
    {
      onSuccess: (campaigns) => setCampaigns(campaigns),
      onError: (error) => setError(error),
      errorMessage: USER_MESSAGES.HOOK_FAILED_TO_FETCH_CAMPAIGNS,
    }
  );

  // Fetch single campaign
  const fetchCampaign = useBaseAsync(
    async (campaignId: string) => {
      const data = await makeRequestWithData<{ campaign: Campaign }>(
        API_CONFIG.buildUrl(`${API_CONFIG.ENDPOINTS.CAMPAIGNS}/${campaignId}`)
      );
      return data.campaign;
    },
    {
      onSuccess: (campaign) => setCurrentCampaign(campaign),
      onError: (error) => setError(error),
      errorMessage: USER_MESSAGES.HOOK_FAILED_TO_FETCH_CAMPAIGN,
    }
  );

  // Create campaign
  const createCampaign = useBaseAsync(
    async (name: string) => {
      const data = await makeRequestWithData<{ campaign: Campaign }>(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE),
        {
          method: "POST",
          body: JSON.stringify({ name }),
        }
      );
      return data.campaign;
    },
    {
      onSuccess: (campaign) => {
        setCampaigns((prev) => [campaign, ...prev]);
        setCurrentCampaign(campaign);
      },
      onError: (error) => setError(error),
      errorMessage: USER_MESSAGES.HOOK_FAILED_TO_CREATE_CAMPAIGN,
    }
  );

  // Add resource to campaign
  const addResource = useBaseAsync(
    async (
      campaignId: string,
      resource: Omit<CampaignResource, "resourceId" | "createdAt" | "updatedAt">
    ) => {
      const data = await makeRequestWithData<{ resource: CampaignResource }>(
        API_CONFIG.buildUrl(
          `${API_CONFIG.ENDPOINTS.CAMPAIGNS}/${campaignId}/resources`
        ),
        {
          method: "POST",
          body: JSON.stringify(resource),
        }
      );
      return data.resource;
    },
    {
      onError: (error) => setError(error),
      errorMessage: USER_MESSAGES.HOOK_FAILED_TO_ADD_RESOURCE,
    }
  );

  // Remove resource from campaign
  const removeResource = useBaseAsync(
    async (campaignId: string, resourceId: string) => {
      await makeRequestWithData(
        API_CONFIG.buildUrl(
          `${API_CONFIG.ENDPOINTS.CAMPAIGNS}/${campaignId}/resources/${resourceId}`
        ),
        {
          method: "DELETE",
        }
      );
      return true;
    },
    {
      onError: (error) => setError(error),
      errorMessage: USER_MESSAGES.HOOK_FAILED_TO_REMOVE_RESOURCE,
    }
  );

  // Auto-fetch campaigns on mount
  useEffect(() => {
    fetchCampaigns.execute();
  }, [fetchCampaigns.execute]);

  return {
    // State
    campaigns,
    currentCampaign,
    loading: fetchCampaigns.loading || createCampaign.loading,
    error: error || fetchCampaigns.error || createCampaign.error,

    // Actions
    fetchCampaigns: fetchCampaigns.execute,
    fetchCampaign: fetchCampaign.execute,
    createCampaign: createCampaign.execute,
    addResource: addResource.execute,
    removeResource: removeResource.execute,

    // Utilities
    refetch: fetchCampaigns.execute,
    reset: () => {
      setCampaigns([]);
      setCurrentCampaign(null);
      setError(null);
    },
  };
}
