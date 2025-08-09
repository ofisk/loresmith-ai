import { useState } from "react";
import { CaretDown, CaretRight, FileText, Plus } from "@phosphor-icons/react";
import { Card } from "../card/Card";
import { PdfList } from "../pdf-upload/PdfList";
import { PdfUploadAgent } from "../pdf-upload/PdfUploadAgent";

interface ResourceSidePanelProps {
  className?: string;
}

export function ResourceSidePanel({ className = "" }: ResourceSidePanelProps) {
  const [isLibraryOpen, setIsLibraryOpen] = useState(true);
  const [refreshTrigger, _setRefreshTrigger] = useState(0);

  return (
    <div
      className={`w-80 h-full bg-neutral-50 dark:bg-neutral-900 border-r border-neutral-300 dark:border-neutral-800 flex flex-col ${className}`}
    >
      {/* Header */}
      <div className="p-4 border-b border-neutral-300 dark:border-neutral-800">
        <h2 className="font-semibold text-lg text-gray-900 dark:text-gray-100">
          Resources
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Manage your campaign content
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Upload Section */}
        <Card className="p-0">
          <button
            type="button"
            onClick={() => {
              // Find the "Add to library" button in the hidden PdfUploadAgent and click it
              const hiddenAgent = document.querySelector(
                ".hidden-upload-agent button"
              ) as HTMLButtonElement;
              if (hiddenAgent) {
                hiddenAgent.click();
              }
            }}
            className="w-full p-3 flex items-center gap-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <Plus size={16} className="text-purple-500" />
            <span className="font-medium">Add to library</span>
          </button>
        </Card>

        {/* Hidden PdfUploadAgent for modal functionality */}
        <div
          className="hidden-upload-agent"
          style={{
            position: "absolute",
            left: "-9999px",
            opacity: 0,
            pointerEvents: "none",
          }}
        >
          <PdfUploadAgent />
        </div>

        {/* Resources Section */}
        <Card className="p-0">
          <button
            type="button"
            onClick={() => setIsLibraryOpen(!isLibraryOpen)}
            className="w-full p-3 flex items-center justify-between text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-purple-600" />
              <span className="font-medium">Your library</span>
            </div>
            {isLibraryOpen ? <CaretDown size={16} /> : <CaretRight size={16} />}
          </button>

          {isLibraryOpen && (
            <div className="border-t border-neutral-200 dark:border-neutral-700 h-96 overflow-hidden">
              <PdfList refreshTrigger={refreshTrigger} />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
