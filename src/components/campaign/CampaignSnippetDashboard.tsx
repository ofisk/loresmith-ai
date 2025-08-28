import type React from "react";
import { useState } from "react";
import { CampaignSnippetManager } from "./CampaignSnippetManager";
import { CampaignSnippetSearch } from "./CampaignSnippetSearch";

interface CampaignSnippetDashboardProps {
  campaignId: string;
}

type TabType = "staged" | "search";

export const CampaignSnippetDashboard: React.FC<
  CampaignSnippetDashboardProps
> = ({ campaignId }) => {
  const [activeTab, setActiveTab] = useState<TabType>("staged");

  const tabs = [
    {
      id: "staged" as TabType,
      label: "Staged Snippets",
      description: "Review and approve/reject generated snippets",
    },
    {
      id: "search" as TabType,
      label: "Search Approved",
      description: "Search through approved campaign snippets",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-2">Campaign Snippets</h2>
        <p className="text-gray-600">
          Manage and search campaign-specific content extracted from your files.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`
                py-2 px-1 border-b-2 font-medium text-sm
                ${
                  activeTab === tab.id
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === "staged" && (
          <CampaignSnippetManager
            campaignId={campaignId}
            onSnippetsUpdated={() => {
              // Could trigger a refresh of other components if needed
              console.log("Snippets updated");
            }}
          />
        )}

        {activeTab === "search" && (
          <CampaignSnippetSearch campaignId={campaignId} />
        )}
      </div>
    </div>
  );
};
