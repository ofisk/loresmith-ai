import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { Button } from "../button/Button";
import { Card } from "../card/Card";

interface CampaignData {
  campaignId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  resources: Array<{
    type: string;
    id: string;
    name?: string;
  }>;
}

interface CampaignDetailsProps {
  campaignId: string;
  className?: string;
}

export function CampaignDetails({
  campaignId,
  className,
}: CampaignDetailsProps) {
  const [campaign, setCampaign] = useState<CampaignData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isIndexing, setIsIndexing] = useState(false);

  const fetchCampaignDetails = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/campaigns/${campaignId}`);

      if (!response.ok) {
        throw new Error("Failed to fetch campaign details");
      }

      const data = (await response.json()) as { campaign: CampaignData };
      setCampaign(data.campaign);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to fetch campaign details";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [campaignId]);

  const handleIndexCampaign = async () => {
    try {
      setIsIndexing(true);
      const response = await fetch(`/api/campaigns/${campaignId}/index`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to trigger indexing");
      }

      await response.json();
      toast.success("Campaign indexing triggered successfully!");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to trigger indexing";
      toast.error(message);
    } finally {
      setIsIndexing(false);
    }
  };

  useEffect(() => {
    fetchCampaignDetails();
  }, [fetchCampaignDetails]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <Card className={cn("space-y-4", className)}>
        <div className="space-y-2">
          <h3 className="text-ob-base-300 font-medium">Campaign Details</h3>
          <p className="text-ob-base-200 text-sm">
            Loading campaign details...
          </p>
        </div>
      </Card>
    );
  }

  if (!campaign) {
    return (
      <Card className={cn("space-y-4", className)}>
        <div className="space-y-2">
          <h3 className="text-ob-base-300 font-medium">Campaign Details</h3>
          <p className="text-ob-base-200 text-sm">Campaign not found</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <h3 className="text-ob-base-300 font-medium">Campaign Details</h3>
        <p className="text-ob-base-200 text-sm">
          Information about your campaign and its resources
        </p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium text-ob-base-300 mb-2">
              Basic Information
            </h4>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-ob-base-200">Name:</span>
                <span className="ml-2 text-ob-base-300">{campaign.name}</span>
              </div>
              <div>
                <span className="text-ob-base-200">ID:</span>
                <span className="ml-2 text-ob-base-300 font-mono text-xs">
                  {campaign.campaignId}
                </span>
              </div>
              <div>
                <span className="text-ob-base-200">Created:</span>
                <span className="ml-2 text-ob-base-300">
                  {formatDate(campaign.createdAt)}
                </span>
              </div>
              <div>
                <span className="text-ob-base-200">Updated:</span>
                <span className="ml-2 text-ob-base-300">
                  {formatDate(campaign.updatedAt)}
                </span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-medium text-ob-base-300 mb-2">Resources</h4>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-ob-base-200">Total Resources:</span>
                <span className="ml-2 text-ob-base-300">
                  {campaign.resources.length}
                </span>
              </div>
              <div>
                <span className="text-ob-base-200">Resource Types:</span>
                <div className="ml-2 mt-1">
                  {Object.entries(
                    campaign.resources.reduce(
                      (acc, resource) => {
                        acc[resource.type] = (acc[resource.type] || 0) + 1;
                        return acc;
                      },
                      {} as Record<string, number>
                    )
                  ).map(([type, count]) => (
                    <div key={type} className="text-ob-base-300">
                      • {type}: {count}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleIndexCampaign}
            loading={isIndexing}
            disabled={isIndexing}
          >
            {isIndexing ? "Indexing..." : "Trigger Indexing"}
          </Button>
          <Button onClick={fetchCampaignDetails} variant="secondary" size="sm">
            Refresh
          </Button>
        </div>
      </div>
    </Card>
  );
}
