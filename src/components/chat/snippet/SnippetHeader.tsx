import React from "react";

interface SnippetHeaderProps {
  action: string;
  total: number;
  campaignId: string;
  resourceId?: string;
  snippetType?: string;
  selectedCount: number;
  totalSnippets: number;
  onSelectAll: (checked: boolean) => void;
}

export const SnippetHeader: React.FC<SnippetHeaderProps> = ({
  action,
  total,
  campaignId,
  resourceId,
  snippetType,
  selectedCount,
  totalSnippets,
  onSelectAll,
}) => {
  return (
    <div className="flex justify-between items-center">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">
          Snippet Management -{" "}
          {action.replace("show_", "").replace("_", " ").toUpperCase()}
        </h3>
        <p className="text-sm text-gray-600">
          Found {total} snippets for campaign {campaignId}
          {resourceId && ` • Resource: ${resourceId}`}
          {snippetType && ` • Type: ${snippetType}`}
        </p>
      </div>

      <div className="flex items-center space-x-2">
        <label className="flex items-center space-x-2 text-sm">
          <input
            type="checkbox"
            checked={selectedCount === totalSnippets}
            onChange={(e) => onSelectAll(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span>Select All</span>
        </label>
      </div>
    </div>
  );
};
