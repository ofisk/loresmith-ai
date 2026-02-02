import { useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/button/Button";
import { API_CONFIG } from "@/shared-config";
import { useAuthenticatedRequest } from "@/hooks/useAuthenticatedRequest";
import { useBaseAsync } from "@/hooks/useBaseAsync";
import type { Entity } from "@/dao/entity-dao";
import { cn } from "@/lib/utils";

interface EntityDetailPanelProps {
  campaignId: string;
  entityId: string;
  onClose: () => void;
  className?: string;
}

interface EntityResponse {
  entity: Entity;
}

export function EntityDetailPanel({
  campaignId,
  entityId,
  onClose,
  className = "",
}: EntityDetailPanelProps) {
  const { makeRequestWithData } = useAuthenticatedRequest();

  const fetchEntityFn = useCallback(async () => {
    const url = API_CONFIG.buildUrl(
      API_CONFIG.ENDPOINTS.CAMPAIGNS.ENTITIES.DETAILS(campaignId, entityId)
    );
    const data = await makeRequestWithData<EntityResponse>(url);
    return data.entity;
  }, [campaignId, entityId, makeRequestWithData]);

  const {
    execute: fetchEntity,
    loading,
    error,
    data: entity,
  } = useBaseAsync(fetchEntityFn, {
    errorMessage: "Failed to load entity details",
  });

  const fetchEntityRef = useRef(fetchEntity);
  useEffect(() => {
    fetchEntityRef.current = fetchEntity;
  }, [fetchEntity]);

  useEffect(() => {
    fetchEntityRef.current();
  }, []);

  const renderValue = (value: unknown): React.ReactNode => {
    if (value === null || value === undefined) {
      return <span className="text-neutral-400 italic">null</span>;
    }

    if (typeof value === "string") {
      return <span>{value}</span>;
    }

    if (typeof value === "number") {
      return <span>{value}</span>;
    }

    if (typeof value === "boolean") {
      return <span>{value ? "true" : "false"}</span>;
    }

    if (Array.isArray(value)) {
      return (
        <ul className="list-disc list-inside space-y-1">
          {value.map((item) => (
            <li key={JSON.stringify(item)}>
              {renderValue(item) as React.ReactNode}
            </li>
          ))}
        </ul>
      );
    }

    if (typeof value === "object") {
      return (
        <pre className="bg-neutral-800 dark:bg-neutral-900 p-2 rounded text-xs overflow-auto max-h-40">
          {JSON.stringify(value, null, 2)}
        </pre>
      );
    }

    return <span>{String(value)}</span>;
  };

  const renderContentSection = (): React.ReactNode => {
    if (!entity || entity.content === undefined || entity.content === null) {
      return null;
    }

    // Parse content - if it's an object, render as labeled fields
    if (typeof entity.content === "object" && !Array.isArray(entity.content)) {
      const contentObj = entity.content as Record<string, unknown>;
      return (
        <div key="content">
          <h4 className="text-sm font-semibold mb-2 text-neutral-700 dark:text-neutral-300">
            Content
          </h4>
          <div className="space-y-3">
            {Object.entries(contentObj).map(([key, value]) => (
              <div key={key}>
                <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                  {key}
                </div>
                <div className="text-sm">{renderValue(value)}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // For strings or arrays, display as before
    return (
      <div key="content">
        <h4 className="text-sm font-semibold mb-2 text-neutral-700 dark:text-neutral-300">
          Content
        </h4>
        <div className="bg-neutral-100 dark:bg-neutral-800 p-3 rounded text-sm whitespace-pre-wrap">
          {typeof entity.content === "string"
            ? entity.content
            : JSON.stringify(entity.content, null, 2)}
        </div>
      </div>
    );
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-neutral-50 dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-700",
        className
      )}
    >
      <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-700">
        <h3 className="text-lg font-semibold">Entity details</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          ×
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-neutral-600 dark:text-neutral-400">
              Loading...
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-full">
            <div className="text-red-600 dark:text-red-400">{error}</div>
          </div>
        )}

        {entity && (
          <div className="space-y-4" key={entity.id}>
            {/* Basic Info */}
            <div>
              <h4 className="text-sm font-semibold mb-2 text-neutral-700 dark:text-neutral-300">
                Basic information
              </h4>
              <div className="space-y-2">
                <div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    Name
                  </div>
                  <div className="text-sm font-medium">{entity.name}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    Type
                  </div>
                  <div className="text-sm">{entity.entityType}</div>
                </div>
                {entity.confidence !== undefined &&
                  entity.confidence !== null && (
                    <div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        Confidence
                      </div>
                      <div className="text-sm">
                        {Math.round(entity.confidence * 100)}%
                      </div>
                    </div>
                  )}
                {entity.sourceType && (
                  <div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">
                      Source type
                    </div>
                    <div className="text-sm">{entity.sourceType}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Content */}
            {renderContentSection()}

            {/* Metadata */}
            {entity.metadata && typeof entity.metadata === "object" ? (
              <div>
                <h4 className="text-sm font-semibold mb-2 text-neutral-700 dark:text-neutral-300">
                  Metadata
                </h4>
                <div className="space-y-3">
                  {Object.entries(
                    entity.metadata as Record<string, unknown>
                  ).map(([key, value]) => (
                    <div key={key}>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                        {key}
                      </div>
                      <div className="text-sm">{renderValue(value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Timestamps */}
            <div>
              <h4 className="text-sm font-semibold mb-2 text-neutral-700 dark:text-neutral-300">
                Timestamps
              </h4>
              <div className="space-y-2 text-sm">
                <div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    Created
                  </div>
                  <div>{new Date(entity.createdAt).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    Updated
                  </div>
                  <div>{new Date(entity.updatedAt).toLocaleString()}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
