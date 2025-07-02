import { useEffect } from "react";
import { Button } from "@/components/button/Button";
import { PdfUpload } from "./PdfUpload";
import { cn } from "@/lib/utils";

// Add animation styles
const modalAnimation = `
@keyframes modal-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes modal-scale-in {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}
`;

interface UploadDialogProps {
  onUpload: (
    file: File,
    filename: string,
    description: string,
    tags: string[]
  ) => void;
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
  // Prevent background scroll when modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  return (
    <>
      <style>{modalAnimation}</style>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-[modal-fade-in_0.2s_ease]"
        style={{ animationFillMode: "forwards" }}
      >
        <dialog
          className={cn(
            "relative bg-white dark:bg-neutral-900 rounded-xl shadow-2xl w-full max-w-md mx-auto p-6 animate-[modal-scale-in_0.25s_ease]",
            className
          )}
          style={{ animationFillMode: "forwards" }}
          open
        >
          {/* Close button */}
          <button
            onClick={onBack}
            className="absolute top-3 right-3 text-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 focus:outline-none"
            aria-label="Close"
            type="button"
          >
            ×
          </button>
          <div className="flex items-center justify-between mb-4">
            <div className="space-y-2">
              <h3 className="text-ob-base-300 font-medium">Upload PDF</h3>
              <p className="text-ob-base-200 text-sm">
                Upload a PDF file for processing and analysis
              </p>
            </div>
          </div>
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
        </dialog>
      </div>
    </>
  );
};
