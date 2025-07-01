import { useState } from "react";
import { CampaignList } from "./CampaignList";
import { CampaignDetail } from "./CampaignDetail";
import { CreateCampaignModal } from "./CreateCampaignModal";
import { AddResourceModal } from "./AddResourceModal";

type View = "list" | "detail";

export function CampaignPage() {
  const [currentView, setCurrentView] = useState<View>("list");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(
    null
  );
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddResourceModal, setShowAddResourceModal] = useState(false);

  const handleViewCampaign = (campaignId: string) => {
    setSelectedCampaignId(campaignId);
    setCurrentView("detail");
  };

  const handleCreateCampaign = () => {
    setShowCreateModal(true);
  };

  const handleCampaignCreated = (campaignId: string) => {
    setSelectedCampaignId(campaignId);
    setCurrentView("detail");
    setShowCreateModal(false);
  };

  const handleBackToList = () => {
    setCurrentView("list");
    setSelectedCampaignId(null);
  };

  const handleAddResource = () => {
    setShowAddResourceModal(true);
  };

  const handleResourceAdded = () => {
    setShowAddResourceModal(false);
    // The CampaignDetail component will refresh automatically
  };

  if (currentView === "detail" && selectedCampaignId) {
    return (
      <div className="container mx-auto p-6">
        <CampaignDetail
          campaignId={selectedCampaignId}
          onBack={handleBackToList}
          onAddResource={handleAddResource}
        />
        <AddResourceModal
          isOpen={showAddResourceModal}
          onClose={() => setShowAddResourceModal(false)}
          onAddResource={handleResourceAdded}
          campaignId={selectedCampaignId}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <CampaignList
        onViewCampaign={handleViewCampaign}
        onCreateCampaign={handleCreateCampaign}
      />
      <CreateCampaignModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCampaignCreated={handleCampaignCreated}
      />
    </div>
  );
}
