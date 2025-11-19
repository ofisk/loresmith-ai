import { BaseDAOClass } from "./base-dao";
import type {
  CreateSessionDigestInput,
  SessionDigest,
  SessionDigestData,
  SessionDigestWithData,
  UpdateSessionDigestInput,
} from "@/types/session-digest";
import { validateSessionDigestData } from "@/types/session-digest";

export class SessionDigestDAO extends BaseDAOClass {
  /**
   * Create a new session digest
   */
  async createSessionDigest(
    id: string,
    input: CreateSessionDigestInput
  ): Promise<void> {
    let digestDataJson: string;
    try {
      digestDataJson = JSON.stringify(input.digestData);
    } catch (error) {
      console.error("[SessionDigestDAO] JSON serialization error:", error);
      throw new Error(
        `Failed to serialize digest data: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    const sql = `
      INSERT INTO session_digests (
        id,
        campaign_id,
        session_number,
        session_date,
        digest_data,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;

    try {
      await this.execute(sql, [
        id,
        input.campaignId,
        input.sessionNumber,
        input.sessionDate || null,
        digestDataJson,
      ]);
    } catch (error) {
      console.error("[SessionDigestDAO] Insert error:", {
        id,
        campaignId: input.campaignId,
        sessionNumber: input.sessionNumber,
        sessionDate: input.sessionDate,
        digestDataSize: digestDataJson.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get a session digest by ID
   */
  async getSessionDigestById(
    digestId: string
  ): Promise<SessionDigestWithData | null> {
    const sql = `
      SELECT 
        id,
        campaign_id,
        session_number,
        session_date,
        digest_data,
        created_at,
        updated_at
      FROM session_digests
      WHERE id = ?
    `;

    const record = await this.queryFirst<SessionDigest>(sql, [digestId]);
    if (!record) {
      return null;
    }

    return this.mapRecord(record);
  }

  /**
   * Get a session digest by campaign ID and session number
   */
  async getSessionDigestByCampaignAndSession(
    campaignId: string,
    sessionNumber: number
  ): Promise<SessionDigestWithData | null> {
    const sql = `
      SELECT 
        id,
        campaign_id,
        session_number,
        session_date,
        digest_data,
        created_at,
        updated_at
      FROM session_digests
      WHERE campaign_id = ? AND session_number = ?
    `;

    const record = await this.queryFirst<SessionDigest>(sql, [
      campaignId,
      sessionNumber,
    ]);
    if (!record) {
      return null;
    }

    return this.mapRecord(record);
  }

  /**
   * Get all session digests for a campaign
   */
  async getSessionDigestsByCampaign(
    campaignId: string
  ): Promise<SessionDigestWithData[]> {
    const sql = `
      SELECT 
        id,
        campaign_id,
        session_number,
        session_date,
        digest_data,
        created_at,
        updated_at
      FROM session_digests
      WHERE campaign_id = ?
      ORDER BY session_number DESC, created_at DESC
    `;

    const records = await this.queryAll<SessionDigest>(sql, [campaignId]);
    return records.map((record) => this.mapRecord(record));
  }

  /**
   * Get session digests by date range for a campaign
   */
  async getSessionDigestsByDateRange(
    campaignId: string,
    fromDate?: string,
    toDate?: string
  ): Promise<SessionDigestWithData[]> {
    const conditions: string[] = ["campaign_id = ?"];
    const params: any[] = [campaignId];

    if (fromDate) {
      conditions.push("session_date >= ?");
      params.push(fromDate);
    }

    if (toDate) {
      conditions.push("session_date <= ?");
      params.push(toDate);
    }

    const sql = `
      SELECT 
        id,
        campaign_id,
        session_number,
        session_date,
        digest_data,
        created_at,
        updated_at
      FROM session_digests
      WHERE ${conditions.join(" AND ")}
      ORDER BY session_number DESC, created_at DESC
    `;

    const records = await this.queryAll<SessionDigest>(sql, params);
    return records.map((record) => this.mapRecord(record));
  }

  /**
   * Get recent session digests for a campaign
   */
  async getRecentSessionDigests(
    campaignId: string,
    limit: number = 10
  ): Promise<SessionDigestWithData[]> {
    const sql = `
      SELECT 
        id,
        campaign_id,
        session_number,
        session_date,
        digest_data,
        created_at,
        updated_at
      FROM session_digests
      WHERE campaign_id = ?
      ORDER BY session_number DESC, created_at DESC
      LIMIT ?
    `;

    const records = await this.queryAll<SessionDigest>(sql, [
      campaignId,
      limit,
    ]);
    return records.map((record) => this.mapRecord(record));
  }

  /**
   * Get the maximum session number for a campaign
   */
  async getMaxSessionNumber(campaignId: string): Promise<number | null> {
    const sql = `
      SELECT MAX(session_number) as max_session_number
      FROM session_digests
      WHERE campaign_id = ?
    `;

    const result = await this.queryFirst<{ max_session_number: number | null }>(
      sql,
      [campaignId]
    );

    return result?.max_session_number ?? null;
  }

  /**
   * Update a session digest
   */
  async updateSessionDigest(
    digestId: string,
    input: UpdateSessionDigestInput
  ): Promise<void> {
    const updates: string[] = [];
    const params: any[] = [];

    if (input.sessionDate !== undefined) {
      updates.push("session_date = ?");
      params.push(input.sessionDate || null);
    }

    if (input.digestData !== undefined) {
      updates.push("digest_data = ?");
      params.push(JSON.stringify(input.digestData));
    }

    if (updates.length === 0) {
      return;
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(digestId);

    const sql = `
      UPDATE session_digests
      SET ${updates.join(", ")}
      WHERE id = ?
    `;

    await this.execute(sql, params);
  }

  /**
   * Delete a session digest
   */
  async deleteSessionDigest(digestId: string): Promise<void> {
    const sql = "DELETE FROM session_digests WHERE id = ?";
    await this.execute(sql, [digestId]);
  }

  /**
   * Map database record to SessionDigestWithData
   */
  private mapRecord(record: SessionDigest): SessionDigestWithData {
    let digestData: SessionDigestData;
    try {
      const parsed = JSON.parse(record.digest_data);
      if (!validateSessionDigestData(parsed)) {
        throw new Error("Invalid digest data structure");
      }
      digestData = parsed;
    } catch (error) {
      console.error(
        "[SessionDigestDAO] Failed to parse digest_data:",
        error,
        record
      );
      // Return empty structure if parsing fails
      digestData = {
        last_session_recap: {
          key_events: [],
          state_changes: {
            factions: [],
            locations: [],
            npcs: [],
          },
          open_threads: [],
        },
        next_session_plan: {
          objectives_dm: [],
          probable_player_goals: [],
          beats: [],
          if_then_branches: [],
        },
        npcs_to_run: [],
        locations_in_focus: [],
        encounter_seeds: [],
        clues_and_revelations: [],
        treasure_and_rewards: [],
        todo_checklist: [],
      };
    }

    return {
      id: record.id,
      campaignId: record.campaign_id,
      sessionNumber: record.session_number,
      sessionDate: record.session_date,
      digestData,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    };
  }
}
