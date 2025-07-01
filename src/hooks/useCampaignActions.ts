import { useState } from "react";
import { API_CONFIG } from "../shared";
import type { Campaign, CampaignResource } from "../types/campaign";

export function useCampaignActions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createCampaign = async (name: string): Promise<Campaign | null> => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to create campaign: ${response.status}`);
      }

      const data = (await response.json()) as { campaign: Campaign };
      return data.campaign;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create campaign"
      );
      return null;
    } finally {
      setLoading(false);
    }
  };

  const addResourceToCampaign = async (
    campaignId: string,
    resource: Omit<CampaignResource, "id"> & { id: string }
  ): Promise<CampaignResource[] | null> => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(
        API_CONFIG.buildUrl(
          `${API_CONFIG.ENDPOINTS.CAMPAIGNS}/${campaignId}/resource`
        ),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(resource),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to add resource: ${response.status}`);
      }

      const data = (await response.json()) as { resources: CampaignResource[] };
      return data.resources;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add resource");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const removeResourceFromCampaign = async (
    campaignId: string,
    resourceId: string
  ): Promise<CampaignResource[] | null> => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(
        API_CONFIG.buildUrl(
          `${API_CONFIG.ENDPOINTS.CAMPAIGNS}/${campaignId}/resource/${resourceId}`
        ),
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to remove resource: ${response.status}`);
      }

      const data = (await response.json()) as { resources: CampaignResource[] };
      return data.resources;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to remove resource"
      );
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    createCampaign,
    addResourceToCampaign,
    removeResourceFromCampaign,
    loading,
    error,
  };
}
