import { useMemo, useState } from "react";
import { PrimaryActionButton } from "@/components/button";
import { Modal } from "@/components/modal/Modal";

export interface PlayerCharacterOption {
	id: string;
	name: string;
	entityType?: string;
	content?: unknown;
	metadata?: unknown;
}

interface PlayerCharacterSelectionPanelProps {
	title: string;
	description?: string;
	options: PlayerCharacterOption[];
	submitLabel?: string;
	skipLabel?: string;
	canCreateNew?: boolean;
	createNewLabel?: string;
	onSkip?: () => void;
	isSubmitting?: boolean;
	error?: string | null;
	onSubmit: (entityId: string) => Promise<void>;
	onCreateNew?: (name?: string) => Promise<void>;
}

export function PlayerCharacterSelectionPanel({
	title,
	description,
	options,
	submitLabel = "Save character",
	skipLabel = "Skip for now",
	canCreateNew = false,
	createNewLabel = "Create new",
	onSkip,
	isSubmitting = false,
	error = null,
	onSubmit,
	onCreateNew,
}: PlayerCharacterSelectionPanelProps) {
	const [selectedEntityId, setSelectedEntityId] = useState<string>("");
	const [localError, setLocalError] = useState<string | null>(null);
	const [newCharacterName, setNewCharacterName] = useState("");

	const availableOptions = useMemo(
		() => [...options].sort((a, b) => a.name.localeCompare(b.name)),
		[options]
	);

	const handleSubmit = async () => {
		if (!selectedEntityId) {
			setLocalError("Choose your character before continuing.");
			return;
		}
		setLocalError(null);
		await onSubmit(selectedEntityId);
	};

	const handleCreateNew = async () => {
		if (!onCreateNew) return;
		setLocalError(null);
		const trimmedName = newCharacterName.trim();
		await onCreateNew(trimmedName.length > 0 ? trimmedName : undefined);
	};

	return (
		<div className="space-y-4">
			<div>
				<h2 className="text-lg font-semibold text-neutral-100">{title}</h2>
				{description && (
					<p className="mt-1 text-sm text-neutral-400">{description}</p>
				)}
			</div>

			{error && (
				<div className="rounded border border-red-700/50 bg-red-900/20 p-3 text-sm text-red-200">
					{error}
				</div>
			)}
			{localError && (
				<div className="rounded border border-red-700/50 bg-red-900/20 p-3 text-sm text-red-200">
					{localError}
				</div>
			)}

			{canCreateNew && onCreateNew ? (
				<div className="space-y-2 rounded border border-neutral-700 bg-neutral-900/60 p-3">
					<label
						htmlFor="new-character-name"
						className="block text-sm font-medium text-neutral-200"
					>
						New character name (optional)
					</label>
					<input
						id="new-character-name"
						type="text"
						value={newCharacterName}
						onChange={(event) => setNewCharacterName(event.target.value)}
						placeholder="New character"
						className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500"
					/>
					<p className="text-xs text-neutral-500">
						Create a blank character sheet and finish building it in chat.
					</p>
				</div>
			) : null}

			<div className="max-h-[60vh] space-y-2 overflow-y-auto rounded border border-neutral-700 bg-neutral-900/60 p-2">
				{availableOptions.length === 0 ? (
					<div className="p-3 text-sm text-neutral-400">
						{canCreateNew
							? "No prebuilt characters are available yet. Create a new character to get started."
							: "No unclaimed player characters are available yet. Ask your GM to add or assign one."}
					</div>
				) : (
					availableOptions.map((option) => (
						<button
							key={option.id}
							type="button"
							onClick={() => {
								setSelectedEntityId(option.id);
								setLocalError(null);
							}}
							className={`w-full rounded border px-3 py-2 text-left transition-colors ${
								selectedEntityId === option.id
									? "border-neutral-500 bg-neutral-800 text-neutral-100"
									: "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
							}`}
						>
							<div className="text-sm font-medium">{option.name}</div>
							<div className="text-xs text-neutral-400">{option.id}</div>
						</button>
					))
				)}
			</div>

			<div className="flex flex-wrap items-center justify-end gap-2">
				{onSkip && (
					<button
						type="button"
						onClick={onSkip}
						className="rounded border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
					>
						{skipLabel}
					</button>
				)}
				{canCreateNew && onCreateNew ? (
					<button
						type="button"
						onClick={() => void handleCreateNew()}
						disabled={isSubmitting}
						className="rounded border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
					>
						{isSubmitting ? "Creating..." : createNewLabel}
					</button>
				) : null}
				<PrimaryActionButton
					onClick={handleSubmit}
					disabled={
						isSubmitting || (availableOptions.length === 0 && !canCreateNew)
					}
				>
					{isSubmitting ? "Saving..." : submitLabel}
				</PrimaryActionButton>
			</div>
		</div>
	);
}

interface PlayerCharacterSelectionModalProps {
	isOpen: boolean;
	campaignName?: string | null;
	options: PlayerCharacterOption[];
	isSubmitting?: boolean;
	error?: string | null;
	allowSkip?: boolean;
	canCreateNew?: boolean;
	onSkip?: () => void;
	onSubmit: (entityId: string) => Promise<void>;
	onCreateNew?: (name?: string) => Promise<void>;
}

export function PlayerCharacterSelectionModal({
	isOpen,
	campaignName,
	options,
	isSubmitting = false,
	error = null,
	allowSkip = false,
	canCreateNew = false,
	onSkip,
	onSubmit,
	onCreateNew,
}: PlayerCharacterSelectionModalProps) {
	return (
		<Modal
			isOpen={isOpen}
			onClose={() => onSkip?.()}
			className="modal-size-sm"
			options={{
				showCloseButton: allowSkip,
				clickOutsideToClose: allowSkip,
				allowEscape: allowSkip,
			}}
		>
			<div className="p-6">
				<PlayerCharacterSelectionPanel
					title="Choose your character"
					description={
						campaignName
							? `Select the character you are playing in "${campaignName}", or create a new one.`
							: "Select the character you are playing in this campaign, or create a new one."
					}
					options={options}
					submitLabel="Continue to campaign"
					canCreateNew={canCreateNew}
					onSkip={allowSkip ? onSkip : undefined}
					isSubmitting={isSubmitting}
					error={error}
					onSubmit={onSubmit}
					onCreateNew={onCreateNew}
				/>
			</div>
		</Modal>
	);
}
