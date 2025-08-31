import { useRef, useState } from "react";
import type { ProcessingProgress } from "../types/progress";

// Function to sanitize filename by removing/replacing URL-encoded characters
const sanitizeFilename = (filename: string): string => {
  return filename
    .replace(/[<>:"/\\|?*]/g, "_") // Replace invalid filesystem characters
    .replace(/\s+/g, "_") // Replace spaces with underscores
    .replace(/[^\w\-_.]/g, "_") // Replace any other non-alphanumeric chars except -_.
    .replace(/_+/g, "_") // Replace multiple underscores with single
    .replace(/^_+|_+$/g, "") // Remove leading/trailing underscores
    .replace(/\.(pdf|txt|doc|docx)$/i, (match) => match.toLowerCase()); // Ensure file extensions are lowercase
};

interface FileUploadState {
  selectedFiles: File[];
  currentFileIndex: number;
  filename: string;
  description: string;
  tags: string[];
  tagInput: string;
  isValid: boolean;
  uploadSuccess: boolean;
  initialValues: {
    filename: string;
    description: string;
    tags: string[];
  };
}

export function useFileUpload(
  onUpload: (
    file: File,
    filename: string,
    description: string,
    tags: string[]
  ) => void,
  loading: boolean = false,
  uploadProgress: ProcessingProgress | null = null
) {
  const [state, setState] = useState<FileUploadState>({
    selectedFiles: [],
    currentFileIndex: 0,
    filename: "",
    description: "",
    tags: [],
    tagInput: "",
    isValid: false,
    uploadSuccess: false,
    initialValues: {
      filename: "",
      description: "",
      tags: [],
    },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentFile = state.selectedFiles[state.currentFileIndex];

  // Update state with a partial update
  const updateState = (updates: Partial<FileUploadState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  // Handle file selection from input
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const validFiles = files.filter(
      (file) =>
        file.type === "application/pdf" ||
        file.type === "text/plain" ||
        file.type === "application/msword" ||
        file.type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    if (validFiles.length > 0) {
      const newFilename = sanitizeFilename(validFiles[0].name);
      updateState({
        selectedFiles: validFiles,
        currentFileIndex: 0,
        filename: newFilename,
        isValid: true,
        uploadSuccess: false,
        initialValues: {
          filename: newFilename,
          description: "",
          tags: [],
        },
      });
    } else {
      updateState({
        selectedFiles: [],
        filename: "",
        isValid: false,
        uploadSuccess: false,
      });
    }
  };

  // Handle file drop
  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    const validFiles = files.filter(
      (file) =>
        file.type === "application/pdf" ||
        file.type === "text/plain" ||
        file.type === "application/msword" ||
        file.type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    if (validFiles.length > 0) {
      const newFilename = sanitizeFilename(validFiles[0].name);
      updateState({
        selectedFiles: validFiles,
        currentFileIndex: 0,
        filename: newFilename,
        isValid: true,
        uploadSuccess: false,
        initialValues: {
          filename: newFilename,
          description: "",
          tags: [],
        },
      });
    } else {
      updateState({
        selectedFiles: [],
        filename: "",
        isValid: false,
        uploadSuccess: false,
      });
    }
  };

  // Handle drag over
  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  // Handle file upload
  const handleUpload = () => {
    if (currentFile) {
      onUpload(currentFile, state.filename, state.description, state.tags);
      updateState({
        uploadSuccess: true,
        initialValues: {
          filename: state.filename,
          description: state.description,
          tags: state.tags,
        },
      });
    }
  };

  // Add tag
  const handleAddTag = () => {
    const trimmedTag = state.tagInput.trim();
    if (trimmedTag && !state.tags.includes(trimmedTag)) {
      updateState({
        tags: [...state.tags, trimmedTag],
        tagInput: "",
      });
    }
  };

  // Remove tag
  const handleRemoveTag = (tagToRemove: string) => {
    updateState({
      tags: state.tags.filter((tag) => tag !== tagToRemove),
    });
  };

  // Handle tag key press
  const handleTagKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAddTag();
    }
  };

  // Navigate to next file
  const handleNextFile = () => {
    if (state.currentFileIndex < state.selectedFiles.length - 1) {
      const nextIndex = state.currentFileIndex + 1;
      const nextFile = state.selectedFiles[nextIndex];
      const newFilename = sanitizeFilename(nextFile.name);
      updateState({
        currentFileIndex: nextIndex,
        filename: newFilename,
        uploadSuccess: false,
        initialValues: {
          filename: newFilename,
          description: "",
          tags: [],
        },
      });
    }
  };

  // Navigate to previous file
  const handlePreviousFile = () => {
    if (state.currentFileIndex > 0) {
      const prevIndex = state.currentFileIndex - 1;
      const prevFile = state.selectedFiles[prevIndex];
      const newFilename = sanitizeFilename(prevFile.name);
      updateState({
        currentFileIndex: prevIndex,
        filename: newFilename,
        uploadSuccess: false,
        initialValues: {
          filename: newFilename,
          description: "",
          tags: [],
        },
      });
    }
  };

  // Check if form has changes
  const hasChanges =
    state.filename !== state.initialValues.filename ||
    state.description !== state.initialValues.description ||
    JSON.stringify(state.tags) !== JSON.stringify(state.initialValues.tags);

  // Check if upload is disabled
  const isUploadDisabled =
    !currentFile || loading || (state.uploadSuccess && !hasChanges);

  // Trigger file input click
  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Handle file input key events
  const handleFileInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      triggerFileInput();
    }
  };

  const handleFileInputKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      triggerFileInput();
    }
  };

  return {
    // State
    selectedFiles: state.selectedFiles,
    currentFile,
    filename: state.filename,
    description: state.description,
    tags: state.tags,
    tagInput: state.tagInput,
    isValid: state.isValid,
    uploadSuccess: state.uploadSuccess,
    currentFileIndex: state.currentFileIndex,
    hasChanges,
    isUploadDisabled,
    uploadProgress,

    // Refs
    fileInputRef,

    // Actions
    handleFileSelect,
    handleDrop,
    handleDragOver,
    handleUpload,
    handleAddTag,
    handleRemoveTag,
    handleTagKeyPress,
    handleNextFile,
    handlePreviousFile,
    triggerFileInput,
    handleFileInputKeyDown,
    handleFileInputKeyUp,

    // State setters
    setFilename: (filename: string) => updateState({ filename }),
    setDescription: (description: string) => updateState({ description }),
    setTagInput: (tagInput: string) => updateState({ tagInput }),
  };
}
