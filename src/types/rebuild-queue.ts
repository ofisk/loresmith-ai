import type { RebuildType } from "@/dao/rebuild-status-dao";

export interface RebuildQueueMessage {
  rebuildId: string;
  campaignId: string;
  rebuildType: RebuildType;
  affectedEntityIds?: string[];
  triggeredBy: string; // username or 'system' or 'scheduled'
  options?: {
    regenerateSummaries?: boolean;
    recalculateImportance?: boolean;
  };
}
