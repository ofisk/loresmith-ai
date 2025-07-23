export interface ProcessingStep {
  id: string;
  name: string;
  description: string;
  status: "pending" | "processing" | "completed" | "error";
  progress: number; // 0-100
  startTime?: number;
  endTime?: number;
  error?: string;
}

export interface ProcessingProgress {
  fileKey: string;
  username: string;
  overallProgress: number; // 0-100
  currentStep: string;
  steps: ProcessingStep[];
  startTime: number;
  estimatedTimeRemaining?: number; // in seconds
  status: "pending" | "processing" | "completed" | "error";
  error?: string;
}

export interface ProgressUpdate {
  type: "progress_update";
  data: ProcessingProgress;
}

export interface ProgressComplete {
  type: "progress_complete";
  data: {
    fileKey: string;
    success: boolean;
    error?: string;
    suggestedMetadata?: {
      description: string;
      tags: string[];
      suggestions: string[];
    };
  };
}

export type ProgressMessage = ProgressUpdate | ProgressComplete;

// Step definitions for PDF processing
export const PDF_PROCESSING_STEPS: Omit<
  ProcessingStep,
  "status" | "progress" | "startTime" | "endTime"
>[] = [
  {
    id: "fetch",
    name: "Fetching PDF",
    description: "Downloading PDF file from storage",
  },
  {
    id: "extract",
    name: "Extracting Text",
    description: "Extracting text content from PDF",
  },
  {
    id: "metadata",
    name: "Generating Metadata",
    description: "AI-powered metadata generation",
  },
  {
    id: "chunk",
    name: "Chunking Content",
    description: "Splitting content into searchable chunks",
  },
  {
    id: "embed",
    name: "Generating Embeddings",
    description: "Creating vector embeddings for search",
  },
  {
    id: "store",
    name: "Storing Data",
    description: "Saving chunks and embeddings to database",
  },
];
