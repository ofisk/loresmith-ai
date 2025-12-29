import {
  FloppyDisk,
  PencilSimple,
  Trash,
  Plus,
  ArrowClockwise,
  CaretDownIcon,
  CaretRightIcon,
} from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState, useMemo } from "react";
import type { Campaign, CampaignResource } from "@/types/campaign";
import type { SessionDigestWithData } from "@/types/session-digest";
import { Button } from "@/components/button/Button";
import { FormButton } from "@/components/button/FormButton";
import { FormField } from "@/components/input/FormField";
import { Modal } from "@/components/modal/Modal";
import { SessionDigestList } from "@/components/session/SessionDigestList";
import { SessionDigestModal } from "@/components/session/SessionDigestModal";
import { SessionDigestBulkImport } from "@/components/session/SessionDigestBulkImport";
import { useSessionDigests } from "@/hooks/useSessionDigests";
import type { SessionDigestData } from "@/types/session-digest";
import { useAuthenticatedRequest } from "@/hooks/useAuthenticatedRequest";
import { useBaseAsync } from "@/hooks/useBaseAsync";
import { API_CONFIG } from "@/shared-config";
import { getDisplayName } from "@/lib/display-name-utils";
import { useResourceFiles } from "@/hooks/useResourceFiles";
import { STANDARD_MODAL_SIZE_OBJECT } from "@/constants/modal-sizes";

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
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmProgress, setConfirmProgress] = useState(0);
  const confirmTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const confirmIntervalRef = useRef<NodeJS.Timeout | null>(null);
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

  // Fetch available library files
  const { files: libraryFiles, fetchResources: fetchLibraryFiles } =
    useResourceFiles();

  // Fetch library files when campaign details modal opens (so they're ready when user clicks Add resource)
  useEffect(() => {
    if (isOpen && campaign) {
      fetchLibraryFiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, campaign?.campaignId]);

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
          // If completed or failed, remove from processing set regardless of inQueue status
          // (completed items may still be in the queue table until cleanup)
          if (data.status === "completed" || data.status === "failed") {
            setProcessingResources((prev) => {
              const next = new Set(prev);
              next.delete(resourceId);
              return next;
            });
          }
        },
        onError: () => {
          // On error, still remove from processing to allow retry
          // (error might be transient)
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
      "entity-extraction-completed",
      handleEntityExtractionCompleted
    );

    return () => {
      window.removeEventListener(
        "entity-extraction-completed",
        handleEntityExtractionCompleted
      );
    };
  }, [campaign, checkQueueStatus]);

  // Poll queue status for processing resources (fallback with 30s interval)
  useEffect(() => {
    if (!campaign || processingResources.size === 0) return;

    const pollInterval = setInterval(() => {
      processingResources.forEach((resourceId) => {
        checkQueueStatus.execute(campaign.campaignId, resourceId);
      });
    }, 30000); // Poll every 30 seconds as fallback

    return () => clearInterval(pollInterval);
  }, [campaign, processingResources, checkQueueStatus]);

  // Check queue status when resources are loaded (to detect already-queued items)
  // Only run once when modal opens or campaign changes, not on every resources update
  const hasCheckedInitialStatus = useRef(false);
  useEffect(() => {
    if (!campaign || resources.length === 0) return;

    // Only check once per campaign
    if (hasCheckedInitialStatus.current) return;
    hasCheckedInitialStatus.current = true;

    // Check status for all resources to see if any are already in the queue
    resources.forEach((resource) => {
      checkQueueStatus.execute(campaign.campaignId, resource.id);
    });
  }, [campaign, resources, checkQueueStatus]);

  // Reset the check flag when campaign changes
  useEffect(() => {
    hasCheckedInitialStatus.current = false;
  }, [campaign?.campaignId]);

  // Reset form when campaign changes
  useEffect(() => {
    if (campaign) {
      setEditedName(campaign.name);
      setEditedDescription(campaign.description || "");
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

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current) {
        clearTimeout(confirmTimeoutRef.current);
      }
      if (confirmIntervalRef.current) {
        clearInterval(confirmIntervalRef.current);
      }
    };
  }, []);

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

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
    setConfirmProgress(0);

    // Start the countdown animation
    const startTime = Date.now();
    const duration = 7000; // 7 seconds

    confirmIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setConfirmProgress(progress * 100);

      if (progress >= 1) {
        // Auto-cancel when countdown completes
        handleDeleteCancel();
      }
    }, 50); // Update every 50ms for smooth animation
  };

  const handleDeleteConfirm = async () => {
    if (!campaign) return;

    setIsDeleting(true);
    try {
      await onDelete(campaign.campaignId);
      onClose();
    } catch (error) {
      console.error("Failed to delete campaign:", error);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
    setConfirmProgress(0);

    // Clear timers
    if (confirmTimeoutRef.current) {
      clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = null;
    }
    if (confirmIntervalRef.current) {
      clearInterval(confirmIntervalRef.current);
      confirmIntervalRef.current = null;
    }
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

        {/* Campaign Info - Details Tab */}
        {activeTab === "details" && (
          <div className="space-y-4">
            {/* Name */}
            {isEditing ? (
              <FormField
                id={nameId}
                label="Campaign name"
                value={editedName}
                onValueChange={(value) => setEditedName(value)}
                placeholder="Enter campaign name"
              />
            ) : (
              <div>
                <div className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Campaign name
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-gray-900 dark:text-gray-100">
                    {campaign.name}
                  </p>
                </div>
              </div>
            )}

            {/* Description */}
            {isEditing ? (
              <FormField
                id={descriptionId}
                label="Description"
                value={editedDescription}
                onValueChange={(value) => setEditedDescription(value)}
                placeholder="Enter campaign description"
                multiline
                rows={4}
              />
            ) : (
              <div>
                <div className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg min-h-[100px]">
                  <p className="text-gray-900 dark:text-gray-100">
                    {campaign.description || "No description provided"}
                  </p>
                </div>
              </div>
            )}

            {/* Metadata */}
            <div className="flex justify-between items-center text-sm text-gray-500 dark:text-gray-400">
              <div>
                <span className="font-medium">Created:</span>{" "}
                {new Date(campaign.createdAt).toLocaleDateString()}
              </div>
              <div className="text-right">
                <span className="font-medium">ID:</span> {campaign.campaignId}
              </div>
            </div>
          </div>
        )}

        {/* Session Digests Tab */}
        {activeTab === "digests" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Session digests
              </h3>
              <div className="flex gap-2">
                <FormButton
                  onClick={() => setIsBulkImportOpen(true)}
                  variant="secondary"
                >
                  Bulk import
                </FormButton>
                <FormButton
                  onClick={handleCreateDigest}
                  icon={<Plus size={16} />}
                >
                  Create digest
                </FormButton>
              </div>
            </div>
            <SessionDigestList
              digests={digests}
              loading={digestsLoading}
              error={digestsError}
              onEdit={handleEditDigest}
              onDelete={handleDeleteDigest}
            />
          </div>
        )}

        {/* Resources Tab */}
        {activeTab === "resources" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Linked resources
              </h3>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsAddResourceModalOpen(true)}
                className="!text-purple-600 dark:!text-purple-400"
              >
                <Plus size={16} weight="bold" />
                Add resource
              </Button>
            </div>
            {resourcesLoading ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                Loading resources...
              </div>
            ) : resourcesError ? (
              <div className="text-center py-8 text-red-500 dark:text-red-400">
                Error loading resources: {resourcesError}
              </div>
            ) : resources.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No resources linked to this campaign.
              </div>
            ) : (
              <div className="space-y-3">
                {resources.map((resource) => {
                  const isExpanded = expandedResources.has(resource.id);
                  const toggleExpand = () => {
                    const newExpanded = new Set(expandedResources);
                    if (isExpanded) {
                      newExpanded.delete(resource.id);
                    } else {
                      newExpanded.add(resource.id);
                    }
                    setExpandedResources(newExpanded);
                  };

                  return (
                    <button
                      key={resource.id}
                      type="button"
                      className="relative p-2 border rounded-lg bg-white dark:bg-neutral-900 shadow-sm border-neutral-200 dark:border-neutral-800 overflow-hidden cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors duration-200 w-full text-left"
                      onClick={toggleExpand}
                    >
                      <div className="flex flex-col h-full">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1 mr-3 min-w-0">
                            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-[200px]">
                              {getDisplayName(resource)}
                            </h4>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand();
                            }}
                            type="button"
                            className="flex-shrink-0 p-1 rounded-md bg-neutral-200 dark:bg-neutral-800 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors duration-200"
                          >
                            {isExpanded ? (
                              <CaretDownIcon
                                size={16}
                                className="text-purple-600 dark:text-purple-400"
                              />
                            ) : (
                              <CaretRightIcon
                                size={16}
                                className="text-purple-600 dark:text-purple-400"
                              />
                            )}
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="overflow-y-auto transition-all duration-300 ease-in-out max-h-96 opacity-100">
                            <div className="mt-4 text-xs space-y-1">
                              {resource.display_name && (
                                <div className="flex justify-between items-center">
                                  <span className="text-gray-600 dark:text-gray-400">
                                    Display name:
                                  </span>
                                  <span className="font-medium text-gray-900 dark:text-gray-100">
                                    {resource.display_name}
                                  </span>
                                </div>
                              )}
                              <div className="flex justify-between items-center">
                                <span className="text-gray-600 dark:text-gray-400">
                                  Filename:
                                </span>
                                <span className="font-medium text-gray-900 dark:text-gray-100">
                                  {resource.file_name}
                                </span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-gray-600 dark:text-gray-400">
                                  Added:
                                </span>
                                <span className="font-medium text-gray-900 dark:text-gray-100">
                                  {new Date(resource.created_at)
                                    .toLocaleDateString("en-US", {
                                      month: "short",
                                      day: "numeric",
                                      year: "2-digit",
                                      hour: "numeric",
                                      minute: "2-digit",
                                      hour12: true,
                                    })
                                    .replace(",", "")
                                    .replace(" PM", "p")
                                    .replace(" AM", "a")}
                                </span>
                              </div>
                            </div>

                            {resource.description && (
                              <div className="mt-3">
                                <p className="text-sm text-gray-600 dark:text-gray-300">
                                  {resource.description}
                                </p>
                              </div>
                            )}

                            {resource.tags &&
                              (() => {
                                try {
                                  const tags =
                                    typeof resource.tags === "string"
                                      ? JSON.parse(resource.tags)
                                      : resource.tags;
                                  if (Array.isArray(tags) && tags.length > 0) {
                                    return (
                                      <div className="mt-3">
                                        <div className="flex flex-wrap gap-1">
                                          {tags.map((tag: string) => (
                                            <span
                                              key={tag}
                                              className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded"
                                            >
                                              {tag}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  }
                                } catch {
                                  // Invalid JSON, ignore
                                }
                                return null;
                              })()}

                            <div className="mt-4 space-y-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRetryEntityExtraction(resource.id);
                                }}
                                disabled={
                                  retryingResourceId === resource.id ||
                                  processingResources.has(resource.id)
                                }
                                className="w-full px-3 py-2 text-sm font-medium rounded-md border transition-colors text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {processingResources.has(resource.id) ? (
                                  <span className="flex items-center justify-center gap-2">
                                    <ArrowClockwise
                                      size={16}
                                      className="animate-spin"
                                    />
                                    Processing...
                                  </span>
                                ) : retryingResourceId === resource.id ? (
                                  <span className="flex items-center justify-center gap-2">
                                    <ArrowClockwise
                                      size={16}
                                      className="animate-spin"
                                    />
                                    Retrying...
                                  </span>
                                ) : (
                                  "Retry entity extraction"
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
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
                <FormButton
                  onClick={() => setIsEditing(true)}
                  icon={<PencilSimple size={16} />}
                >
                  Edit campaign
                </FormButton>
              )}
            </div>

            {!isEditing &&
              (showDeleteConfirm ? (
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={handleDeleteCancel}
                    disabled={isDeleting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteConfirm}
                    disabled={isDeleting}
                    className="relative flex items-center gap-2 overflow-hidden"
                  >
                    {/* Progress bar background */}
                    <div
                      className="absolute inset-0 bg-gray-400/30 transition-all duration-75 ease-linear"
                      style={{ width: `${confirmProgress}%` }}
                    />
                    {/* Button content */}
                    <div className="relative z-10 flex items-center gap-2">
                      <Trash size={16} />
                      {isDeleting ? "Deleting..." : "Confirm delete"}
                    </div>
                  </Button>
                </div>
              ) : (
                <FormButton
                  onClick={handleDeleteClick}
                  disabled={isDeleting || isUpdating}
                  variant="destructive"
                  icon={<Trash size={16} />}
                >
                  Delete campaign
                </FormButton>
              ))}
          </div>
        )}
      </div>

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
    </Modal>
  );
}
