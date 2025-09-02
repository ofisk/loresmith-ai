import React, { useState } from "react";
import type { StagedSnippetGroup } from "../../types/snippet";
import {
  SnippetHeader,
  SnippetActionBar,
  SnippetGroup,
  EmptyState,
} from "./snippet";

interface SnippetManagementUIProps {
  campaignId: string;
  snippets: StagedSnippetGroup[];
  total: number;
  status: string;
  action: string;
  resourceId?: string;
  snippetType?: string;
}

export const SnippetManagementUI: React.FC<SnippetManagementUIProps> = ({
  campaignId,
  snippets,
  total,
  action,
  resourceId,
  snippetType,
}) => {
  const [processing, setProcessing] = useState<string | null>(null);
  const [selectedSnippets, setSelectedSnippets] = useState<Set<string>>(
    new Set()
  );
  const [rejectionReason, setRejectionReason] = useState("");

  const handleSnippetSelection = (snippetId: string, checked: boolean) => {
    const newSelected = new Set(selectedSnippets);
    if (checked) {
      newSelected.add(snippetId);
    } else {
      newSelected.delete(snippetId);
    }
    setSelectedSnippets(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allSnippetIds = snippets.flatMap((group) =>
        group.snippets.map((snippet) => snippet.id)
      );
      setSelectedSnippets(new Set(allSnippetIds));
    } else {
      setSelectedSnippets(new Set());
    }
  };

  const handleApproveSelected = async () => {
    if (selectedSnippets.size === 0) return;

    setProcessing("approving");
    try {
      window.dispatchEvent(
        new CustomEvent("approve-snippets", {
          detail: {
            campaignId,
            snippetIds: Array.from(selectedSnippets),
            source: "chat-ui",
          },
        })
      );

      setSelectedSnippets(new Set());
    } catch (error) {
      console.error("Error approving snippets:", error);
    } finally {
      setProcessing(null);
    }
  };

  const handleRejectSelected = async () => {
    if (selectedSnippets.size === 0 || !rejectionReason.trim()) return;

    setProcessing("rejecting");
    try {
      // This would call the rejectSnippets tool through the AI agent
      window.dispatchEvent(
        new CustomEvent("reject-snippets", {
          detail: {
            campaignId,
            snippetIds: Array.from(selectedSnippets),
            reason: rejectionReason,
            source: "chat-ui",
          },
        })
      );

      setSelectedSnippets(new Set());
      setRejectionReason("");
    } catch (error) {
      console.error("Error rejecting snippets:", error);
    } finally {
      setProcessing(null);
    }
  };

  if (snippets.length === 0) {
    return <EmptyState action={action} />;
  }

  return (
    <div className="space-y-4 border border-gray-200 rounded-lg p-4 bg-white">
      <SnippetHeader
        action={action}
        total={total}
        campaignId={campaignId}
        resourceId={resourceId}
        snippetType={snippetType}
        selectedCount={selectedSnippets.size}
        totalSnippets={snippets.flatMap((g) => g.snippets).length}
        onSelectAll={handleSelectAll}
      />

      <SnippetActionBar
        selectedCount={selectedSnippets.size}
        processing={processing}
        action={action}
        rejectionReason={rejectionReason}
        onRejectionReasonChange={setRejectionReason}
        onApprove={handleApproveSelected}
        onReject={handleRejectSelected}
      />

      <div className="space-y-4">
        {snippets.map((group) => (
          <SnippetGroup
            key={group.key}
            group={group}
            selectedSnippets={selectedSnippets}
            onSnippetSelection={handleSnippetSelection}
          />
        ))}
      </div>
    </div>
  );
};
