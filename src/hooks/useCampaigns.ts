import { useEffect, useState, useMemo, useRef } from "react";
import { USER_MESSAGES } from "@/app-constants";
import { API_CONFIG } from "@/shared-config";
import type { Campaign, CampaignResource } from "@/types/campaign";
import { useAuthenticatedRequest } from "@/hooks/useAuthenticatedRequest";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useBaseAsync } from "@/hooks/useBaseAsync";

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
const ACTIVE_CAMPAIGN_STORAGE_KEY = "loresmith-active-campaign-id";

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [currentCampaign, setCurrentCampaign] = useState<Campaign | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(
    null
  );
  const hasInitializedFromStorageRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const { makeRequestWithData } = useAuthenticatedRequest();
  const authReady = useAuthReady();

  // Fetch all campaigns
  const fetchCampaigns = useBaseAsync(
    useMemo(
      () => async () => {
        const data = await makeRequestWithData<{ campaigns: Campaign[] }>(
          API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE)
        );
        return data.campaigns || [];
      },
      [makeRequestWithData]
    ),
    useMemo(
      () => ({
        onSuccess: (campaigns: Campaign[]) => {
          setCampaigns(campaigns);

          // Only initialize from localStorage on first load
          // On subsequent refetches, preserve the current selectedCampaignId
          if (!hasInitializedFromStorageRef.current) {
            const storedId = window.localStorage.getItem(
              ACTIVE_CAMPAIGN_STORAGE_KEY
            );
            if (storedId) {
              const matchingCampaign = campaigns.find(
                (campaign) => campaign.campaignId === storedId
              );
              if (matchingCampaign) {
                setSelectedCampaignId(matchingCampaign.campaignId);
              } else {
                setSelectedCampaignId(null);
                window.localStorage.removeItem(ACTIVE_CAMPAIGN_STORAGE_KEY);
              }
            }
            hasInitializedFromStorageRef.current = true;
          } else {
            // On subsequent refetches, validate that the current selection still exists
            // Use a functional update to get the latest selectedCampaignId
            setSelectedCampaignId((currentId) => {
              if (currentId) {
                const matchingCampaign = campaigns.find(
                  (campaign) => campaign.campaignId === currentId
                );
                if (!matchingCampaign) {
                  // Current selection no longer exists, clear it
                  window.localStorage.removeItem(ACTIVE_CAMPAIGN_STORAGE_KEY);
                  return null;
                }
              }
              return currentId;
            });
          }
        },
        onError: (error: string) => setError(error),
        errorMessage: USER_MESSAGES.HOOK_FAILED_TO_FETCH_CAMPAIGNS,
      }),
      []
    )
  );

  // Fetch single campaign
  const fetchCampaign = useBaseAsync(
    useMemo(
      () => async (campaignId: string) => {
        const data = await makeRequestWithData<{ campaign: Campaign }>(
          API_CONFIG.buildUrl(`${API_CONFIG.ENDPOINTS.CAMPAIGNS}/${campaignId}`)
        );
        return data.campaign;
      },
      [makeRequestWithData]
    ),
    useMemo(
      () => ({
        onSuccess: (campaign: Campaign) => setCurrentCampaign(campaign),
        onError: (error: string) => setError(error),
        errorMessage: USER_MESSAGES.HOOK_FAILED_TO_FETCH_CAMPAIGN,
      }),
      []
    )
  );

  // Create campaign
  const createCampaign = useBaseAsync(
    useMemo(
      () => async (name: string, description?: string) => {
        const data = await makeRequestWithData<{ campaign: Campaign }>(
          API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE),
          {
            method: "POST",
            body: JSON.stringify({
              name,
              description: description || "",
            }),
          }
        );
        return data.campaign;
      },
      [makeRequestWithData]
    ),
    useMemo(
      () => ({
        onSuccess: (campaign: Campaign) => {
          setCampaigns((prev) => [...prev, campaign]);
          setCurrentCampaign(campaign);
          setSelectedCampaignId(campaign.campaignId);
          window.localStorage.setItem(
            ACTIVE_CAMPAIGN_STORAGE_KEY,
            campaign.campaignId
          );
        },
        onError: (error: string) => setError(error),
        errorMessage: USER_MESSAGES.HOOK_FAILED_TO_CREATE_CAMPAIGN,
      }),
      []
    )
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

  // Auto-fetch campaigns when authentication becomes ready
  useEffect(() => {
    if (authReady) {
      fetchCampaigns.execute();
    }
  }, [authReady, fetchCampaigns.execute]);

  return {
    // State
    campaigns,
    currentCampaign,
    selectedCampaignId,
    selectedCampaign:
      campaigns.find((c) => c.campaignId === selectedCampaignId) ?? null,
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
    setSelectedCampaignId: (campaignId: string | null) => {
      setSelectedCampaignId(campaignId);
      if (campaignId) {
        window.localStorage.setItem(ACTIVE_CAMPAIGN_STORAGE_KEY, campaignId);
      } else {
        window.localStorage.removeItem(ACTIVE_CAMPAIGN_STORAGE_KEY);
      }
    },
    reset: () => {
      setCampaigns([]);
      setCurrentCampaign(null);
      setSelectedCampaignId(null);
      setError(null);
    },
  };
}
