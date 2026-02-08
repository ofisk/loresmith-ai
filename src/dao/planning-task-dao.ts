import { BaseDAOClass } from "./base-dao";

export type PlanningTaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "superseded";

export interface PlanningTaskRecord {
  id: string;
  campaignId: string;
  title: string;
  description: string | null;
  status: PlanningTaskStatus;
  sourceMessageId: string | null;
  linkedShardId: string | null;
  completionNotes: string | null;
  /** Next upcoming session this step is for (e.g. 3 if session 2 was played). */
  targetSessionNumber: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlanningTaskInput {
  title: string;
  description?: string | null;
  status?: PlanningTaskStatus;
  sourceMessageId?: string | null;
  targetSessionNumber?: number | null;
}

export class PlanningTaskDAO extends BaseDAOClass {
  async listByCampaign(
    campaignId: string,
    options?: { status?: PlanningTaskStatus[] }
  ): Promise<PlanningTaskRecord[]> {
    const { status } = options ?? {};

    let sql = `
      SELECT
        id,
        campaign_id as campaignId,
        title,
        description,
        status,
        source_message_id as sourceMessageId,
        linked_shard_id as linkedShardId,
        completion_notes as completionNotes,
        target_session_number as targetSessionNumber,
        created_at as createdAt,
        updated_at as updatedAt
      FROM planning_tasks
      WHERE campaign_id = ?
    `;

    const params: unknown[] = [campaignId];

    if (status && status.length > 0) {
      const placeholders = status.map(() => "?").join(", ");
      sql += ` AND status IN (${placeholders})`;
      params.push(...status);
    }

    sql += " ORDER BY created_at DESC";

    return this.queryAll<PlanningTaskRecord>(sql, params);
  }

  async createPlanningTask(
    campaignId: string,
    input: CreatePlanningTaskInput
  ): Promise<PlanningTaskRecord> {
    const id = crypto.randomUUID();
    const {
      title,
      description = null,
      status = "pending",
      sourceMessageId = null,
      targetSessionNumber = null,
    } = input;

    const sql = `
      INSERT INTO planning_tasks (
        id,
        campaign_id,
        title,
        description,
        status,
        source_message_id,
        target_session_number,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;

    await this.execute(sql, [
      id,
      campaignId,
      title,
      description,
      status,
      sourceMessageId,
      targetSessionNumber,
    ]);

    const [record] = await this.listByCampaign(campaignId, {
      status: [status],
    });
    // The above listByCampaign returns records ordered by created_at desc,
    // so the first row should be the one we just inserted with this status.
    // To be safe, fall back to getById if needed.
    if (!record) {
      return this.getById(id);
    }

    return record;
  }

  async bulkCreatePlanningTasks(
    campaignId: string,
    tasks: CreatePlanningTaskInput[],
    sourceMessageId?: string | null
  ): Promise<PlanningTaskRecord[]> {
    const created: PlanningTaskRecord[] = [];

    for (const task of tasks) {
      const record = await this.createPlanningTask(campaignId, {
        ...task,
        sourceMessageId: task.sourceMessageId ?? sourceMessageId ?? null,
      });
      created.push(record);
    }

    return created;
  }

  async updateStatus(
    id: string,
    status: PlanningTaskStatus,
    linkedShardId?: string | null,
    completionNotes?: string | null
  ): Promise<void> {
    const sql = `
      UPDATE planning_tasks
      SET status = ?, linked_shard_id = COALESCE(?, linked_shard_id), completion_notes = COALESCE(?, completion_notes), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    await this.execute(sql, [
      status,
      linkedShardId ?? null,
      completionNotes ?? null,
      id,
    ]);
  }

  async updateTask(
    id: string,
    campaignId: string,
    updates: {
      title?: string;
      description?: string | null;
      status?: PlanningTaskStatus;
      targetSessionNumber?: number | null;
    }
  ): Promise<void> {
    const fields: string[] = [];
    const params: unknown[] = [];

    if (updates.title !== undefined) {
      fields.push("title = ?");
      params.push(updates.title);
    }

    if (updates.description !== undefined) {
      fields.push("description = ?");
      params.push(updates.description);
    }

    if (updates.status !== undefined) {
      fields.push("status = ?");
      params.push(updates.status);
    }

    if (updates.targetSessionNumber !== undefined) {
      fields.push("target_session_number = ?");
      params.push(updates.targetSessionNumber);
    }

    if (fields.length === 0) {
      return;
    }

    const sql = `
      UPDATE planning_tasks
      SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND campaign_id = ?
    `;
    params.push(id, campaignId);
    await this.execute(sql, params);
  }

  async markSupersededForCampaign(campaignId: string): Promise<void> {
    const sql = `
      UPDATE planning_tasks
      SET status = 'superseded', updated_at = CURRENT_TIMESTAMP
      WHERE campaign_id = ? AND status IN ('pending', 'in_progress')
    `;

    await this.execute(sql, [campaignId]);
  }

  async deleteTask(id: string): Promise<void> {
    const sql = `DELETE FROM planning_tasks WHERE id = ?`;
    await this.execute(sql, [id]);
  }

  async getById(id: string): Promise<PlanningTaskRecord> {
    const sql = `
      SELECT
        id,
        campaign_id as campaignId,
        title,
        description,
        status,
        source_message_id as sourceMessageId,
        linked_shard_id as linkedShardId,
        completion_notes as completionNotes,
        target_session_number as targetSessionNumber,
        created_at as createdAt,
        updated_at as updatedAt
      FROM planning_tasks
      WHERE id = ?
    `;
    const record = await this.queryFirst<PlanningTaskRecord>(sql, [id]);
    if (!record) {
      throw new Error(`Planning task not found: ${id}`);
    }
    return record;
  }
}
