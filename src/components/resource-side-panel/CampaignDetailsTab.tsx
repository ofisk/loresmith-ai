import { FormField } from "@/components/input/FormField";
import type { Campaign } from "@/types/campaign";

interface CampaignDetailsTabProps {
	campaign: Campaign;
	isEditing: boolean;
	editedName: string;
	editedDescription: string;
	nameId: string;
	descriptionId: string;
	onNameChange: (value: string) => void;
	onDescriptionChange: (value: string) => void;
}

/**
 * Details tab content: campaign name, description, and metadata.
 * Edit/save/cancel and view graph actions stay in the modal footer.
 */
export function CampaignDetailsTab({
	campaign,
	isEditing,
	editedName,
	editedDescription,
	nameId,
	descriptionId,
	onNameChange,
	onDescriptionChange,
}: CampaignDetailsTabProps) {
	return (
		<div className="space-y-4">
			{isEditing ? (
				<FormField
					id={nameId}
					label="Campaign name"
					value={editedName}
					onValueChange={onNameChange}
					placeholder="Enter campaign name"
				/>
			) : (
				<div>
					<div className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
						Campaign name
					</div>
					<div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
						<p className="text-neutral-900 dark:text-neutral-100">
							{campaign.name}
						</p>
					</div>
				</div>
			)}

			{isEditing ? (
				<FormField
					id={descriptionId}
					label="Description"
					value={editedDescription}
					onValueChange={onDescriptionChange}
					placeholder="Enter campaign description"
					multiline
					rows={4}
				/>
			) : (
				<div>
					<div className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
						Description
					</div>
					<div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg min-h-[var(--height-editor-min)]">
						<p className="text-neutral-900 dark:text-neutral-100">
							{campaign.description || "No description provided"}
						</p>
					</div>
				</div>
			)}

			<div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
				<div className="min-w-0">
					<span className="font-medium">Created:</span>{" "}
					{new Date(campaign.createdAt).toLocaleDateString()}
				</div>
				<div className="sm:text-right break-all">
					<span className="font-medium">ID:</span> {campaign.campaignId}
				</div>
			</div>
		</div>
	);
}
