import type React from "react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { API_CONFIG } from "../../shared";
import type {
  AddResourceModalProps,
  AddResourceRequest,
  ResourceType,
} from "../../types/campaign";
import { Button } from "../button/Button";
import { Input } from "../input/Input";
import { Label } from "../label/Label";
import { Loader } from "../loader/Loader";
import { Modal } from "../modal/Modal";
import { Select } from "../select/Select";

export function AddResourceModal({
  isOpen,
  onClose,
  onAddResource,
  campaignId,
  pdf,
  campaigns = [],
}: AddResourceModalProps) {
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaignId);
  const [resourceType, setResourceType] = useState<ResourceType>("pdf");
  const [resourceName, setResourceName] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resourceTypeOptions = [
    { value: "pdf", label: "📄 PDF Document" },
    { value: "character", label: "👤 Character Sheet" },
    { value: "note", label: "📝 Note" },
    { value: "image", label: "🖼️ Image" },
  ];

  const campaignOptions = campaigns.map((campaign) => ({
    value: campaign.campaignId,
    label: `${campaign.name} (${campaign.campaignId.slice(0, 3)}...)`,
  }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCampaignId.trim()) {
      setError("Please select a campaign");
      return;
    }

    if (!resourceId.trim()) {
      setError("Resource ID is required");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE(selectedCampaignId)
        ),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: resourceType,
            id: resourceId.trim(),
            name:
              resourceName.trim() ||
              resourceType.charAt(0).toUpperCase() + resourceType.slice(1),
          } as AddResourceRequest),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to add resource");
      }

      await response.json(); // Ensure response is consumed

      // Call the parent callback with the new resource
      onAddResource({
        type: resourceType,
        id: resourceId.trim(),
        name:
          resourceName.trim() ||
          resourceType.charAt(0).toUpperCase() + resourceType.slice(1),
      });

      // Reset form and close modal
      resetForm();
      onClose();
      toast.success("Resource added successfully!");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to add resource";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedCampaignId(campaignId);
    setResourceType("pdf");
    setResourceName("");
    setResourceId("");
    setError(null);
  };

  const handleClose = () => {
    if (!isSubmitting) {
      resetForm();
      onClose();
    }
  };

  // For the Input fields, ensure their state is only set from props on mount or when pdf changes
  useEffect(() => {
    if (pdf) {
      setResourceType("pdf");
      setResourceName(pdf.fileName);
      setResourceId(pdf.fileKey);
    } else {
      setResourceType("pdf");
      setResourceName("");
      setResourceId("");
    }
  }, [pdf]);

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
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className="p-6">
        <h2 className="text-xl font-semibold mb-6">Add Resource</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            {campaigns.length > 0 && (
              <div>
                <Label htmlFor="campaign" title="Campaign" />
                <select
                  id="campaign"
                  className="btn btn-secondary interactive relative appearance-none truncate bg-no-repeat focus:outline-none add-size-base !pr-9 add-focus"
                  style={{
                    backgroundImage: "url(/assets/caret.svg)",
                    backgroundPosition: "calc(100% - 10px) calc(50%)",
                    backgroundSize: "16px",
                  }}
                  value={selectedCampaignId}
                  onChange={(e) => setSelectedCampaignId(e.target.value)}
                  disabled={isSubmitting}
                >
                  <option value="">Select a campaign...</option>
                  {campaignOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-muted-foreground mt-1">
                  Select the campaign to add this resource to
                </p>
              </div>
            )}

            <div>
              <Label htmlFor="resourceType" title="Resource Type" />
              <Select
                value={resourceType}
                setValue={(value) => setResourceType(value as ResourceType)}
                options={resourceTypeOptions}
              />
              <p className="text-sm text-muted-foreground mt-1">
                {getResourceTypeDescription(resourceType)}
              </p>
            </div>

            <div>
              <Label htmlFor="resourceName" title="Resource Name (Optional)" />
              <Input
                id="resourceName"
                type="text"
                value={resourceName}
                onValueChange={(value) => setResourceName(value)}
                placeholder={`Enter ${resourceType} name...`}
              />
              <p className="text-sm text-muted-foreground mt-1">
                A friendly name to display for this resource
              </p>
            </div>

            <div>
              <Label htmlFor="resourceId" title="Resource ID" />
              <Input
                id="resourceId"
                type="text"
                value={resourceId}
                onValueChange={(value) => setResourceId(value)}
                placeholder="Enter resource ID or URL..."
                required
                disabled
              />
              <p className="text-sm text-muted-foreground mt-1">
                {resourceType === "pdf" &&
                  "Enter the file key or URL of the PDF"}
                {resourceType === "character" &&
                  "Enter the character ID or URL"}
                {resourceType === "note" && "Enter the note ID or URL"}
                {resourceType === "image" && "Enter the image ID or URL"}
              </p>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="flex justify-end space-x-3">
            <Button
              type="button"
              variant="secondary"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isSubmitting ||
                !resourceId.trim() ||
                !selectedCampaignId?.trim()
              }
            >
              {isSubmitting ? (
                <>
                  <Loader size={16} className="mr-2" />
                  Adding...
                </>
              ) : (
                "Add Resource"
              )}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
