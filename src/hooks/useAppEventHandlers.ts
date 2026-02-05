import { useEffect, useRef } from "react";
import { APP_EVENT_TYPE } from "@/lib/app-events";

export interface UseAppEventHandlersArgs {
  modalState: { setShowAuthModal: (show: boolean) => void };
  refetchCampaigns: () => void;
  fetchAllStagedShards: () => void;
  authReady: boolean;
  selectedCampaignId: string | null;
  isLoading: boolean;
  checkHasBeenAway: () => boolean;
  checkShouldShowRecap: (campaignId: string) => boolean;
  markRecapShown: (campaignId: string) => void;
  append: (message: {
    role: "user";
    content: string;
    data: { type: string; campaignId: string | null; jwt: string | null };
  }) => void;
  authState: { getStoredJwt: () => string | null };
  /** Called before sending a context recap request so the app can hide the placeholder user message from the UI */
  onContextRecapRequest?: () => void;
}

/**
 * Sets up app-level event listeners: ui-hint (auth modal), campaign-created/deleted
 * (refresh campaigns), shards-generated (refresh shards overlay), and recap triggers
 * (context recap on init / campaign change).
 */
export function useAppEventHandlers({
  modalState,
  refetchCampaigns,
  fetchAllStagedShards,
  authReady,
  selectedCampaignId,
  isLoading,
  checkHasBeenAway,
  checkShouldShowRecap,
  markRecapShown,
  append,
  authState,
  onContextRecapRequest,
}: UseAppEventHandlersArgs): void {
  const recapTriggeredRef = useRef<Set<string>>(new Set());
  const shardsGeneratedTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  // Listen for authentication required via ui-hint events
  useEffect(() => {
    const handleUiHint = (e: CustomEvent<{ type: string; data?: unknown }>) => {
      const { type } = e.detail || {};
      if (type === "show_auth_modal") {
        console.log(
          "[App] Authentication required ui-hint received, showing auth modal"
        );
        modalState.setShowAuthModal(true);
      }
    };

    window.addEventListener(
      APP_EVENT_TYPE.UI_HINT,
      handleUiHint as unknown as EventListener
    );
    return () => {
      window.removeEventListener(
        APP_EVENT_TYPE.UI_HINT,
        handleUiHint as unknown as EventListener
      );
    };
  }, [modalState]);

  // Listen for campaign-created events to refresh campaigns list
  useEffect(() => {
    const handleCampaignCreated = () => {
      console.log(
        "[App] Campaign created event received, refreshing campaigns list"
      );
      refetchCampaigns();
    };

    window.addEventListener(
      APP_EVENT_TYPE.CAMPAIGN_CREATED,
      handleCampaignCreated as EventListener
    );
    return () => {
      window.removeEventListener(
        APP_EVENT_TYPE.CAMPAIGN_CREATED,
        handleCampaignCreated as EventListener
      );
    };
  }, [refetchCampaigns]);

  // Listen for campaign-deleted events to refresh campaigns list
  useEffect(() => {
    const handleCampaignDeleted = () => {
      console.log(
        "[App] Campaign deleted event received, refreshing campaigns list"
      );
      refetchCampaigns();
    };

    window.addEventListener(
      APP_EVENT_TYPE.CAMPAIGN_DELETED,
      handleCampaignDeleted as EventListener
    );
    return () => {
      window.removeEventListener(
        APP_EVENT_TYPE.CAMPAIGN_DELETED,
        handleCampaignDeleted as EventListener
      );
    };
  }, [refetchCampaigns]);

  // Trigger recap on app initialization if user has been away
  useEffect(() => {
    if (!authReady || !selectedCampaignId || isLoading) {
      return;
    }

    const shouldTrigger =
      checkHasBeenAway() && checkShouldShowRecap(selectedCampaignId);
    const recapKey = `init-${selectedCampaignId}`;

    if (shouldTrigger && !recapTriggeredRef.current.has(recapKey)) {
      recapTriggeredRef.current.add(recapKey);
      const jwt = authState.getStoredJwt();

      console.log("[App] Triggering context recap after inactivity");

      onContextRecapRequest?.();
      append({
        role: "user",
        content: "",
        data: {
          type: "context_recap_request",
          campaignId: selectedCampaignId,
          jwt: jwt || null,
        },
      });

      markRecapShown(selectedCampaignId);
    }
  }, [
    authReady,
    selectedCampaignId,
    isLoading,
    checkHasBeenAway,
    checkShouldShowRecap,
    markRecapShown,
    append,
    authState,
    onContextRecapRequest,
  ]);

  // Trigger recap on campaign change
  useEffect(() => {
    if (!authReady || !selectedCampaignId || isLoading) {
      return;
    }

    const recapKey = `campaign-${selectedCampaignId}`;

    if (
      !recapTriggeredRef.current.has(recapKey) &&
      checkShouldShowRecap(selectedCampaignId)
    ) {
      recapTriggeredRef.current.add(recapKey);
      const jwt = authState.getStoredJwt();

      console.log(
        `[App] Triggering context recap for campaign change: ${selectedCampaignId}`
      );

      onContextRecapRequest?.();
      append({
        role: "user",
        content: "",
        data: {
          type: "context_recap_request",
          campaignId: selectedCampaignId,
          jwt: jwt || null,
        },
      });

      markRecapShown(selectedCampaignId);
    }
  }, [
    selectedCampaignId,
    authReady,
    isLoading,
    checkShouldShowRecap,
    markRecapShown,
    append,
    authState,
    onContextRecapRequest,
  ]);

  // Listen for shards-generated events to refresh shards overlay
  useEffect(() => {
    const handleShardsGenerated = (event: Event) => {
      const customEvent = event as CustomEvent;
      const detail = customEvent.detail;
      console.log(
        "[App] Shards generated event received, refreshing shards overlay",
        {
          campaignId: detail?.campaignId,
          campaignName: detail?.campaignName,
          shardCount: detail?.shardCount,
        }
      );

      if (shardsGeneratedTimeoutRef.current) {
        clearTimeout(shardsGeneratedTimeoutRef.current);
      }
      shardsGeneratedTimeoutRef.current = setTimeout(() => {
        shardsGeneratedTimeoutRef.current = null;
        console.log("[App] Refreshing shards overlay");
        fetchAllStagedShards();
      }, 1500);
    };

    window.addEventListener(
      APP_EVENT_TYPE.SHARDS_GENERATED,
      handleShardsGenerated as EventListener
    );
    return () => {
      if (shardsGeneratedTimeoutRef.current) {
        clearTimeout(shardsGeneratedTimeoutRef.current);
        shardsGeneratedTimeoutRef.current = null;
      }
      window.removeEventListener(
        APP_EVENT_TYPE.SHARDS_GENERATED,
        handleShardsGenerated as EventListener
      );
    };
  }, [fetchAllStagedShards]);
}
