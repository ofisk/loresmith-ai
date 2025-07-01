import { useEffect, useState } from "react";
import { Button } from "../button/Button";
import { Card } from "../card/Card";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface CampaignResource {
  type: string;
  id: string;
  name?: string;
}

interface CampaignResourceListProps {
  campaignId: string;
  className?: string;
  onResourceRemoved?: (resourceId: string) => void;
}

export function CampaignResourceList({ 
  campaignId, 
  className, 
  onResourceRemoved 
}: CampaignResourceListProps) {
  const [resources, setResources] = useState<CampaignResource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRemoving, setIsRemoving] = useState<string | null>(null);

  const fetchResources = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/campaigns/${campaignId}/resources`);
      
      if (!response.ok) {
        throw new Error("Failed to fetch resources");
      }

      const data = await response.json();
      setResources(data.resources || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch resources";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveResource = async (resourceId: string) => {
    try {
      setIsRemoving(resourceId);
      const response = await fetch(`/api/campaigns/${campaignId}/resource/${resourceId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to remove resource");
      }

      toast.success("Resource removed successfully!");
      setResources(resources.filter(r => r.id !== resourceId));
      onResourceRemoved?.(resourceId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to remove resource";
      toast.error(message);
    } finally {
      setIsRemoving(null);
    }
  };

  useEffect(() => {
    fetchResources();
  }, [campaignId]);

  const getResourceIcon = (type: string) => {
    switch (type) {
      case "pdf": return "📄";
      case "character": return "👤";
      case "note": return "📝";
      case "image": return "🖼️";
      default: return "📎";
    }
  };

  if (isLoading) {
    return (
      <Card className={cn("space-y-4", className)}>
        <div className="space-y-2">
          <h3 className="text-ob-base-300 font-medium">Campaign Resources</h3>
          <p className="text-ob-base-200 text-sm">Loading resources...</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <h3 className="text-ob-base-300 font-medium">Campaign Resources</h3>
        <p className="text-ob-base-200 text-sm">
          {resources.length === 0 
            ? "No resources found in this campaign" 
            : `${resources.length} resource${resources.length === 1 ? '' : 's'} found`
          }
        </p>
      </div>

      {resources.length > 0 && (
        <div className="space-y-2">
          {resources.map((resource) => (
            <div
              key={resource.id}
              className="flex items-center justify-between p-3 border border-neutral-200 dark:border-neutral-700 rounded-md"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{getResourceIcon(resource.type)}</span>
                <div>
                  <div className="font-medium text-ob-base-300">
                    {resource.name || resource.id}
                  </div>
                  <div className="text-sm text-ob-base-200 capitalize">
                    {resource.type}
                  </div>
                </div>
              </div>
              <Button
                onClick={() => handleRemoveResource(resource.id)}
                variant="secondary"
                size="sm"
                loading={isRemoving === resource.id}
                disabled={isRemoving === resource.id}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          onClick={fetchResources}
          variant="secondary"
          size="sm"
        >
          Refresh
        </Button>
      </div>
    </Card>
  );
} 