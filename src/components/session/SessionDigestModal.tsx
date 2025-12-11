import { Modal } from "@/components/modal/Modal";
import { SessionDigestForm } from "./SessionDigestForm";
import type { SessionDigestWithData } from "@/types/session-digest";

import type { SessionDigestData } from "@/types/session-digest";

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      cardStyle={{ width: "900px", maxWidth: "95vw", maxHeight: "90vh" }}
      showCloseButton={true}
    >
      <div className="p-6 overflow-y-auto max-h-[calc(90vh-3rem)]">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {digest ? "Edit session digest" : "Create session digest"}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
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
