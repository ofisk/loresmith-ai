import type React from "react";
import { useState } from "react";
import { Button } from "../button/Button";
import { Card } from "../card/Card";
import { CampaignSnippetDashboard } from "./CampaignSnippetDashboard";

interface CampaignPageProps {
  campaignId: string;
  campaignName?: string;
}

export const CampaignPage: React.FC<CampaignPageProps> = ({
  campaignId,
  campaignName = "Campaign",
}) => {
  const [showSnippets, setShowSnippets] = useState(false);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">{campaignName}</h1>
        <Button onClick={() => setShowSnippets(!showSnippets)}>
          {showSnippets ? "Hide Snippets" : "Manage Snippets"}
        </Button>
      </div>

      {showSnippets && (
        <Card className="p-6">
          <CampaignSnippetDashboard campaignId={campaignId} />
        </Card>
      )}
    </div>
  );
};
