import { useState, useEffect, useId, useCallback } from "react";
import { FloppyDisk } from "@phosphor-icons/react";
import {
  authenticatedFetchWithExpiration,
  AuthService,
} from "@/services/core/auth-service";
import { API_CONFIG } from "@/shared-config";
import { ERROR_MESSAGES } from "@/app-constants";
import { Modal } from "@/components/modal/Modal";
import { FormField } from "@/components/input/FormField";
import { FormButton } from "@/components/button/FormButton";
import { STANDARD_MODAL_SIZE_OBJECT } from "@/constants/modal-sizes";

interface EditFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: {
    id: string;
    file_key: string;
    file_name: string;
    display_name?: string;
    description?: string;
    tags?: string[] | string;
    status?: string; // Preserve status to avoid UI showing incorrect processing state
  };
  onUpdate: (updatedFile: any) => void;
}

export function EditFileModal({
  isOpen,
  onClose,
  file,
  onUpdate,
}: EditFileModalProps) {
  const displayNameId = useId();
  const descriptionId = useId();
  const tagsId = useId();

  // Helper to safely convert tags to comma-separated string
  const tagsToString = useCallback(
    (tags: string[] | string | undefined): string => {
      console.log("[EditFileModal] tagsToString called with:", {
        tags,
        type: typeof tags,
        isArray: Array.isArray(tags),
        tagsValue: tags,
      });

      if (!tags) {
        console.log(
          "[EditFileModal] tagsToString: tags is empty/null/undefined"
        );
        return "";
      }
      if (Array.isArray(tags)) {
        const result = tags.join(", ");
        console.log(
          "[EditFileModal] tagsToString: tags is array, result:",
          result
        );
        return result;
      }
      if (typeof tags === "string") {
        // Try to parse as JSON first
        try {
          console.log(
            "[EditFileModal] tagsToString: attempting JSON.parse on:",
            tags
          );
          const parsed = JSON.parse(tags);
          console.log(
            "[EditFileModal] tagsToString: JSON.parse succeeded, parsed:",
            parsed
          );
          if (Array.isArray(parsed)) {
            const result = parsed.join(", ");
            console.log(
              "[EditFileModal] tagsToString: parsed is array, result:",
              result
            );
            return result;
          }
          console.log(
            "[EditFileModal] tagsToString: parsed is not array, returning original string"
          );
        } catch (err) {
          console.log(
            "[EditFileModal] tagsToString: JSON.parse failed, treating as comma-separated string. Error:",
            err
          );
          // Not JSON, treat as comma-separated string
        }
        // Already a comma-separated string or couldn't parse as JSON
        console.log(
          "[EditFileModal] tagsToString: returning string as-is:",
          tags
        );
        return tags;
      }
      console.log(
        "[EditFileModal] tagsToString: unknown type, returning empty string"
      );
      return "";
    },
    []
  );

  // Initialize state with safe defaults
  const [editedDisplayName, setEditedDisplayName] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [editedTags, setEditedTags] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clear errors and initialize form when modal opens or file changes
  useEffect(() => {
    if (isOpen && file) {
      console.log("[EditFileModal] useEffect: Initializing modal with file:", {
        file_key: file.file_key,
        file_name: file.file_name,
        display_name: file.display_name,
        description: file.description,
        tags: file.tags,
        tagsType: typeof file.tags,
        tagsIsArray: Array.isArray(file.tags),
      });
      try {
        const displayName = file.display_name || "";
        const description = file.description || "";
        const tagsString = tagsToString(file.tags);
        console.log("[EditFileModal] useEffect: Setting form values:", {
          displayName,
          description,
          tagsString,
        });
        setEditedDisplayName(displayName);
        setEditedDescription(description);
        setEditedTags(tagsString);
        setError(null); // Always clear errors when modal opens
        console.log("[EditFileModal] useEffect: Form initialized successfully");
      } catch (err) {
        console.error(
          "[EditFileModal] useEffect: Error initializing EditFileModal:",
          err
        );
        // Set safe defaults on error
        setEditedDisplayName(file.display_name || "");
        setEditedDescription(file.description || "");
        setEditedTags("");
        setError(null); // Don't show initialization errors to user
      }
    }
  }, [isOpen, file, tagsToString]);

  const handleSave = async () => {
    console.log("[EditFileModal] handleSave: Starting save operation");
    console.log("[EditFileModal] handleSave: Current form state:", {
      editedDisplayName,
      editedDescription,
      editedTags,
      file_key: file.file_key,
    });

    setIsUpdating(true);
    setError(null);

    try {
      const tagsArray = editedTags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      console.log(
        "[EditFileModal] handleSave: Processed tags array:",
        tagsArray
      );

      const requestBody = {
        display_name: editedDisplayName.trim() || undefined,
        description: editedDescription.trim(),
        tags: tagsArray,
      };

      console.log("[EditFileModal] handleSave: Request body:", requestBody);
      console.log(
        "[EditFileModal] handleSave: Request body JSON stringified:",
        JSON.stringify(requestBody)
      );

      const url = API_CONFIG.buildUrl(
        API_CONFIG.ENDPOINTS.LIBRARY.UPDATE_METADATA(file.file_key)
      );
      console.log("[EditFileModal] handleSave: Request URL:", url);

      // Get JWT from storage to ensure it's included in the request
      const jwt = AuthService.getStoredJwt();
      console.log(
        "[EditFileModal] handleSave: JWT from storage:",
        jwt ? "present" : "missing"
      );

      const { response, jwtExpired } = await authenticatedFetchWithExpiration(
        url,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
          jwt, // Explicitly pass JWT to ensure it's included
        }
      );

      console.log("[EditFileModal] handleSave: Response received:", {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        jwtExpired,
      });

      if (jwtExpired) {
        console.error("[EditFileModal] handleSave: JWT expired");
        throw new Error(ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
      }

      if (!response.ok) {
        const responseText = await response.text();
        console.error(
          "[EditFileModal] handleSave: Response not OK. Response text:",
          responseText
        );
        let errorData: { error?: string } = {};
        try {
          errorData = JSON.parse(responseText) as { error?: string };
          console.error(
            "[EditFileModal] handleSave: Parsed error data:",
            errorData
          );
        } catch (parseErr) {
          console.error(
            "[EditFileModal] handleSave: Failed to parse error response as JSON:",
            parseErr
          );
          errorData = {
            error: responseText || "Failed to update file metadata",
          };
        }
        throw new Error(errorData.error || "Failed to update file metadata");
      }

      const responseData = await response.json();
      console.log(
        "[EditFileModal] handleSave: Success response:",
        responseData
      );

      // Update the file object with new metadata
      // Convert tags array to JSON string to match FileMetadata type (tags is string in DB)
      // Preserve all original file fields (especially status) to avoid UI state issues
      const updatedFile = {
        ...file,
        display_name: editedDisplayName.trim() || undefined,
        description: editedDescription.trim(),
        tags: JSON.stringify(tagsArray), // Store as JSON string to match FileMetadata type
        // Explicitly preserve status and other important fields that shouldn't change
        status: file.status || "completed", // Preserve original status, default to completed if missing
      };

      console.log("[EditFileModal] handleSave: Calling onUpdate with:", {
        ...updatedFile,
        tags: tagsArray, // Log as array for readability
      });
      onUpdate(updatedFile);
      console.log(
        "[EditFileModal] handleSave: Save completed successfully, closing modal"
      );
      onClose();
    } catch (err) {
      console.error("[EditFileModal] handleSave: Error occurred:", err);
      console.error("[EditFileModal] handleSave: Error details:", {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      setError(err instanceof Error ? err.message : "Failed to update file");
    } finally {
      setIsUpdating(false);
      console.log("[EditFileModal] handleSave: Save operation finished");
    }
  };

  const handleCancel = () => {
    setEditedDisplayName(file.display_name || "");
    setEditedDescription(file.description || "");
    setEditedTags(tagsToString(file.tags));
    setError(null);
    onClose();
  };

  if (!file) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      cardStyle={STANDARD_MODAL_SIZE_OBJECT}
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

          {/* Display Name */}
          <FormField
            id={displayNameId}
            label="Display name"
            value={editedDisplayName}
            onValueChange={(value) => setEditedDisplayName(value)}
            placeholder="Enter a user-friendly display name..."
          />

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
