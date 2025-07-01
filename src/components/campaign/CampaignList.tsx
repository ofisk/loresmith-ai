import { useState, useEffect } from "react";
import type {
  Campaign,
  CampaignListProps,
  ListCampaignsResponse,
} from "../../types/campaign";
import { Button } from "../button/Button";
import { Card } from "../card/Card";
import { Loader } from "../loader/Loader";

export function CampaignList({
  onViewCampaign,
  onCreateCampaign,
}: CampaignListProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/campaigns");
      if (!response.ok) {
        throw new Error("Failed to fetch campaigns");
      }

      const data = (await response.json()) as ListCampaignsResponse;
      setCampaigns(data.campaigns || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch campaigns"
      );
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getResourceCount = (resources: Campaign["resources"]) => {
    const counts = {
      pdf: 0,
      character: 0,
      note: 0,
      image: 0,
    };

    for (const resource of resources) {
      counts[resource.type]++;
    }

    return counts;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <Loader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-6">
        <p className="text-red-600 mb-4">{error}</p>
        <Button onClick={fetchCampaigns} variant="secondary">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Campaigns</h2>
        <Button onClick={onCreateCampaign}>Create New Campaign</Button>
      </div>

      {campaigns.length === 0 ? (
        <Card className="p-8 text-center">
          <h3 className="text-lg font-semibold mb-2">No campaigns yet</h3>
          <p className="text-muted-foreground mb-4">
            Create your first campaign to start organizing your D&D resources.
          </p>
          <Button onClick={onCreateCampaign}>Create Your First Campaign</Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => {
            const resourceCounts = getResourceCount(campaign.resources);
            const totalResources = Object.values(resourceCounts).reduce(
              (a, b) => a + b,
              0
            );

            return (
              <Card
                key={campaign.campaignId}
                className="p-6 hover:shadow-md transition-shadow"
              >
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">
                      {campaign.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Created {formatDate(campaign.createdAt)}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Total Resources:</span>
                      <span className="font-medium">{totalResources}</span>
                    </div>
                    {totalResources > 0 && (
                      <div className="text-xs text-muted-foreground space-y-1">
                        {resourceCounts.pdf > 0 && (
                          <div>📄 {resourceCounts.pdf} PDFs</div>
                        )}
                        {resourceCounts.character > 0 && (
                          <div>👤 {resourceCounts.character} Characters</div>
                        )}
                        {resourceCounts.note > 0 && (
                          <div>📝 {resourceCounts.note} Notes</div>
                        )}
                        {resourceCounts.image > 0 && (
                          <div>🖼️ {resourceCounts.image} Images</div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="pt-2">
                    <Button
                      onClick={() => onViewCampaign(campaign.campaignId)}
                      variant="secondary"
                      className="w-full"
                    >
                      View Details
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
