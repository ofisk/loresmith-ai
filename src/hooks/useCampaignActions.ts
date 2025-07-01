import { useState } from "react";
import type {
  CampaignResource,
  AddResourceRequest,
  Campaign,
} from "../types/campaign";

export function useCampaignActions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createCampaign = async (
    name: string,
    onSuccess?: (campaign: Campaign) => void,
    onError?: (err: string) => void
  ) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error("Failed to create campaign");
      const data = (await response.json()) as { campaign: Campaign };
      onSuccess?.(data.campaign);
      return true;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to create campaign";
      setError(msg);
      onError?.(msg);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const addResource = async (
    campaignId: string,
    resource: AddResourceRequest,
    onSuccess?: (resources: CampaignResource[]) => void,
    onError?: (err: string) => void
  ) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/resource`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resource),
      });
      if (!response.ok) throw new Error("Failed to add resource");
      const data = (await response.json()) as { resources: CampaignResource[] };
      onSuccess?.(data.resources);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add resource";
      setError(msg);
      onError?.(msg);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const removeResource = async (
    campaignId: string,
    resourceId: string,
    onSuccess?: (resources: CampaignResource[]) => void,
    onError?: (err: string) => void
  ) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/campaigns/${campaignId}/resource/${resourceId}`,
        {
          method: "DELETE",
        }
      );
      if (!response.ok) throw new Error("Failed to remove resource");
      const data = (await response.json()) as { resources: CampaignResource[] };
      onSuccess?.(data.resources);
      return true;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to remove resource";
      setError(msg);
      onError?.(msg);
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    createCampaign,
    addResource,
    removeResource,
  };
}
