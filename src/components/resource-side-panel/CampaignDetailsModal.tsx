import { FloppyDisk, PencilSimple } from "@phosphor-icons/react";
import { CampaignDetailsTab } from "./CampaignDetailsTab";
import { CampaignDigestsTab } from "./CampaignDigestsTab";
import { CampaignResourcesTab } from "./CampaignResourcesTab";
import { ConfirmDeleteButton } from "./ConfirmDeleteButton";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FormButton } from "@/components/button/FormButton";
import { GraphVisualizationModal } from "@/components/graph/GraphVisualizationModal";
import { Modal } from "@/components/modal/Modal";
import { SessionDigestBulkImport } from "@/components/session/SessionDigestBulkImport";
import { SessionDigestModal } from "@/components/session/SessionDigestModal";
import { STANDARD_MODAL_SIZE_OBJECT } from "@/constants/modal-sizes";
import { useAuthenticatedRequest } from "@/hooks/useAuthenticatedRequest";
import { useBaseAsync } from "@/hooks/useBaseAsync";
import { useResourceFiles } from "@/hooks/useResourceFiles";
import { useSessionDigests } from "@/hooks/useSessionDigests";
import { APP_EVENT_TYPE } from "@/lib/app-events";
import { getDisplayName } from "@/lib/display-name-utils";
import { API_CONFIG } from "@/shared-config";
import type { Campaign, CampaignResource } from "@/types/campaign";
import type {
  SessionDigestData,
  SessionDigestWithData,
} from "@/types/session-digest";

interface CampaignDetailsModalProps {
  campaign: Campaign | null;
  isOpen: boolean;
  onClose: () => void;
  onDelete: (campaignId: string) => Promise<void>;
  onUpdate: (
    campaignId: string,
    updates: { name?: string; description?: string }
  ) => Promise<void>;
  _isLoading?: boolean;
  onAddFileToCampaign?: (fileKey: string, fileName: string) => Promise<void>;
}

export function CampaignDetailsModal({
  campaign,
  isOpen,
  onClose,
  onDelete,
  onUpdate,
  _isLoading = false,
  onAddFileToCampaign,
}: CampaignDetailsModalProps) {
  const nameId = useId();
  const descriptionId = useId();
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(campaign?.name || "");
  const [editedDescription, setEditedDescription] = useState(
    campaign?.description || ""
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "details" | "digests" | "resources"
  >("details");
  const [isDigestModalOpen, setIsDigestModalOpen] = useState(false);
  const [editingDigest, setEditingDigest] =
    useState<SessionDigestWithData | null>(null);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [bulkImportData, setBulkImportData] =
    useState<SessionDigestData | null>(null);
  const [resources, setResources] = useState<CampaignResource[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [resourcesError, setResourcesError] = useState<string | null>(null);
  const [retryingResourceId, setRetryingResourceId] = useState<string | null>(
    null
  );
  // Track resources that are currently being processed (in queue)
  const [processingResources, setProcessingResources] = useState<Set<string>>(
    new Set()
  );
  // Track expanded resources
  const [expandedResources, setExpandedResources] = useState<Set<string>>(
    new Set()
  );
  // Track add resource modal
  const [isAddResourceModalOpen, setIsAddResourceModalOpen] = useState(false);
  const [selectedResourceKeys, setSelectedResourceKeys] = useState<Set<string>>(
    new Set()
  );
  const [isAddingResources, setIsAddingResources] = useState(false);
  // Track graph visualization modal
  const [isGraphModalOpen, setIsGraphModalOpen] = useState(false);

  // Fetch available library files
  const { files: libraryFiles, fetchResources: fetchLibraryFiles } =
    useResourceFiles();

  // Track if we've already checked initial status to avoid duplicate checks
  const initialStatusCheckedRef = useRef<Set<string>>(new Set());
  // Ref to track current processing resources for polling callbacks
  const processingResourcesRef = useRef<Set<string>>(new Set());

  // Fetch library files when campaign details modal opens (so they're ready when user clicks Add resource)
  // biome-ignore lint/correctness/useExhaustiveDependencies: only refetch when modal opens or campaign changes; omit fetchLibraryFiles to avoid refetch on every render
  useEffect(() => {
    if (isOpen && campaign) {
      fetchLibraryFiles();
    }
  }, [isOpen, campaign]);

  const {
    digests,
    loading: digestsLoading,
    error: digestsError,
    fetchSessionDigests,
    deleteSessionDigest,
  } = useSessionDigests();

  const { makeRequestWithData } = useAuthenticatedRequest();

  const fetchCampaignResources = useBaseAsync(
    useMemo(
      () => async (campaignId: string) => {
        const data = await makeRequestWithData<{
          resources: CampaignResource[];
        }>(
          API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCES(campaignId)
          )
        );
        return data.resources || [];
      },
      [makeRequestWithData]
    ),
    useMemo(
      () => ({
        onSuccess: (resources: CampaignResource[]) => {
          setResources(resources);
          setResourcesError(null);
        },
        onError: (error: string) => {
          setResourcesError(error);
        },
        onStart: () => {
          setResourcesLoading(true);
        },
        onFinish: () => {
          setResourcesLoading(false);
        },
      }),
      []
    )
  );

  const retryEntityExtraction = useBaseAsync(
    useMemo(
      () => async (campaignId: string, resourceId: string) => {
        const data = await makeRequestWithData(
          API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.CAMPAIGNS.RETRY_ENTITY_EXTRACTION(
              campaignId,
              resourceId
            )
          ),
          {
            method: "POST",
          }
        );
        return data;
      },
      [makeRequestWithData]
    ),
    useMemo(
      () => ({
        onSuccess: () => {
          // Refresh resources list after successful retry
          if (campaign) {
            fetchCampaignResources.execute(campaign.campaignId);
          }
          setRetryingResourceId(null);
        },
        onError: (error: string) => {
          console.error("Failed to retry entity extraction:", error);
          // Show user-friendly error message (error parsing already handled in useAuthenticatedRequest)
          alert(`Failed to retry entity extraction: ${error}`);
          setRetryingResourceId(null);
        },
        onStart: () => {
          // Retry started
        },
        onFinish: () => {
          // Retry finished
        },
      }),
      [campaign, fetchCampaignResources]
    )
  );

  const handleRetryEntityExtraction = async (resourceId: string) => {
    if (!campaign) return;
    setRetryingResourceId(resourceId);
    await retryEntityExtraction.execute(campaign.campaignId, resourceId);
    // After queuing, mark as processing and start polling
    setProcessingResources((prev) => new Set(prev).add(resourceId));
  };

  // Check queue status for a resource
  const checkQueueStatus = useBaseAsync(
    useMemo(
      () => async (campaignId: string, resourceId: string) => {
        const data = await makeRequestWithData<{
          inQueue: boolean;
          status:
            | "pending"
            | "processing"
            | "completed"
            | "failed"
            | "rate_limited"
            | null;
        }>(
          API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITY_EXTRACTION_STATUS(
              campaignId,
              resourceId
            )
          ),
          {
            method: "GET",
          }
        );
        return { data, resourceId };
      },
      [makeRequestWithData]
    ),
    useMemo(
      () => ({
        onSuccess: (result: { data: any; resourceId: string }) => {
          const { data, resourceId } = result;
          // If in queue and processing, add to processing set
          if (
            data.inQueue &&
            (data.status === "pending" || data.status === "processing")
          ) {
            setProcessingResources((prev) => {
              const next = new Set(prev);
              next.add(resourceId);
              return next;
            });
          }
          // If not in queue or completed/failed, remove from processing set
          if (
            !data.inQueue ||
            data.status === "completed" ||
            data.status === "failed"
          ) {
            setProcessingResources((prev) => {
              const next = new Set(prev);
              next.delete(resourceId);
              return next;
            });
          }
        },
        onError: (error: string) => {
          // On network/resource errors, remove from processing to prevent retry loops
          // Only log if it's not a network error (which we expect during resource exhaustion)
          if (
            !error.includes("Failed to fetch") &&
            !error.includes("ERR_INSUFFICIENT_RESOURCES")
          ) {
            console.error(
              `[CampaignDetailsModal] Error checking queue status:`,
              error
            );
          }
        },
      }),
      []
    )
  );

  // Listen for entity extraction completion events from notifications
  useEffect(() => {
    if (!campaign) return;

    const handleEntityExtractionCompleted = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { campaignId, resourceId } = customEvent.detail;

      // Only handle events for this campaign
      if (campaignId !== campaign.campaignId) return;

      console.log(
        `[CampaignDetailsModal] Entity extraction completed for resource ${resourceId}`
      );

      // Remove from processing set
      if (resourceId) {
        setProcessingResources((prev) => {
          const next = new Set(prev);
          next.delete(resourceId);
          return next;
        });
      }

      // Refresh the queue status for this resource
      if (resourceId) {
        checkQueueStatus.execute(campaign.campaignId, resourceId);
      }
    };

    window.addEventListener(
      APP_EVENT_TYPE.ENTITY_EXTRACTION_COMPLETED,
      handleEntityExtractionCompleted
    );

    return () => {
      window.removeEventListener(
        APP_EVENT_TYPE.ENTITY_EXTRACTION_COMPLETED,
        handleEntityExtractionCompleted
      );
    };
  }, [campaign, checkQueueStatus]);

  // Update ref when processing resources change
  useEffect(() => {
    processingResourcesRef.current = processingResources;
  }, [processingResources]);

  // Poll queue status for processing resources (staggered to avoid overwhelming)
  useEffect(() => {
    if (!campaign || processingResources.size === 0) return;

    const pollInterval = setInterval(() => {
      // Stagger requests by 200ms to avoid overwhelming the browser/server
      const resourceArray = Array.from(processingResourcesRef.current);
      resourceArray.forEach((resourceId, index) => {
        setTimeout(() => {
          // Only check if still in processing set (may have been removed)
          if (processingResourcesRef.current.has(resourceId)) {
            checkQueueStatus.execute(campaign.campaignId, resourceId);
          }
        }, index * 200);
      });
    }, 30000); // Poll every 30 seconds as fallback

    return () => clearInterval(pollInterval);
  }, [campaign, processingResources, checkQueueStatus]);

  // Check queue status when resources are loaded (to detect already-queued items)
  // Check them in batches with delays to avoid overwhelming the browser
  useEffect(() => {
    if (!campaign || resources.length === 0) return;

    // Only check resources we haven't checked yet
    const uncheckedResources = resources.filter(
      (resource) => !initialStatusCheckedRef.current.has(resource.id)
    );

    if (uncheckedResources.length === 0) return;

    // Mark all as checked to prevent duplicate checks
    uncheckedResources.forEach((resource) => {
      initialStatusCheckedRef.current.add(resource.id);
    });

    // Check status in batches of 3 with 500ms delay between batches
    const BATCH_SIZE = 3;
    const BATCH_DELAY = 500;

    uncheckedResources.forEach((resource, index) => {
      const batchIndex = Math.floor(index / BATCH_SIZE);
      const delay = batchIndex * BATCH_DELAY;

      setTimeout(() => {
        checkQueueStatus.execute(campaign.campaignId, resource.id);
      }, delay);
    });
  }, [campaign, resources, checkQueueStatus]);

  // Reset form when campaign changes
  useEffect(() => {
    if (campaign) {
      setEditedName(campaign.name);
      setEditedDescription(campaign.description || "");
      // Reset initial status check tracking when campaign changes
      initialStatusCheckedRef.current.clear();
      setProcessingResources(new Set());
      if (isOpen && activeTab === "digests") {
        fetchSessionDigests.execute(campaign.campaignId);
      }
      if (isOpen && activeTab === "resources") {
        fetchCampaignResources.execute(campaign.campaignId);
      }
    }
  }, [
    campaign,
    isOpen,
    activeTab,
    fetchSessionDigests.execute,
    fetchCampaignResources.execute,
  ]);

  // Fetch digests when switching to digests tab
  useEffect(() => {
    if (campaign && isOpen && activeTab === "digests") {
      fetchSessionDigests.execute(campaign.campaignId);
    }
  }, [campaign, isOpen, activeTab, fetchSessionDigests.execute]);

  // Fetch resources when switching to documents tab
  useEffect(() => {
    if (campaign && isOpen && activeTab === "resources") {
      fetchCampaignResources.execute(campaign.campaignId);
    }
  }, [campaign, isOpen, activeTab, fetchCampaignResources.execute]);

  const handleSave = async () => {
    if (!campaign) return;

    setIsUpdating(true);
    try {
      await onUpdate(campaign.campaignId, {
        name: editedName,
        description: editedDescription,
      });
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to update campaign:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteCampaign = async () => {
    if (!campaign) return;
    await onDelete(campaign.campaignId);
    onClose();
  };

  const handleCancel = () => {
    setEditedName(campaign?.name || "");
    setEditedDescription(campaign?.description || "");
    setIsEditing(false);
  };

  const handleCreateDigest = () => {
    setEditingDigest(null);
    setBulkImportData(null);
    setIsDigestModalOpen(true);
  };

  const handleBulkImport = (importedData: SessionDigestData) => {
    setBulkImportData(importedData);
    setIsBulkImportOpen(false);
    setIsDigestModalOpen(true);
  };

  const handleEditDigest = (digest: SessionDigestWithData) => {
    setEditingDigest(digest);
    setIsDigestModalOpen(true);
  };

  const handleDeleteDigest = async (digest: SessionDigestWithData) => {
    if (
      !campaign ||
      !window.confirm(
        `Are you sure you want to delete Session ${digest.sessionNumber}?`
      )
    ) {
      return;
    }
    try {
      await deleteSessionDigest.execute(campaign.campaignId, digest.id);
    } catch (error) {
      console.error("Failed to delete session digest:", error);
    }
  };

  const handleDigestSave = () => {
    if (campaign) {
      fetchSessionDigests.execute(campaign.campaignId);
    }
  };

  const getSuggestedSessionNumber = (): number => {
    if (digests.length === 0) return 1;
    const maxSession = Math.max(...digests.map((d) => d.sessionNumber));
    return maxSession + 1;
  };

  if (!campaign) return null;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        cardStyle={STANDARD_MODAL_SIZE_OBJECT}
      >
        <div className="p-6">
          {/* Header */}
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Campaign details
            </h2>
          </div>

          {/* Tabs */}
          <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setActiveTab("details")}
                className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "details"
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                }`}
              >
                Details
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("digests")}
                className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "digests"
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                }`}
              >
                Session digests
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("resources")}
                className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "resources"
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                }`}
              >
                Resources
              </button>
            </div>
          </div>

          {activeTab === "details" && (
            <CampaignDetailsTab
              campaign={campaign}
              isEditing={isEditing}
              editedName={editedName}
              editedDescription={editedDescription}
              nameId={nameId}
              descriptionId={descriptionId}
              onNameChange={setEditedName}
              onDescriptionChange={setEditedDescription}
            />
          )}

          {activeTab === "digests" && (
            <CampaignDigestsTab
              digests={digests}
              loading={digestsLoading}
              error={digestsError}
              onEdit={handleEditDigest}
              onDelete={handleDeleteDigest}
              onCreate={handleCreateDigest}
              onBulkImport={() => setIsBulkImportOpen(true)}
            />
          )}

          {activeTab === "resources" && (
            <CampaignResourcesTab
              resources={resources}
              loading={resourcesLoading}
              error={resourcesError}
              expandedResources={expandedResources}
              onExpandedChange={setExpandedResources}
              processingResources={processingResources}
              retryingResourceId={retryingResourceId}
              onRetry={handleRetryEntityExtraction}
              onAddResource={() => setIsAddResourceModalOpen(true)}
            />
          )}

          {/* Actions */}
          {activeTab === "details" && (
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <FormButton
                      onClick={handleSave}
                      disabled={isUpdating || !editedName.trim()}
                      loading={isUpdating}
                      icon={<FloppyDisk size={16} />}
                    >
                      {isUpdating ? "Saving..." : "Save changes"}
                    </FormButton>
                    <FormButton
                      onClick={handleCancel}
                      disabled={isUpdating}
                      variant="secondary"
                    >
                      Cancel
                    </FormButton>
                  </>
                ) : (
                  <>
                    <FormButton
                      onClick={() => setIsEditing(true)}
                      icon={<PencilSimple size={16} />}
                    >
                      Edit campaign
                    </FormButton>
                    <FormButton
                      onClick={() => setIsGraphModalOpen(true)}
                      variant="secondary"
                    >
                      View graph
                    </FormButton>
                  </>
                )}
              </div>

              {!isEditing && (
                <ConfirmDeleteButton
                  label="Delete campaign"
                  confirmLabel="Confirm delete"
                  onConfirm={handleDeleteCampaign}
                  disabled={isUpdating}
                />
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Session Digest Modal */}
      {campaign && (
        <>
          <SessionDigestModal
            isOpen={isDigestModalOpen}
            onClose={() => {
              setIsDigestModalOpen(false);
              setEditingDigest(null);
              setBulkImportData(null);
            }}
            campaignId={campaign.campaignId}
            digest={editingDigest}
            suggestedSessionNumber={getSuggestedSessionNumber()}
            initialDigestData={bulkImportData}
            onSave={handleDigestSave}
          />
          <Modal
            isOpen={isBulkImportOpen}
            onClose={() => setIsBulkImportOpen(false)}
            cardStyle={STANDARD_MODAL_SIZE_OBJECT}
            showCloseButton={true}
          >
            <div className="p-6">
              <SessionDigestBulkImport
                onImport={handleBulkImport}
                onCancel={() => setIsBulkImportOpen(false)}
              />
            </div>
          </Modal>
        </>
      )}

      {/* Add Resource Modal */}
      <Modal
        isOpen={isAddResourceModalOpen}
        onClose={() => {
          setIsAddResourceModalOpen(false);
          setSelectedResourceKeys(new Set());
        }}
        cardStyle={STANDARD_MODAL_SIZE_OBJECT}
        showCloseButton={true}
      >
        <div className="p-6 flex flex-col h-full">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Add resources to campaign
          </h3>

          {libraryFiles.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No files in library. Upload files first.
            </div>
          ) : (
            <>
              <div className="flex-1 space-y-2 max-h-96 overflow-y-auto mb-6">
                {libraryFiles
                  .filter((file: any) => {
                    // Filter out files already in this campaign
                    return !resources.some((r) => r.file_key === file.file_key);
                  })
                  .map((file: any) => {
                    const isSelected = selectedResourceKeys.has(file.file_key);
                    return (
                      <label
                        key={file.file_key}
                        className={`w-full p-3 flex items-start gap-3 border rounded-lg cursor-pointer transition-colors ${
                          isSelected
                            ? "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                            : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            const newSelected = new Set(selectedResourceKeys);
                            if (e.target.checked) {
                              newSelected.add(file.file_key);
                            } else {
                              newSelected.delete(file.file_key);
                            }
                            setSelectedResourceKeys(newSelected);
                          }}
                          className="mt-1 h-4 w-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {getDisplayName(file)}
                          </div>
                          {file.description && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {file.description}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                {libraryFiles.filter(
                  (file: any) =>
                    !resources.some((r) => r.file_key === file.file_key)
                ).length === 0 && (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    All library files are already added to this campaign.
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-6 border-t border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {selectedResourceKeys.size > 0 &&
                    `${selectedResourceKeys.size} resource${selectedResourceKeys.size === 1 ? "" : "s"} selected`}
                </div>
                <div className="flex gap-2">
                  <FormButton
                    onClick={async () => {
                      if (
                        !onAddFileToCampaign ||
                        !campaign ||
                        selectedResourceKeys.size === 0
                      )
                        return;

                      setIsAddingResources(true);
                      try {
                        // Add each selected resource
                        for (const fileKey of selectedResourceKeys) {
                          const file = libraryFiles.find(
                            (f: any) => f.file_key === fileKey
                          );
                          if (file) {
                            await onAddFileToCampaign(
                              file.file_key,
                              file.file_name
                            );
                          }
                        }

                        // Close modal and refresh
                        setIsAddResourceModalOpen(false);
                        setSelectedResourceKeys(new Set());
                        if (campaign?.campaignId) {
                          fetchCampaignResources.execute(campaign.campaignId);
                        }
                      } catch (error) {
                        console.error("Failed to add resources:", error);
                      } finally {
                        setIsAddingResources(false);
                      }
                    }}
                    disabled={
                      selectedResourceKeys.size === 0 || isAddingResources
                    }
                    loading={isAddingResources}
                    icon={<FloppyDisk size={16} />}
                  >
                    {isAddingResources ? "Adding..." : "Add resources"}
                  </FormButton>
                  <FormButton
                    onClick={() => {
                      setIsAddResourceModalOpen(false);
                      setSelectedResourceKeys(new Set());
                    }}
                    disabled={isAddingResources}
                    variant="secondary"
                  >
                    Cancel
                  </FormButton>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Graph visualization modal */}
      {campaign && (
        <GraphVisualizationModal
          campaignId={campaign.campaignId}
          campaignName={campaign.name}
          isOpen={isGraphModalOpen}
          onClose={() => setIsGraphModalOpen(false)}
        />
      )}
    </>
  );
}
