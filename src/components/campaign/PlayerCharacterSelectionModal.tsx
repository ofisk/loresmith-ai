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

type SelectionStep = "choose" | "claim" | "create";

function getInitialStep(
	canCreateNew: boolean,
	hasClaimOptions: boolean
): SelectionStep {
	if (canCreateNew && !hasClaimOptions) {
		return "create";
	}
	if (!canCreateNew && hasClaimOptions) {
		return "claim";
	}
	if (canCreateNew && hasClaimOptions) {
		return "choose";
	}
	return "claim";
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
	const hasClaimOptions = options.length > 0;
	const showChooseStep = canCreateNew && hasClaimOptions;
	const [step, setStep] = useState<SelectionStep>(() =>
		getInitialStep(canCreateNew, hasClaimOptions)
	);
	const [selectedEntityId, setSelectedEntityId] = useState<string>("");
	const [localError, setLocalError] = useState<string | null>(null);
	const [newCharacterName, setNewCharacterName] = useState("");

	const availableOptions = useMemo(
		() => [...options].sort((a, b) => a.name.localeCompare(b.name)),
		[options]
	);

	const handleSubmitClaim = async () => {
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

	const stepDescription =
		step === "choose"
			? "Choose how you want to join this campaign."
			: step === "create"
				? "Pick any starting name to get going — you can change your character's name anytime while building the sheet in chat."
				: description;

	return (
		<div className="space-y-4">
			<div>
				<h2 className="text-lg font-semibold text-neutral-100">{title}</h2>
				{stepDescription && (
					<p className="mt-1 text-sm text-neutral-400">{stepDescription}</p>
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

			{step === "choose" && showChooseStep ? (
				<div className="grid gap-3 sm:grid-cols-2">
					<button
						type="button"
						onClick={() => {
							setStep("claim");
							setLocalError(null);
						}}
						className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-4 text-left transition-colors hover:border-neutral-500 hover:bg-neutral-800"
					>
						<div className="text-sm font-medium text-neutral-100">
							Claim existing character
						</div>
						<p className="mt-1 text-xs text-neutral-400">
							Select a prebuilt character your GM added to the campaign.
						</p>
					</button>
					<button
						type="button"
						onClick={() => {
							setStep("create");
							setLocalError(null);
						}}
						className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-4 text-left transition-colors hover:border-neutral-500 hover:bg-neutral-800"
					>
						<div className="text-sm font-medium text-neutral-100">
							Create new character
						</div>
						<p className="mt-1 text-xs text-neutral-400">
							Start with a blank sheet. Use any placeholder name — you can
							change it anytime in chat.
						</p>
					</button>
				</div>
			) : null}

			{step === "create" && canCreateNew && onCreateNew ? (
				<div className="space-y-3 rounded border border-neutral-700 bg-neutral-900/60 p-3">
					<label
						htmlFor="new-character-name"
						className="block text-sm font-medium text-neutral-200"
					>
						Starting name (optional)
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
						This is only to get started. You can rename your character anytime
						while building the sheet in chat — a temporary name is perfectly
						fine.
					</p>
				</div>
			) : null}

			{step === "claim" ? (
				<div className="max-h-[60vh] space-y-2 overflow-y-auto rounded border border-neutral-700 bg-neutral-900/60 p-2">
					{availableOptions.length === 0 ? (
						<div className="p-3 text-sm text-neutral-400">
							No unclaimed player characters are available yet. Ask your GM to
							add or assign one.
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
			) : null}

			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					{showChooseStep && step !== "choose" ? (
						<button
							type="button"
							onClick={() => {
								setStep("choose");
								setLocalError(null);
							}}
							className="rounded border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
						>
							Back
						</button>
					) : null}
				</div>
				<div className="flex flex-wrap items-center justify-end gap-2">
					{onSkip && step === "choose" ? (
						<button
							type="button"
							onClick={onSkip}
							className="rounded border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
						>
							{skipLabel}
						</button>
					) : null}
					{step === "create" && canCreateNew && onCreateNew ? (
						<PrimaryActionButton
							onClick={() => void handleCreateNew()}
							disabled={isSubmitting}
						>
							{isSubmitting ? "Creating..." : createNewLabel}
						</PrimaryActionButton>
					) : null}
					{step === "claim" ? (
						<PrimaryActionButton
							onClick={handleSubmitClaim}
							disabled={isSubmitting || availableOptions.length === 0}
						>
							{isSubmitting ? "Saving..." : submitLabel}
						</PrimaryActionButton>
					) : null}
				</div>
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
	const hasClaimOptions = options.length > 0;
	const showChooseStep = canCreateNew && hasClaimOptions;

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
						showChooseStep
							? campaignName
								? `Join "${campaignName}" by claiming a prebuilt character or creating your own.`
								: "Claim a prebuilt character or create your own."
							: campaignName
								? `Select your character for "${campaignName}" before entering the campaign.`
								: "Select your character before entering the campaign."
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
