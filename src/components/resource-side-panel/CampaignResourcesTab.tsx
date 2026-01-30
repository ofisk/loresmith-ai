import {
  ArrowClockwise,
  CaretDownIcon,
  CaretRightIcon,
  Plus,
} from "@phosphor-icons/react";
import { Button } from "@/components/button/Button";
import { getDisplayName } from "@/lib/display-name-utils";
import type { CampaignResource } from "@/types/campaign";

interface CampaignResourcesTabProps {
  resources: CampaignResource[];
  loading: boolean;
  error: string | null;
  expandedResources: Set<string>;
  onExpandedChange: (next: Set<string>) => void;
  processingResources: Set<string>;
  retryingResourceId: string | null;
  onRetry: (resourceId: string) => void;
  onAddResource: () => void;
}

/**
 * Linked resources tab: list with expand/collapse and retry entity extraction.
 */
export function CampaignResourcesTab({
  resources,
  loading,
  error,
  expandedResources,
  onExpandedChange,
  processingResources,
  retryingResourceId,
  onRetry,
  onAddResource,
}: CampaignResourcesTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Linked resources
        </h3>
        <Button
          variant="secondary"
          size="sm"
          onClick={onAddResource}
          className="!text-purple-600 dark:!text-purple-400"
        >
          <Plus size={16} weight="bold" />
          Add resource
        </Button>
      </div>
      {loading ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          Loading resources...
        </div>
      ) : error ? (
        <div className="text-center py-8 text-red-500 dark:text-red-400">
          Error loading resources: {error}
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
              onExpandedChange(newExpanded);
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
                            onRetry(resource.id);
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
  );
}
