import React from "react";
import { Button } from "@/components/button/Button";
import { PdfUpload } from "./PdfUpload";
import { cn } from "@/lib/utils";

interface UploadDialogProps {
  onUpload: (...args: any[]) => void;
  loading: boolean;
  className?: string;
  onBack: () => void;
}

export const UploadDialog = ({
  onUpload,
  loading,
  className,
  onBack,
}: UploadDialogProps) => {
  const [isUploadPanelExpanded, setIsUploadPanelExpanded] =
    React.useState(true);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h3 className="text-ob-base-300 font-medium">Upload PDF</h3>
          <p className="text-ob-base-200 text-sm">
            Upload a PDF file for processing and analysis
          </p>
        </div>
        <Button
          onClick={() => setIsUploadPanelExpanded(!isUploadPanelExpanded)}
          variant="ghost"
          size="sm"
          className="text-ob-base-200 hover:text-ob-base-300"
        >
          {isUploadPanelExpanded ? "−" : "+"}
        </Button>
      </div>

      {isUploadPanelExpanded && (
        <>
          <PdfUpload
            onUpload={onUpload}
            loading={loading}
            className="border-0 p-0 shadow-none"
          />
          <div className="flex gap-2 pt-2">
            <Button
              onClick={onBack}
              variant="secondary"
              size="base"
              disabled={loading}
            >
              Back to Options
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
