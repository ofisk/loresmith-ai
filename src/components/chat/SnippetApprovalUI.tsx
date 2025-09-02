import React, { useState } from "react";
import type { SnippetCandidate } from "../../types/snippet";
import {
  SnippetItem,
  SnippetApprovalActionBar,
  SnippetApprovalHeader,
} from "./snippet";

interface SnippetApprovalUIProps {
  campaignId: string;
  snippets: SnippetCandidate[];
  snippetIds: string[];
  reason?: string;
  total: number;
}

export const SnippetApprovalUI: React.FC<SnippetApprovalUIProps> = ({
  campaignId,
  snippets,
  snippetIds,
  reason,
  total,
}) => {
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const handleApproveAll = async () => {
    setProcessing("approving");
    try {
      window.dispatchEvent(
        new CustomEvent("approve-snippets", {
          detail: {
            campaignId,
            snippetIds,
            source: "chat-ui",
            reason,
          },
        })
      );
    } catch (error) {
      console.error("Error approving snippets:", error);
    } finally {
      setProcessing(null);
    }
  };

  const handleRejectAll = async () => {
    if (!rejectionReason.trim()) return;

    setProcessing("rejecting");
    try {
      // This would call the rejectSnippets tool through the AI agent
      window.dispatchEvent(
        new CustomEvent("reject-snippets", {
          detail: {
            campaignId,
            snippetIds,
            reason: rejectionReason,
            source: "chat-ui",
          },
        })
      );
    } catch (error) {
      console.error("Error rejecting snippets:", error);
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="space-y-4 border border-gray-200 rounded-lg p-4 bg-white">
      <SnippetApprovalHeader
        campaignId={campaignId}
        total={total}
        reason={reason}
      />

      <SnippetApprovalActionBar
        total={total}
        processing={processing}
        rejectionReason={rejectionReason}
        onRejectionReasonChange={setRejectionReason}
        onApprove={handleApproveAll}
        onReject={handleRejectAll}
      />

      <div className="space-y-3">
        {snippets.map((snippet) => (
          <SnippetItem
            key={snippet.id}
            snippet={{
              id: snippet.id,
              text: snippet.text,
              metadata: snippet.metadata,
            }}
            isSelected={false}
            onSelectionChange={() => {}} // No selection needed in approval UI
          />
        ))}
      </div>
    </div>
  );
};
