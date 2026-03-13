import { FloppyDisk } from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useState } from "react";
import { ERROR_MESSAGES } from "@/app-constants";
import { FormButton } from "@/components/button/FormButton";
import { FormField } from "@/components/input/FormField";
import { Modal } from "@/components/modal/Modal";
import {
	AuthService,
	authenticatedFetchWithExpiration,
} from "@/services/core/auth-service";
import { API_CONFIG } from "@/shared-config";

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
			if (!tags) {
				return "";
			}
			if (Array.isArray(tags)) {
				const result = tags.join(", ");
				return result;
			}
			if (typeof tags === "string") {
				// Try to parse as JSON first
				try {
					const parsed = JSON.parse(tags);
					if (Array.isArray(parsed)) {
						const result = parsed.join(", ");
						return result;
					}
				} catch (_err) {
					// Not JSON, treat as comma-separated string
				}
				return tags;
			}
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
			try {
				const displayName = file.display_name || "";
				const description = file.description || "";
				const tagsString = tagsToString(file.tags);
				setEditedDisplayName(displayName);
				setEditedDescription(description);
				setEditedTags(tagsString);
				setError(null); // Always clear errors when modal opens
			} catch (_err) {
				// Set safe defaults on error
				setEditedDisplayName(file.display_name || "");
				setEditedDescription(file.description || "");
				setEditedTags("");
				setError(null); // Don't show initialization errors to user
			}
		}
	}, [isOpen, file, tagsToString]);

	const handleSave = async () => {
		setIsUpdating(true);
		setError(null);

		try {
			const tagsArray = editedTags
				.split(",")
				.map((tag) => tag.trim())
				.filter((tag) => tag.length > 0);

			const requestBody = {
				display_name: editedDisplayName.trim() || undefined,
				description: editedDescription.trim(),
				tags: tagsArray,
			};

			const url = API_CONFIG.buildUrl(
				API_CONFIG.ENDPOINTS.LIBRARY.UPDATE_METADATA(file.file_key)
			);

			// Get JWT from storage to ensure it's included in the request
			const jwt = AuthService.getStoredJwt();

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

			if (jwtExpired) {
				throw new Error(ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
			}

			if (!response.ok) {
				const responseText = await response.text();
				let errorData: { error?: string } = {};
				try {
					errorData = JSON.parse(responseText) as { error?: string };
				} catch (_parseErr) {
					errorData = {
						error: responseText || "Failed to update file metadata",
					};
				}
				throw new Error(errorData.error || "Failed to update file metadata");
			}

			await response.json();

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
			onUpdate(updatedFile);
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to update file");
		} finally {
			setIsUpdating(false);
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
			className="w-[96vw] max-w-[720px] h-[calc(100dvh-1rem)] md:h-[80dvh] md:max-h-[760px]"
		>
			<div className="p-4 md:p-6 h-full flex flex-col min-h-0">
				{/* Header */}
				<div className="mb-4 md:mb-6">
					<h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
						Edit file details
					</h2>
				</div>

				{/* File Info */}
				<div className="space-y-4 flex-1 min-h-0 overflow-y-auto pr-1">
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
				<div className="flex items-center justify-between mt-4 md:mt-8 pt-4 md:pt-6 border-t border-gray-200 dark:border-gray-700">
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
