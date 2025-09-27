import { useState, useEffect, useId } from "react";
import { FloppyDisk } from "@phosphor-icons/react";
import { authenticatedFetchWithExpiration } from "../../services/auth-service";
import { API_CONFIG } from "../../shared-config";
import { ERROR_MESSAGES } from "../../app-constants";
import { Modal } from "../modal/Modal";
import { FormField } from "../input/FormField";
import { FormButton } from "../button/FormButton";

interface EditFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: {
    id: string;
    file_key: string;
    file_name: string;
    description?: string;
    tags?: string[];
  };
  onUpdate: (updatedFile: any) => void;
}

export function EditFileModal({
  isOpen,
  onClose,
  file,
  onUpdate,
}: EditFileModalProps) {
  const descriptionId = useId();
  const tagsId = useId();
  const [editedDescription, setEditedDescription] = useState(
    file.description || ""
  );
  const [editedTags, setEditedTags] = useState(file.tags?.join(", ") || "");
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when file changes
  useEffect(() => {
    if (file) {
      setEditedDescription(file.description || "");
      setEditedTags(file.tags?.join(", ") || "");
    }
  }, [file]);

  const handleSave = async () => {
    setIsUpdating(true);
    setError(null);

    try {
      const tagsArray = editedTags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      const { response, jwtExpired } = await authenticatedFetchWithExpiration(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.LIBRARY.UPDATE_METADATA(file.file_key)
        ),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            description: editedDescription.trim(),
            tags: tagsArray,
          }),
        }
      );

      if (jwtExpired) {
        throw new Error(ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
      }

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || "Failed to update file metadata");
      }

      // Update the file object with new metadata
      const updatedFile = {
        ...file,
        description: editedDescription.trim(),
        tags: tagsArray,
      };

      onUpdate(updatedFile);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update file");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancel = () => {
    setEditedDescription(file.description || "");
    setEditedTags(file.tags?.join(", ") || "");
    setError(null);
    onClose();
  };

  if (!file) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      className="max-w-2xl"
      cardStyle={{ width: "600px", maxWidth: "90vw" }}
    >
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Edit file details
          </h2>
        </div>

        {/* File Info */}
        <div className="space-y-4">
          {/* File Name */}
          <div>
            <div className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              File name
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-gray-900 dark:text-gray-100">
                {file.file_name}
              </p>
            </div>
          </div>

          {/* Description */}
          <FormField
            id={descriptionId}
            label="Description"
            value={editedDescription}
            onValueChange={(value) => setEditedDescription(value)}
            placeholder="Describe the secrets and knowledge within this ledger..."
            multiline
            rows={4}
          />

          {/* Tags */}
          <FormField
            id={tagsId}
            label="Tags"
            value={editedTags}
            onValueChange={(value) => setEditedTags(value)}
            placeholder="Label this ledger with mystical tags (e.g., dragons, magic, adventure)..."
          />
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
          <div className="flex gap-2">
            <FormButton
              onClick={handleSave}
              disabled={isUpdating}
              loading={isUpdating}
              icon={<FloppyDisk size={16} />}
            >
              {isUpdating ? "Saving..." : "Save changes"}
            </FormButton>
            <FormButton
              onClick={handleCancel}
              disabled={isUpdating}
              variant="secondary"
            >
              Cancel
            </FormButton>
          </div>
        </div>
      </div>
    </Modal>
  );
}
