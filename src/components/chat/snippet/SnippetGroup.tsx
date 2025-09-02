import React from "react";
import { Card } from "../../card/Card";
import { SnippetItem } from "./SnippetItem";
import type { StagedSnippetGroup } from "../../../types/snippet";

interface SnippetGroupProps {
  group: StagedSnippetGroup;
  selectedSnippets: Set<string>;
  onSnippetSelection: (snippetId: string, checked: boolean) => void;
}

export const SnippetGroup: React.FC<SnippetGroupProps> = ({
  group,
  selectedSnippets,
  onSnippetSelection,
}) => {
  return (
    <Card className="p-4">
      <div className="mb-3">
        <h4 className="font-medium text-gray-900">
          From: {group.sourceRef.meta.fileName}
        </h4>
        <p className="text-sm text-gray-500">
          Generated: {new Date(group.created_at).toLocaleString()}
        </p>
      </div>

      <div className="space-y-3">
        {group.snippets.map((snippet) => (
          <SnippetItem
            key={snippet.id}
            snippet={{
              id: snippet.id,
              text: snippet.text,
              metadata: snippet.metadata,
            }}
            isSelected={selectedSnippets.has(snippet.id)}
            onSelectionChange={onSnippetSelection}
          />
        ))}
      </div>
    </Card>
  );
};
