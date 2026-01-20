import { BaseDAOClass } from "./base-dao";

export type ChecklistItemStatus = "complete" | "incomplete" | "partial";

export interface ChecklistStatusRecord {
  id: string;
  campaignId: string;
  checklistItemKey: string;
  status: ChecklistItemStatus;
  summary: string | null;
  lastUpdated: string;
  createdAt: string;
}

export interface ChecklistStatusUpdate {
  status: ChecklistItemStatus;
  summary?: string | null;
}

export class ChecklistStatusDAO extends BaseDAOClass {
  /**
   * Get all checklist status records for a campaign
   */
  async getChecklistStatus(
    campaignId: string
  ): Promise<ChecklistStatusRecord[]> {
    const sql = `
      SELECT 
        id,
        campaign_id as campaignId,
        checklist_item_key as checklistItemKey,
        status,
        summary,
        last_updated as lastUpdated,
        created_at as createdAt
      FROM campaign_checklist_status
      WHERE campaign_id = ?
      ORDER BY checklist_item_key
    `;
    return await this.queryAll<ChecklistStatusRecord>(sql, [campaignId]);
  }

  /**
   * Get checklist status for a specific item
   */
  async getItemStatus(
    campaignId: string,
    checklistItemKey: string
  ): Promise<ChecklistStatusRecord | null> {
    const sql = `
      SELECT 
        id,
        campaign_id as campaignId,
        checklist_item_key as checklistItemKey,
        status,
        summary,
        last_updated as lastUpdated,
        created_at as createdAt
      FROM campaign_checklist_status
      WHERE campaign_id = ? AND checklist_item_key = ?
    `;
    return await this.queryFirst<ChecklistStatusRecord>(sql, [
      campaignId,
      checklistItemKey,
    ]);
  }

  /**
   * Upsert checklist status for an item
   */
  async upsertItemStatus(
    id: string,
    campaignId: string,
    checklistItemKey: string,
    update: ChecklistStatusUpdate
  ): Promise<void> {
    const sql = `
      INSERT INTO campaign_checklist_status (
        id, campaign_id, checklist_item_key, status, summary, last_updated, created_at
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(campaign_id, checklist_item_key) DO UPDATE SET
        status = excluded.status,
        summary = excluded.summary,
        last_updated = CURRENT_TIMESTAMP
    `;
    await this.execute(sql, [
      id,
      campaignId,
      checklistItemKey,
      update.status,
      update.summary || null,
    ]);
  }

  /**
   * Update multiple checklist items at once
   */
  async bulkUpdateStatus(
    campaignId: string,
    updates: Array<{
      id: string;
      checklistItemKey: string;
      update: ChecklistStatusUpdate;
    }>
  ): Promise<void> {
    // Use a transaction-like approach with individual upserts
    for (const { id, checklistItemKey, update } of updates) {
      await this.upsertItemStatus(id, campaignId, checklistItemKey, update);
    }
  }

  /**
   * Delete checklist status for a campaign (useful for cleanup)
   */
  async deleteCampaignStatus(campaignId: string): Promise<void> {
    const sql = `DELETE FROM campaign_checklist_status WHERE campaign_id = ?`;
    await this.execute(sql, [campaignId]);
  }
}
