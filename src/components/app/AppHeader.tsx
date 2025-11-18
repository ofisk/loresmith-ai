import {
  Bug,
  MapPin,
  Trash,
  NotePencil,
  Lightbulb,
} from "@phosphor-icons/react";
import { Button } from "@/components/button/Button";
import { HelpButton } from "@/components/help/HelpButton";
import { TopBarNotifications } from "@/components/notifications/TopBarNotifications";
import { Toggle } from "@/components/toggle/Toggle";
import loresmith from "@/assets/loresmith.png";
import type { NotificationPayload } from "@/durable-objects/notification-hub";
import type { Campaign } from "@/types/campaign";

interface AppHeaderProps {
  showDebug: boolean;
  onToggleDebug: () => void;
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
  campaigns: Campaign[];
  selectedCampaignId: string | null;
  onSelectedCampaignChange: (campaignId: string | null) => void;
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
  onSessionRecapRequest,
  onNextStepsRequest,
  notifications,
  onDismissNotification,
  onClearAllNotifications,
  campaigns,
  selectedCampaignId,
  onSelectedCampaignChange,
}: AppHeaderProps) {
  const handleCampaignChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const value = event.target.value;
    if (!value) {
      onSelectedCampaignChange(null);
    } else {
      onSelectedCampaignChange(value);
    }
  };

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

      <div className="flex-1 flex items-center gap-4 min-w-0">
        <h1 className="font-semibold text-2xl whitespace-nowrap">LoreSmith</h1>

        <div className="hidden sm:flex items-center gap-2 min-w-0">
          <MapPin
            size={16}
            className="text-neutral-500 dark:text-neutral-400"
          />
          <select
            className="max-w-xs truncate rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:ring-blue-400"
            value={selectedCampaignId ?? ""}
            onChange={handleCampaignChange}
          >
            <option value="">No campaign selected</option>
            {campaigns.map((campaign) => (
              <option key={campaign.campaignId} value={campaign.campaignId}>
                {campaign.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2 mr-2">
        <Bug size={16} />
        <Toggle
          toggled={showDebug}
          aria-label="Toggle debug mode"
          onClick={onToggleDebug}
        />
      </div>

      {onSessionRecapRequest && (
        <Button
          variant="ghost"
          size="md"
          shape="square"
          className="rounded-full h-9 w-9"
          onClick={onSessionRecapRequest}
          disabled={!selectedCampaignId}
          tooltip={
            selectedCampaignId
              ? "Record session recap"
              : "Select a campaign to record a session recap"
          }
        >
          <NotePencil size={20} />
        </Button>
      )}

      {onNextStepsRequest && (
        <Button
          variant="ghost"
          size="md"
          shape="square"
          className="rounded-full h-9 w-9"
          onClick={onNextStepsRequest}
          disabled={!selectedCampaignId}
          tooltip={
            selectedCampaignId
              ? "What should I do next?"
              : "Select a campaign to get next-step suggestions"
          }
        >
          <Lightbulb size={20} />
        </Button>
      )}

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
