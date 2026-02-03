import { CaretDown, CaretRight, Plus } from "@phosphor-icons/react";
import { Card } from "@/components/card/Card";
import { StorageTracker } from "@/components/storage-tracker";
import { ResourceList } from "@/components/upload/ResourceList";
import type { Campaign } from "@/types/campaign";
import type { ResourceFileWithCampaigns } from "@/hooks/useResourceFiles";
import libraryIcon from "@/assets/library.png";

interface LibrarySectionProps {
  isOpen: boolean;
  onToggle: () => void;
  onAddToLibrary: () => void;
  onAddToCampaign?: (file: ResourceFileWithCampaigns) => void;
  onEditFile?: (file: ResourceFileWithCampaigns) => void;
  campaigns?: Campaign[];
  campaignAdditionProgress?: Record<string, number>;
  isAddingToCampaigns?: boolean;
}

export function LibrarySection({
  isOpen,
  onToggle,
  onAddToLibrary,
  onAddToCampaign,
  onEditFile,
  campaigns,
  campaignAdditionProgress = {},
  isAddingToCampaigns = false,
}: LibrarySectionProps) {
  return (
    <Card className="tour-library-section p-0 border-t border-neutral-200 dark:border-neutral-700">
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-3 flex items-center justify-between text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <img src={libraryIcon} alt="Library" className="w-12 h-12" />
          <span className="font-medium text-sm">Your resource library</span>
        </div>
        {isOpen ? <CaretDown size={16} /> : <CaretRight size={16} />}
      </button>

      {isOpen && (
        <div className="border-t border-neutral-200 dark:border-neutral-700">
          <div className="p-3">
            <button
              type="button"
              onClick={onAddToLibrary}
              className="w-full px-3 py-1.5 bg-neutral-200 dark:bg-neutral-700 text-purple-600 dark:text-purple-400 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <Plus size={14} />
              Add to library
            </button>
          </div>
          <div className="border-t border-neutral-200 dark:border-neutral-700">
            <ResourceList
              onAddToCampaign={onAddToCampaign}
              onEditFile={onEditFile}
              campaigns={campaigns}
              campaignAdditionProgress={campaignAdditionProgress}
              _isAddingToCampaigns={isAddingToCampaigns}
            />
            <StorageTracker />
          </div>
        </div>
      )}
    </Card>
  );
}
