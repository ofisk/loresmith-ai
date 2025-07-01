import { useCallback, useEffect, useState } from "react";
import { API_CONFIG } from "../shared";
import type { Campaign } from "../types/campaign";

export function useCampaigns() {
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

  return {
    campaigns,
    loading,
    error,
    refetch: fetchCampaigns,
  };
}
