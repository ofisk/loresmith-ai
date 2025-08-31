import { Button } from "../button/Button";
import { Modal } from "../modal/Modal";
import { MultiSelect } from "../select/MultiSelect";
import type { Campaign } from "../../types/campaign";

interface ResourceFile {
  id: string;
  file_key: string;
  file_name: string;
  file_size: number;
  description?: string;
  tags?: string[];
  status: string;
  created_at: string;
  updated_at: string;
}

interface ResourceFileWithCampaigns extends ResourceFile {
  campaigns?: Campaign[];
}

interface AddToCampaignModalProps {
  isOpen: boolean;
  selectedFile: ResourceFileWithCampaigns | null;
  campaigns: Campaign[];
  selectedCampaigns: string[];
  onSelectionChange: (campaigns: string[]) => void;
  onAdd: () => void;
  onClose: () => void;
  addingToCampaigns: boolean;
}

function getDisplayName(filename: string | undefined | null): string {
  if (!filename) {
    return "Unknown file";
  }
  return filename;
}

export function AddToCampaignModal({
  isOpen,
  selectedFile,
  campaigns,
  selectedCampaigns,
  onSelectionChange,
  onAdd,
  onClose,
  addingToCampaigns,
}: AddToCampaignModalProps) {
  const availableCampaigns = campaigns.filter(
    (campaign) =>
      !selectedFile?.campaigns?.some(
        (c) => c.campaignId === campaign.campaignId
      )
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      cardStyle={{ width: 500, height: 400 }}
    >
      <div className="p-6">
        <h3 className="text-lg font-semibold mb-4">
          "{selectedFile ? getDisplayName(selectedFile.file_name) : ""}"
        </h3>

        {campaigns.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-3">
              You haven't created any campaigns yet
            </p>
            <div className="text-sm text-gray-500 dark:text-gray-400 space-y-2">
              <p>
                To create a campaign, chat with the LoreSmith agent! Simply ask
                something like:
              </p>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-left">
                <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">
                  💬 Try asking:
                </p>
                <p className="text-gray-600 dark:text-gray-400">
                  "Create a new D&D campaign called [Campaign Name]"
                </p>
                <p className="text-gray-600 dark:text-gray-400">
                  "Help me start a new campaign about [theme/idea]"
                </p>
              </div>
              <p className="mt-3">
                LoreSmith will help you design the campaign together and then
                you can add resources to it!
              </p>
            </div>
          </div>
        ) : (
          <>
            {selectedFile?.campaigns && selectedFile.campaigns.length > 0 && (
              <div className="mb-4 p-3 bg-purple-50 dark:bg-purple-900/10 rounded-md">
                <p className="text-sm font-medium text-purple-800 dark:text-purple-300 mb-2">
                  Linked campaigns:
                </p>
                <div className="flex flex-wrap gap-1">
                  {selectedFile.campaigns.map((campaign) => (
                    <span
                      key={campaign.campaignId}
                      className="px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-300 rounded"
                    >
                      {campaign.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <fieldset className="mb-4">
              <legend className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select campaigns
              </legend>
              {availableCampaigns.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400 p-3 bg-gray-50 dark:bg-gray-900/20 rounded-md">
                  This resource is already in all available campaigns.
                </div>
              ) : (
                <MultiSelect
                  options={availableCampaigns.map((campaign) => ({
                    value: campaign.campaignId,
                    label: campaign.name,
                  }))}
                  selectedValues={selectedCampaigns}
                  onSelectionChange={onSelectionChange}
                  placeholder="Choose campaigns..."
                />
              )}
            </fieldset>

            <div className="flex justify-end gap-3 mt-6">
              <Button
                onClick={onClose}
                variant="secondary"
                size="sm"
                className="w-32 text-center justify-center"
              >
                Cancel
              </Button>
              <Button
                onClick={onAdd}
                disabled={
                  selectedCampaigns.length === 0 ||
                  availableCampaigns.length === 0
                }
                loading={addingToCampaigns}
                variant="primary"
                size="sm"
                className="w-32 text-center justify-center"
              >
                Add
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
