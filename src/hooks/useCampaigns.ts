import { useEffect, useState } from "react";

export interface Campaign {
  campaignId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  // Add other fields as needed
}

interface UseCampaignsResult {
  campaigns: Campaign[];
  loading: boolean;
  error: string | null;
}

export function useCampaigns(): UseCampaignsResult {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/campaigns")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch campaigns");
        return res.json();
      })
      .then((data) => {
        const { campaigns } = data as { campaigns?: Campaign[] };
        setCampaigns(campaigns || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Unknown error");
        setLoading(false);
      });
  }, []);

  return { campaigns, loading, error };
}
