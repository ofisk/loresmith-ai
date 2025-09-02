import React from "react";

interface SnippetItemProps {
  snippet: {
    id: string;
    text: string;
    metadata: {
      entityType: string;
      confidence: number;
      query?: string;
    };
  };
  isSelected: boolean;
  onSelectionChange: (snippetId: string, checked: boolean) => void;
}

export const SnippetItem: React.FC<SnippetItemProps> = ({
  snippet,
  isSelected,
  onSelectionChange,
}) => {
  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <div className="flex items-start space-x-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelectionChange(snippet.id, e.target.checked)}
          className="mt-1 rounded border-gray-300"
        />

        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {snippet.metadata.entityType}
            </span>
            <span className="text-sm text-gray-500">
              Confidence: {Math.round(snippet.metadata.confidence * 100)}%
            </span>
          </div>

          <p className="text-gray-700 whitespace-pre-wrap text-sm">
            {snippet.text}
          </p>

          {snippet.metadata.query && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
                View Query
              </summary>
              <p className="mt-1 p-2 bg-gray-50 rounded text-xs">
                {snippet.metadata.query}
              </p>
            </details>
          )}
        </div>
      </div>
    </div>
  );
};
