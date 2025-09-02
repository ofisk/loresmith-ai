import React from "react";

interface SnippetApprovalHeaderProps {
  campaignId: string;
  total: number;
  reason?: string;
}

export const SnippetApprovalHeader: React.FC<SnippetApprovalHeaderProps> = ({
  campaignId,
  total,
  reason,
}) => {
  return (
    <div className="text-center">
      <h3 className="text-lg font-semibold text-gray-900">
        Snippet Approval Interface
      </h3>
      <p className="text-sm text-gray-600">
        Ready to process {total} snippets for campaign {campaignId}
      </p>
      {reason && (
        <p className="text-sm text-blue-600 mt-1">Context: {reason}</p>
      )}
    </div>
  );
};
