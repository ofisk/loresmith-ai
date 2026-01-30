import { FormField } from "@/components/input/FormField";
import type { Campaign } from "@/types/campaign";

interface CampaignDetailsTabProps {
  campaign: Campaign;
  isEditing: boolean;
  editedName: string;
  editedDescription: string;
  nameId: string;
  descriptionId: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
}

/**
 * Details tab content: campaign name, description, and metadata.
 * Edit/save/cancel and view graph actions stay in the modal footer.
 */
export function CampaignDetailsTab({
  campaign,
  isEditing,
  editedName,
  editedDescription,
  nameId,
  descriptionId,
  onNameChange,
  onDescriptionChange,
}: CampaignDetailsTabProps) {
  return (
    <div className="space-y-4">
      {isEditing ? (
        <FormField
          id={nameId}
          label="Campaign name"
          value={editedName}
          onValueChange={onNameChange}
          placeholder="Enter campaign name"
        />
      ) : (
        <div>
          <div className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Campaign name
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-gray-900 dark:text-gray-100">{campaign.name}</p>
          </div>
        </div>
      )}

      {isEditing ? (
        <FormField
          id={descriptionId}
          label="Description"
          value={editedDescription}
          onValueChange={onDescriptionChange}
          placeholder="Enter campaign description"
          multiline
          rows={4}
        />
      ) : (
        <div>
          <div className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Description
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg min-h-[100px]">
            <p className="text-gray-900 dark:text-gray-100">
              {campaign.description || "No description provided"}
            </p>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center text-sm text-gray-500 dark:text-gray-400">
        <div>
          <span className="font-medium">Created:</span>{" "}
          {new Date(campaign.createdAt).toLocaleDateString()}
        </div>
        <div className="text-right">
          <span className="font-medium">ID:</span> {campaign.campaignId}
        </div>
      </div>
    </div>
  );
}
