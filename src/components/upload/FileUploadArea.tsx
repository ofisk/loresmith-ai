import { cn } from "@/lib/utils";

interface FileUploadAreaProps {
  currentFile: File | null;
  loading: boolean;
  className?: string;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDragEnter: (event: React.DragEvent) => void;
  onDragLeave: (event: React.DragEvent) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onKeyUp: (event: React.KeyboardEvent) => void;
  onClick: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export function FileUploadArea({
  currentFile,
  loading,
  className,
  onFileSelect,
  onDrop,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onKeyDown,
  onKeyUp,
  onClick,
  fileInputRef,
}: FileUploadAreaProps) {
  return (
    <div className="flex justify-center mb-3">
      <button
        type="button"
        className={cn(
          "border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/20 focus:border-purple-500 outline-none bg-gray-50 dark:bg-gray-800/50",
          loading && "opacity-50 pointer-events-none",
          className
        )}
        aria-label="Upload resource file"
        onClick={onClick}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.doc,.docx"
          onChange={onFileSelect}
          className="hidden"
          multiple
        />
        {currentFile ? (
          <div className="text-center">
            <div className="text-gray-700 dark:text-gray-200 text-sm font-medium mb-2">
              {currentFile.name}
            </div>
            <div className="text-gray-500 dark:text-gray-400 text-xs">
              {(currentFile.size / 1024 / 1024).toFixed(2)} MB
            </div>
          </div>
        ) : (
          <div className="text-center">
            <div className="text-gray-600 dark:text-gray-300 text-sm font-medium mb-2">
              Click to select or drag and drop
            </div>
            <div className="text-gray-500 dark:text-gray-400 text-xs">
              Supported: PDF, TXT, DOC, DOCX
            </div>
          </div>
        )}
      </button>
    </div>
  );
}
