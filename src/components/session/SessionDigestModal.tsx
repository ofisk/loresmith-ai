import { Modal } from "@/components/modal/Modal";
import type {
	SessionDigestData,
	SessionDigestWithData,
} from "@/types/session-digest";
import { SessionDigestForm } from "./SessionDigestForm";

interface SessionDigestModalProps {
	isOpen: boolean;
	onClose: () => void;
	campaignId: string;
	digest?: SessionDigestWithData | null;
	suggestedSessionNumber?: number;
	initialDigestData?: SessionDigestData | null;
	onSave?: () => void;
}

export function SessionDigestModal({
	isOpen,
	onClose,
	campaignId,
	digest,
	suggestedSessionNumber,
	initialDigestData,
	onSave,
}: SessionDigestModalProps) {
	const handleSave = () => {
		onSave?.();
		onClose();
	};

	return (
		<Modal isOpen={isOpen} onClose={onClose} className="modal-size-standard">
			<div className="p-6 overflow-y-auto max-h-[var(--height-scrollable-modal)]">
				<div className="mb-6">
					<h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
						{digest ? "Edit session digest" : "Create session digest"}
					</h2>
					<p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
						{digest
							? "Update your session recap and planning information"
							: "Document your session and plan for the next one"}
					</p>
				</div>
				<SessionDigestForm
					campaignId={campaignId}
					digest={digest}
					suggestedSessionNumber={suggestedSessionNumber}
					initialDigestData={initialDigestData}
					onSave={handleSave}
					onCancel={onClose}
				/>
			</div>
		</Modal>
	);
}
