import type React from "react";
import { useCallback, useState } from "react";
import toast from "react-hot-toast";
import { API_CONFIG } from "../../shared";
import { Button } from "../button/Button";
import { Input } from "../input/Input";
import { Label } from "../label/Label";
import { Loader } from "../loader/Loader";
import { Modal } from "../modal/Modal";
import { Select } from "../select/Select";

interface CharacterSheetUploadProps {
  isOpen: boolean;
  onClose: () => void;
  campaignId: string;
  onCharacterSheetAdded?: (characterSheet: any) => void;
}

export function CharacterSheetUpload({
  isOpen,
  onClose,
  campaignId,
  onCharacterSheetAdded,
}: CharacterSheetUploadProps) {
  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState<
    "pdf" | "docx" | "doc" | "txt" | "json"
  >("pdf");
  const [characterName, setCharacterName] = useState("");
  const [description, setDescription] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fileTypeOptions = [
    { value: "pdf", label: "📄 PDF Document" },
    { value: "docx", label: "📝 Word Document (.docx)" },
    { value: "doc", label: "📝 Word Document (.doc)" },
    { value: "txt", label: "📄 Text File (.txt)" },
    { value: "json", label: "🔧 JSON Character Data" },
  ];

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        setFileName(file.name);

        // Auto-detect file type
        const extension = file.name.split(".").pop()?.toLowerCase();
        if (extension === "pdf") setFileType("pdf");
        else if (extension === "docx") setFileType("docx");
        else if (extension === "doc") setFileType("doc");
        else if (extension === "txt") setFileType("txt");
        else if (extension === "json") setFileType("json");

        // Extract character name from filename if not provided
        if (!characterName) {
          const nameFromFile = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
          setCharacterName(nameFromFile);
        }
      }
    },
    [characterName]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fileName.trim()) {
      setError("Please select a file");
      return;
    }

    if (!characterName.trim()) {
      setError("Character name is required");
      return;
    }

    try {
      setIsUploading(true);
      setError(null);
      setUploadProgress(0);

      // Step 1: Get upload URL
      const uploadUrlResponse = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CHARACTER_SHEETS.UPLOAD_URL),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileName,
            fileType,
            campaignId,
            characterName: characterName.trim(),
            description: description.trim() || undefined,
          }),
        }
      );

      if (!uploadUrlResponse.ok) {
        throw new Error("Failed to generate upload URL");
      }

      const uploadData = (await uploadUrlResponse.json()) as {
        uploadUrl: string;
        fileKey: string;
        characterSheetId: string;
      };

      setUploadProgress(25);

      // Step 2: Upload the file
      const fileInput = document.getElementById(
        "character-sheet-file"
      ) as HTMLInputElement;
      const file = fileInput.files?.[0];

      if (!file) {
        throw new Error("No file selected");
      }

      // For now, we'll simulate the upload process
      // In a real implementation, you would use the uploadUrl to upload to R2
      setUploadProgress(50);

      // Simulate upload delay
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setUploadProgress(75);

      // Step 3: Process the character sheet
      const processResponse = await fetch(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CHARACTER_SHEETS.PROCESS(
            uploadData.characterSheetId
          )
        ),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            campaignId,
            extractData: true,
          }),
        }
      );

      if (!processResponse.ok) {
        throw new Error("Failed to process character sheet");
      }

      setUploadProgress(100);

      const result = (await processResponse.json()) as any;

      toast.success("Character sheet uploaded and processed successfully!");

      // Call the parent callback
      onCharacterSheetAdded?.({
        id: uploadData.characterSheetId,
        fileName,
        fileType,
        characterName: characterName.trim(),
        description: description.trim(),
        status: "completed",
        ...result,
      });

      // Reset form and close modal
      resetForm();
      onClose();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to upload character sheet";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const resetForm = () => {
    setFileName("");
    setFileType("pdf");
    setCharacterName("");
    setDescription("");
    setError(null);
    setUploadProgress(0);

    // Reset file input
    const fileInput = document.getElementById(
      "character-sheet-file"
    ) as HTMLInputElement;
    if (fileInput) {
      fileInput.value = "";
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      resetForm();
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className="p-6">
        <h2 className="text-xl font-semibold mb-6">Upload Character Sheet</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div>
              <Label
                htmlFor="character-sheet-file"
                title="Character Sheet File"
              />
              <input
                id="character-sheet-file"
                type="file"
                accept=".pdf,.docx,.doc,.txt,.json"
                onChange={handleFileSelect}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isUploading}
              />
              <p className="text-sm text-muted-foreground mt-1">
                Supported formats: PDF, Word documents, text files, and JSON
                character data
              </p>
            </div>

            <div>
              <Label htmlFor="fileType" title="File Type" />
              <Select
                value={fileType}
                setValue={(value) => setFileType(value as any)}
                options={fileTypeOptions}
              />
            </div>

            <div>
              <Label htmlFor="characterName" title="Character Name" />
              <Input
                id="characterName"
                value={characterName}
                onChange={(e) => setCharacterName(e.target.value)}
                placeholder="Enter character name"
                disabled={isUploading}
              />
            </div>

            <div>
              <Label htmlFor="description" title="Description (Optional)" />
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description of the character sheet"
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                disabled={isUploading}
              />
            </div>

            {uploadProgress > 0 && (
              <div>
                <Label title="Upload Progress" />
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {uploadProgress < 25 && "Generating upload URL..."}
                  {uploadProgress >= 25 &&
                    uploadProgress < 50 &&
                    "Uploading file..."}
                  {uploadProgress >= 50 &&
                    uploadProgress < 75 &&
                    "Processing character sheet..."}
                  {uploadProgress >= 75 && "Finalizing..."}
                </p>
              </div>
            )}

            {error && (
              <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md">
                {error}
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-3">
            <Button
              type="button"
              variant="secondary"
              onClick={handleClose}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isUploading || !fileName.trim() || !characterName.trim()
              }
            >
              {isUploading ? (
                <>
                  <Loader className="mr-2" />
                  Uploading...
                </>
              ) : (
                "Upload Character Sheet"
              )}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
