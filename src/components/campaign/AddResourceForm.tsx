import { useState } from "react";
import { Button } from "../button/Button";
import { Card } from "../card/Card";
import { Input } from "../input/Input";
import { Label } from "../label/Label";
import { Select } from "../select/Select";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

type ResourceType = "pdf" | "character" | "note" | "image";

interface AddResourceFormProps {
  campaignId: string;
  className?: string;
  onResourceAdded?: (resource: any) => void;
}

export function AddResourceForm({ 
  campaignId, 
  className, 
  onResourceAdded 
}: AddResourceFormProps) {
  const [resourceType, setResourceType] = useState<ResourceType>("pdf");
  const [resourceId, setResourceId] = useState("");
  const [resourceName, setResourceName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resourceTypeOptions = [
    { value: "pdf", label: "📄 PDF Document" },
    { value: "character", label: "👤 Character Sheet" },
    { value: "note", label: "📝 Note" },
    { value: "image", label: "🖼️ Image" },
  ];

  const handleSubmit = async () => {
    if (!resourceId.trim()) {
      toast.error("Resource ID is required");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch(`/api/campaigns/${campaignId}/resource`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: resourceType,
          id: resourceId.trim(),
          name: resourceName.trim() || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to add resource");
      }

      const data = await response.json();
      toast.success("Resource added successfully!");
      
      // Reset form
      setResourceId("");
      setResourceName("");
      
      onResourceAdded?.(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add resource";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getResourceTypeDescription = (type: ResourceType) => {
    switch (type) {
      case "pdf":
        return "Upload or link to a PDF document (rulebooks, adventures, etc.)";
      case "character":
        return "Add a character sheet or character information";
      case "note":
        return "Create or link to campaign notes, session logs, etc.";
      case "image":
        return "Upload or link to images (maps, character portraits, etc.)";
      default:
        return "";
    }
  };

  return (
    <Card className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <h3 className="text-ob-base-300 font-medium">Add Resource to Campaign</h3>
        <p className="text-ob-base-200 text-sm">
          Add a new resource to organize with your campaign
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="resourceType" title="Resource Type">
            Resource Type
          </Label>
          <Select
            value={resourceType}
            setValue={(value) => setResourceType(value as ResourceType)}
            options={resourceTypeOptions}
          />
          <p className="text-sm text-ob-base-200 mt-1">
            {getResourceTypeDescription(resourceType)}
          </p>
        </div>

        <div>
          <Label htmlFor="resourceId" title="Resource ID">
            Resource ID
          </Label>
          <Input
            id="resourceId"
            type="text"
            value={resourceId}
            onValueChange={setResourceId}
            placeholder="Enter resource ID or URL..."
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
          />
          <p className="text-sm text-ob-base-200 mt-1">
            {resourceType === "pdf" && "Enter the file key or URL of the PDF"}
            {resourceType === "character" && "Enter the character ID or URL"}
            {resourceType === "note" && "Enter the note ID or URL"}
            {resourceType === "image" && "Enter the image ID or URL"}
          </p>
        </div>

        <div>
          <Label htmlFor="resourceName" title="Resource Name (Optional)">
            Resource Name (Optional)
          </Label>
          <Input
            id="resourceName"
            type="text"
            value={resourceName}
            onValueChange={setResourceName}
            placeholder={`Enter ${resourceType} name...`}
          />
          <p className="text-sm text-ob-base-200 mt-1">
            A friendly name to display for this resource
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleSubmit}
            disabled={!resourceId.trim() || isSubmitting}
            loading={isSubmitting}
          >
            {isSubmitting ? "Adding..." : "Add Resource"}
          </Button>
        </div>
      </div>
    </Card>
  );
} 