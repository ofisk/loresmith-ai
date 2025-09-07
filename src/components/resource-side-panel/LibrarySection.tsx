import { CaretDown, CaretRight, FileText, Plus } from "@phosphor-icons/react";
import { Card } from "../card/Card";
import { ResourceList } from "../upload/ResourceList";
import { StorageTracker } from "../storage-tracker";

interface LibrarySectionProps {
  isOpen: boolean;
  onToggle: () => void;
  refreshTrigger: number;
  onAddToLibrary: () => void;
}

export function LibrarySection({
  isOpen,
  onToggle,
  refreshTrigger,
  onAddToLibrary,
}: LibrarySectionProps) {
  return (
    <Card className="p-0 border-t border-neutral-200 dark:border-neutral-700">
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-3 flex items-center justify-between text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-purple-600" />
          <span className="font-medium">Your resource library</span>
        </div>
        {isOpen ? <CaretDown size={16} /> : <CaretRight size={16} />}
      </button>

      {isOpen && (
        <div className="border-t border-neutral-200 dark:border-neutral-700 h-96 overflow-y-auto">
          <div className="p-3">
            <button
              type="button"
              onClick={onAddToLibrary}
              className="w-40 px-3 py-1.5 bg-neutral-200 dark:bg-neutral-700 text-purple-600 dark:text-purple-400 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <Plus size={14} />
              Add to library
            </button>
          </div>
          <div className="border-t border-neutral-200 dark:border-neutral-700">
            <ResourceList refreshTrigger={refreshTrigger} />
            <StorageTracker />
          </div>
        </div>
      )}
    </Card>
  );
}
