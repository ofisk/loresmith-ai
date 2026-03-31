import { useEffect, useState } from "react";
import { Button } from "@/components/button/Button";
import { FormField } from "@/components/input/FormField";

interface CreateCampaignModalProps {
	isOpen: boolean;
	onClose: () => void;
	campaignName: string;
	onCampaignNameChange: (name: string) => void;
	campaignDescription: string;
	onCampaignDescriptionChange: (description: string) => void;
	onCreateCampaign: (name: string, description: string) => Promise<void>;
	/** Called after successful creation; can open Add Resource modal */
	onSuggestAddResource?: () => void;
}

export function CreateCampaignModal({
	isOpen,
	onClose,
	campaignName,
	onCampaignNameChange,
	campaignDescription,
	onCampaignDescriptionChange,
	onCreateCampaign,
	onSuggestAddResource,
}: CreateCampaignModalProps) {
	const [name, setName] = useState(campaignName);
	const [description, setDescription] = useState(campaignDescription);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [createdSuccessfully, setCreatedSuccessfully] = useState(false);

	// Sync with parent state when modal opens
	useEffect(() => {
		if (isOpen) {
			setName(campaignName);
			setDescription(campaignDescription);
			setCreatedSuccessfully(false);
		}
	}, [isOpen, campaignName, campaignDescription]);

	const handleCreate = async () => {
		if (!name.trim() || isSubmitting) return;
		setIsSubmitting(true);
		onCampaignNameChange(name);
		onCampaignDescriptionChange(description);

		try {
			await onCreateCampaign(name, description);
			setCreatedSuccessfully(true);
		} catch (_error) {
			// Keep modal open on error
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleDone = () => {
		setCreatedSuccessfully(false);
		onClose();
	};

	const handleAddResource = () => {
		setCreatedSuccessfully(false);
		onClose();
		onSuggestAddResource?.();
	};

	const campaignNameId = "campaign-name";
	const campaignDescriptionId = "campaign-description";

	if (createdSuccessfully) {
		return (
			<div className="p-4 md:p-6 h-full flex flex-col min-h-0">
				<div className="mb-4 md:mb-6">
					<h2
						id="create-campaign-modal-title"
						className="text-xl font-semibold text-gray-900 dark:text-gray-100"
					>
						Campaign created
					</h2>
					<p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
						Your adventure awaits. Add your first resource to get started.
					</p>
				</div>
				<div className="flex-1" />
				<div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
					{onSuggestAddResource && (
						<Button
							appearance="form"
							variant="primary"
							onClick={handleAddResource}
							data-testid="create-campaign-add-resource"
						>
							Add your first resource
						</Button>
					)}
					<Button
						appearance="form"
						onClick={handleDone}
						variant="secondary"
						data-testid="create-campaign-done"
					>
						Done
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="p-4 md:p-6 h-full flex flex-col min-h-0">
			{/* Header */}
			<div className="mb-4 md:mb-6">
				<h2
					id="create-campaign-modal-title"
					className="text-xl font-semibold text-neutral-900 dark:text-neutral-100"
				>
					Create new campaign
				</h2>
				<p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
					Forge a new adventure and gather your party
				</p>
			</div>

			{/* Campaign Info */}
			<div className="space-y-4 flex-1 min-h-0 overflow-y-auto pr-1">
				<FormField
					id={campaignNameId}
					label="Campaign name"
					required
					placeholder="Name your legendary adventure..."
					value={name}
					onValueChange={(value) => setName(value)}
				/>
				<FormField
					id={campaignDescriptionId}
					label="Description (optional)"
					placeholder="Describe the world, its mysteries, and the heroes who will shape its destiny..."
					value={description}
					onValueChange={(value) => setDescription(value)}
					multiline
					rows={4}
				/>
			</div>

			{/* Actions */}
			<div className="flex items-center justify-between mt-4 md:mt-8 pt-4 md:pt-6 border-t border-neutral-200 dark:border-neutral-700">
				<div className="flex items-center gap-2">
					<Button
						appearance="form"
						variant="primary"
						onClick={handleCreate}
						disabled={!name.trim() || isSubmitting}
						loading={isSubmitting}
						data-testid="create-campaign-submit"
					>
						{isSubmitting ? "Creating…" : "Create"}
					</Button>
					<Button appearance="form" onClick={onClose} variant="secondary">
						Cancel
					</Button>
				</div>
			</div>
		</div>
	);
}
