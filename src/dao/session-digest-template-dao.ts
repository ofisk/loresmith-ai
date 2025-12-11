import { BaseDAOClass } from "./base-dao";
import type {
  SessionDigestTemplate,
  SessionDigestTemplateRecord,
  CreateSessionDigestTemplateInput,
  UpdateSessionDigestTemplateInput,
  SessionDigestData,
} from "@/types/session-digest";
import { validateSessionDigestData } from "@/types/session-digest";

export class SessionDigestTemplateDAO extends BaseDAOClass {
  /**
   * Create a new session digest template
   */
  async createTemplate(
    id: string,
    input: CreateSessionDigestTemplateInput
  ): Promise<void> {
    let templateDataJson: string;
    try {
      templateDataJson = JSON.stringify(input.templateData);
    } catch (error) {
      console.error(
        "[SessionDigestTemplateDAO] JSON serialization error:",
        error
      );
      throw new Error(
        `Failed to serialize template data: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    const sql = `
      INSERT INTO session_digest_templates (
        id,
        campaign_id,
        name,
        description,
        template_data,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;

    try {
      await this.execute(sql, [
        id,
        input.campaignId,
        input.name,
        input.description || null,
        templateDataJson,
      ]);
    } catch (error) {
      console.error("[SessionDigestTemplateDAO] Insert error:", {
        id,
        campaignId: input.campaignId,
        name: input.name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get a template by ID
   */
  async getTemplateById(
    templateId: string
  ): Promise<SessionDigestTemplate | null> {
    const sql = `
      SELECT *
      FROM session_digest_templates
      WHERE id = ?
    `;

    const record = await this.queryFirst<SessionDigestTemplateRecord>(sql, [
      templateId,
    ]);
    if (!record) {
      return null;
    }

    return this.mapRecord(record);
  }

  /**
   * Get all templates for a campaign
   */
  async getTemplatesByCampaign(
    campaignId: string
  ): Promise<SessionDigestTemplate[]> {
    const sql = `
      SELECT *
      FROM session_digest_templates
      WHERE campaign_id = ?
      ORDER BY name ASC, created_at DESC
    `;

    const records = await this.queryAll<SessionDigestTemplateRecord>(sql, [
      campaignId,
    ]);
    return records.map((record) => this.mapRecord(record));
  }

  /**
   * Update a template
   */
  async updateTemplate(
    templateId: string,
    input: UpdateSessionDigestTemplateInput
  ): Promise<void> {
    const updates: string[] = [];
    const params: any[] = [];

    if (input.name !== undefined) {
      updates.push("name = ?");
      params.push(input.name);
    }

    if (input.description !== undefined) {
      updates.push("description = ?");
      params.push(input.description ?? null);
    }

    if (input.templateData !== undefined) {
      updates.push("template_data = ?");
      params.push(JSON.stringify(input.templateData));
    }

    if (updates.length === 0) {
      return;
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(templateId);

    const sql = `
      UPDATE session_digest_templates
      SET ${updates.join(", ")}
      WHERE id = ?
    `;

    await this.execute(sql, params);
  }

  /**
   * Delete a template
   */
  async deleteTemplate(templateId: string): Promise<void> {
    const sql = "DELETE FROM session_digest_templates WHERE id = ?";
    await this.execute(sql, [templateId]);
  }

  /**
   * Map database record to SessionDigestTemplate
   */
  private mapRecord(
    record: SessionDigestTemplateRecord
  ): SessionDigestTemplate {
    let templateData: SessionDigestData;
    try {
      const parsed = JSON.parse(record.template_data);
      if (!validateSessionDigestData(parsed)) {
        throw new Error("Invalid template data structure");
      }
      templateData = parsed;
    } catch (error) {
      console.error(
        "[SessionDigestTemplateDAO] Failed to parse template_data:",
        error,
        record
      );
      // Return empty structure if parsing fails
      templateData = {
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
      name: record.name,
      description: record.description,
      templateData,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    };
  }
}
