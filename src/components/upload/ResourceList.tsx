import { useResourceManagement } from "../../hooks/useResourceManagement";
import { ResourceItem } from "./ResourceItem";
import { AddToCampaignModal } from "./AddToCampaignModal";
import { Button } from "../button/Button";

interface ResourceListProps {
  refreshTrigger?: number;
}

export function ResourceList({
  refreshTrigger: _refreshTrigger,
}: ResourceListProps) {
  const {
    files,
    campaigns,
    loading,
    error,
    selectedFile,
    isAddToCampaignModalOpen,
    selectedCampaigns,
    addingToCampaigns,
    expandedFiles,
    fetchResources,
    handleAddToCampaigns,
    toggleFileExpansion,
    openAddToCampaignModal,
    closeAddToCampaignModal,
    setSelectedCampaigns,
  } = useResourceManagement();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-gray-500">Loading resources...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-500 mb-2">{error}</div>
        <Button
          onClick={fetchResources}
          variant="secondary"
          size="sm"
          className="mx-auto"
        >
          Retry
        </Button>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-500 mb-2">The shelves lie bare</div>
        <p className="text-sm text-gray-400">
          Place a scroll upon the archive to awaken it
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-3">
        {files.map((file) => (
          <ResourceItem
            key={file.file_key}
            file={file}
            isExpanded={expandedFiles.has(file.file_key)}
            onToggleExpansion={toggleFileExpansion}
            onAddToCampaign={openAddToCampaignModal}
          />
        ))}
      </div>

      <AddToCampaignModal
        isOpen={isAddToCampaignModalOpen}
        selectedFile={selectedFile}
        campaigns={campaigns}
        selectedCampaigns={selectedCampaigns}
        onSelectionChange={setSelectedCampaigns}
        onAdd={handleAddToCampaigns}
        onClose={closeAddToCampaignModal}
        addingToCampaigns={addingToCampaigns}
      />
    </div>
  );
}
