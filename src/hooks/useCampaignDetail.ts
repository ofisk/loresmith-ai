import { useCallback, useEffect, useState } from "react";
import { USER_MESSAGES } from "../constants";
import { authenticatedFetchWithExpiration } from "../lib/auth";
import { API_CONFIG } from "../shared";
import type { Campaign } from "../types/campaign";

export function useCampaignDetail(campaignId: string | null) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCampaign = useCallback(async () => {
    if (!campaignId) return;

    try {
      setLoading(true);
      setError(null);

      const { response, jwtExpired } = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(`${API_CONFIG.ENDPOINTS.CAMPAIGNS}/${campaignId}`)
      );

      if (jwtExpired) {
        throw new Error("Authentication required. Please log in.");
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch campaign: ${response.status}`);
      }

      const data = (await response.json()) as { campaign: Campaign };
      setCampaign(data.campaign);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : USER_MESSAGES.HOOK_FAILED_TO_FETCH_CAMPAIGN
      );
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    if (campaignId) {
      fetchCampaign();
    }
  }, [campaignId, fetchCampaign]);

  return {
    campaign,
    loading,
    error,
    refetch: fetchCampaign,
  };
}
