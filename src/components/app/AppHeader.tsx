import { Bug, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/button/Button";
import { HelpButton } from "@/components/help/HelpButton";
import { TopBarNotifications } from "@/components/notifications/TopBarNotifications";
import { Toggle } from "@/components/toggle/Toggle";
import loresmith from "@/assets/loresmith.png";
import type { NotificationPayload } from "@/durable-objects/notification-hub";

interface AppHeaderProps {
  showDebug: boolean;
  onToggleDebug: () => void;
  onClearHistory: () => void;
  onHelpAction: (action: string) => void;
  onGuidanceRequest: () => void;
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
}

/**
 * AppHeader component - Top navigation bar with logo, controls, and notifications
 */
export function AppHeader({
  showDebug,
  onToggleDebug,
  onClearHistory,
  onHelpAction,
  onGuidanceRequest,
  notifications,
  onDismissNotification,
  onClearAllNotifications,
}: AppHeaderProps) {
  return (
    <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-700 flex items-center gap-4 bg-white/80 dark:bg-neutral-950/80 backdrop-blur-sm">
      <div
        className="flex items-center justify-center rounded-lg"
        style={{ width: 48, height: 48 }}
      >
        <img
          src={loresmith}
          alt="LoreSmith logo"
          width={48}
          height={48}
          className="object-contain"
        />
      </div>

      <div className="flex-1">
        <h1 className="font-semibold text-2xl">LoreSmith</h1>
      </div>

      <div className="flex items-center gap-2 mr-2">
        <Bug size={16} />
        <Toggle
          toggled={showDebug}
          aria-label="Toggle debug mode"
          onClick={onToggleDebug}
        />
      </div>

      <HelpButton
        onActionClick={onHelpAction}
        onGuidanceRequest={onGuidanceRequest}
      />

      <Button
        variant="ghost"
        size="md"
        shape="square"
        className="rounded-full h-9 w-9"
        onClick={onClearHistory}
      >
        <Trash size={20} />
      </Button>

      <TopBarNotifications
        notifications={notifications}
        onDismiss={onDismissNotification}
        onDismissAll={onClearAllNotifications}
      />
    </div>
  );
}
