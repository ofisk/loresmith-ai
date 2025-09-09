import React from "react";

interface EmptyStateProps {
  action: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ action }) => {
  const getMessage = () => {
    switch (action) {
      case "show_staged":
        return "All staged shards have been processed.";
      case "show_approved":
        return "No approved shards found.";
      case "show_rejected":
        return "No rejected shards found.";
      default:
        return "No shards found for the specified criteria.";
    }
  };

  return (
    <div className="p-4 text-center text-gray-500 border border-gray-200 rounded-lg">
      <p>No shards found for the specified criteria.</p>
      <p className="text-sm mt-1">{getMessage()}</p>
    </div>
  );
};
