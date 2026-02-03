import { Trash, NotePencil, Lightbulb, ChartBar } from "@phosphor-icons/react";
import { Button } from "@/components/button/Button";
import { HelpButton } from "@/components/help/HelpButton";
import { TopBarNotifications } from "@/components/notifications/TopBarNotifications";
import loresmith from "@/assets/loresmith.png";
import type { NotificationPayload } from "@/durable-objects/notification-hub";
import { AuthService } from "@/services/core/auth-service";

interface AppHeaderProps {
  onClearHistory: () => void;
  onHelpAction: (action: string) => void;
  onGuidanceRequest: () => void;
  onSessionRecapRequest?: () => void;
  onNextStepsRequest?: () => void;
  notifications: (
    | NotificationPayload
    | {
        timestamp: number;
        type: string;
        title: string;
        message: string;
        data?: Record<string, unknown>;
      }
  )[];
  onDismissNotification: (timestamp: number) => void;
  onClearAllNotifications: () => void;
  selectedCampaignId: string | null;
  onAdminDashboardOpen?: () => void;
}

/**
 * AppHeader component - Top navigation bar with logo, controls, and notifications
 */
export function AppHeader({
  onClearHistory,
  onHelpAction,
  onGuidanceRequest,
  onSessionRecapRequest,
  onNextStepsRequest,
  notifications,
  onDismissNotification,
  onClearAllNotifications,
  selectedCampaignId,
  onAdminDashboardOpen,
}: AppHeaderProps) {
  // Check if user is admin
  const payload = AuthService.getJwtPayload();
  const isAdmin = payload?.isAdmin === true;

  return (
    <div className="px-4 py-2 border-b border-neutral-200/50 dark:border-neutral-700/50 flex items-center gap-3 bg-white/60 dark:bg-neutral-950/60 backdrop-blur-sm rounded-t-2xl">
      <div
        className="flex items-center justify-center"
        style={{ width: 32, height: 32 }}
      >
        <img
          src={loresmith}
          alt="LoreSmith logo"
          width={32}
          height={32}
          className="object-contain"
        />
      </div>

      <div className="flex-1 flex items-center gap-3 min-w-0">
        <h1 className="font-medium text-lg whitespace-nowrap text-neutral-700 dark:text-neutral-300">
          LoreSmith
        </h1>
      </div>

      {onSessionRecapRequest && (
        <Button
          variant="ghost"
          size="md"
          shape="square"
          className="!h-8 !w-8 rounded-full flex items-center justify-center"
          onClick={onSessionRecapRequest}
          disabled={!selectedCampaignId}
          tooltip={
            selectedCampaignId
              ? "Record session recap"
              : "Select a campaign to record a session recap"
          }
        >
          <NotePencil size={18} />
        </Button>
      )}

      {onNextStepsRequest && (
        <Button
          variant="ghost"
          size="md"
          shape="square"
          className="!h-8 !w-8 rounded-full flex items-center justify-center"
          onClick={onNextStepsRequest}
          disabled={!selectedCampaignId}
          tooltip={
            selectedCampaignId
              ? "What should I do next?"
              : "Select a campaign to get next-step suggestions"
          }
        >
          <Lightbulb size={18} />
        </Button>
      )}

      <HelpButton
        onActionClick={onHelpAction}
        onGuidanceRequest={onGuidanceRequest}
      />

      {isAdmin && onAdminDashboardOpen && (
        <Button
          variant="ghost"
          size="md"
          shape="square"
          className="!h-8 !w-8 rounded-full flex items-center justify-center"
          onClick={onAdminDashboardOpen}
          tooltip="Admin dashboard - view telemetry and metrics"
        >
          <ChartBar size={18} />
        </Button>
      )}

      <Button
        variant="ghost"
        size="md"
        shape="square"
        className="!h-8 !w-8 rounded-full flex items-center justify-center"
        onClick={onClearHistory}
      >
        <Trash size={18} />
      </Button>

      <TopBarNotifications
        notifications={notifications}
        onDismiss={onDismissNotification}
        onDismissAll={onClearAllNotifications}
      />
    </div>
  );
}
