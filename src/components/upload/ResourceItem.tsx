import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import { Button } from "../button/Button";
import { FileStatusIndicator } from "./FileStatusIndicator";
import { AuthService } from "../../services/auth-service";
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

interface ResourceItemProps {
  file: ResourceFileWithCampaigns;
  isExpanded: boolean;
  onToggleExpansion: (fileKey: string) => void;
  onAddToCampaign: (file: ResourceFileWithCampaigns) => void;
}

function getDisplayName(filename: string | undefined | null): string {
  if (!filename) {
    return "Unknown file";
  }
  return filename;
}

export function ResourceItem({
  file,
  isExpanded,
  onToggleExpansion,
  onAddToCampaign,
}: ResourceItemProps) {
  return (
    <div className="p-2 border rounded-lg bg-white dark:bg-neutral-900 shadow-sm border-neutral-200 dark:border-neutral-800">
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 mr-3 min-w-0">
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate cursor-help">
              {getDisplayName(file.file_name)}
            </h4>
            {AuthService.getUsernameFromStoredJwt() && (
              <FileStatusIndicator
                tenant={AuthService.getUsernameFromStoredJwt()!}
                initialStatus={file.status}
                className="flex-shrink-0"
              />
            )}
          </div>
          <button
            onClick={() => onToggleExpansion(file.file_key)}
            type="button"
            className="flex-shrink-0 p-1 rounded-md hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors duration-200"
          >
            {isExpanded ? (
              <CaretDownIcon size={16} className="text-purple-600" />
            ) : (
              <CaretRightIcon size={16} className="text-purple-600" />
            )}
          </button>
        </div>

        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="mt-4 text-xs space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">
                Uploaded:
              </span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {new Date(file.created_at)
                  .toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "2-digit",
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })
                  .replace(",", "")
                  .replace(" PM", "p")
                  .replace(" AM", "a")}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Size:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {file.file_size
                  ? (file.file_size / 1024 / 1024).toFixed(2)
                  : "Unknown"}{" "}
                MB
              </span>
            </div>
          </div>

          {file.description && (
            <div className="mt-3">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {file.description}
              </p>
            </div>
          )}

          {file.tags && file.tags.length > 0 && (
            <div className="mt-3">
              <div className="flex flex-wrap gap-1">
                {file.tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {file.campaigns && file.campaigns.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                Linked campaigns:
              </p>
              <div className="flex flex-wrap gap-1">
                {file.campaigns.map((campaign) => (
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

          <div className="mt-4 space-y-2">
            <Button
              onClick={() => onAddToCampaign(file)}
              variant="secondary"
              size="sm"
              className="w-full !text-purple-600 dark:!text-purple-400 hover:!text-purple-700 dark:hover:!text-purple-300 border-purple-200 dark:border-purple-700 hover:border-purple-300 dark:hover:border-purple-600"
            >
              Add to campaign
            </Button>
            <Button
              onClick={() => {
                // TODO: Implement edit functionality
                console.log("Edit file:", file.file_key);
              }}
              variant="secondary"
              size="sm"
              className="w-full text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              Edit
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
