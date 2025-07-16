import { useState } from "react";
import { authenticatedFetchWithExpiration } from "../lib/auth";
import { API_CONFIG } from "../shared";
import { USER_MESSAGES } from "../constants";
import type { Campaign, CampaignResource } from "../types/campaign";

export function useCampaignActions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createCampaign = async (name: string): Promise<Campaign | null> => {
    try {
      setLoading(true);
      setError(null);

      const { response, jwtExpired } = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE),
        {
          method: "POST",
          body: JSON.stringify({ name }),
        }
      );

      if (jwtExpired) {
        throw new Error("Authentication required. Please log in.");
      }

      if (!response.ok) {
        throw new Error(`Failed to create campaign: ${response.status}`);
      }

      const data = (await response.json()) as { campaign: Campaign };
      return data.campaign;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : USER_MESSAGES.HOOK_FAILED_TO_CREATE_CAMPAIGN
      );
      return null;
    } finally {
      setLoading(false);
    }
  };

  const addResource = async (
    campaignId: string,
    resource: Omit<CampaignResource, "resourceId" | "createdAt" | "updatedAt">
  ): Promise<CampaignResource | null> => {
    try {
      setLoading(true);
      setError(null);

      const { response, jwtExpired } = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(
          `${API_CONFIG.ENDPOINTS.CAMPAIGNS}/${campaignId}/resources`
        ),
        {
          method: "POST",
          body: JSON.stringify(resource),
        }
      );

      if (jwtExpired) {
        throw new Error("Authentication required. Please log in.");
      }

      if (!response.ok) {
        throw new Error(`Failed to add resource: ${response.status}`);
      }

      const data = (await response.json()) as { resource: CampaignResource };
      return data.resource;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : USER_MESSAGES.HOOK_FAILED_TO_ADD_RESOURCE
      );
      return null;
    } finally {
      setLoading(false);
    }
  };

  const removeResource = async (
    campaignId: string,
    resourceId: string
  ): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      const { response, jwtExpired } = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(
          `${API_CONFIG.ENDPOINTS.CAMPAIGNS}/${campaignId}/resources/${resourceId}`
        ),
        {
          method: "DELETE",
        }
      );

      if (jwtExpired) {
        throw new Error("Authentication required. Please log in.");
      }

      if (!response.ok) {
        throw new Error(`Failed to remove resource: ${response.status}`);
      }

      return true;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : USER_MESSAGES.HOOK_FAILED_TO_REMOVE_RESOURCE
      );
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    createCampaign,
    addResource,
    removeResource,
    loading,
    error,
  };
}
