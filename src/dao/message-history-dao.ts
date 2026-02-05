import { BaseDAOClass } from "./base-dao";

export interface ChatMessageRecord {
  id: string;
  sessionId: string;
  username: string | null;
  campaignId: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  messageData: string | null; // JSON string of additional message data
  createdAt: string;
}

export interface CreateMessageInput {
  sessionId: string;
  username?: string | null;
  campaignId?: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  messageData?: Record<string, unknown> | null;
}

export interface GetMessagesOptions {
  sessionId?: string; // Optional - if not provided, can query by campaignId or username alone
  username?: string;
  campaignId?: string | null;
  role?: "user" | "assistant" | "system";
  limit?: number;
  offset?: number;
  beforeDate?: string; // ISO date string
  afterDate?: string; // ISO date string
  searchQuery?: string; // Search in content
}

export class MessageHistoryDAO extends BaseDAOClass {
  /**
   * Maximum number of messages to keep per session (to limit storage costs)
   * Only the most recent N messages are retained. Kept high so chat history
   * is preserved across page refreshes.
   */
  private readonly MAX_MESSAGES_PER_SESSION = 100;

  /**
   * Store a chat message in the database
   * Automatically trims old messages to keep only the most recent N messages per session
   */
  async createMessage(input: CreateMessageInput): Promise<void> {
    const messageDataJson = input.messageData
      ? JSON.stringify(input.messageData)
      : null;

    const sql = `
      INSERT INTO message_history (
        id,
        session_id,
        username,
        campaign_id,
        role,
        content,
        message_data,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    await this.execute(sql, [
      messageId,
      input.sessionId,
      input.username || null,
      input.campaignId || null,
      input.role,
      input.content,
      messageDataJson,
    ]);

    // Automatically trim old messages to keep only the most recent N messages per session
    await this.trimSessionMessages(
      input.sessionId,
      this.MAX_MESSAGES_PER_SESSION
    );
  }

  /**
   * Trim messages for a session to keep only the most recent N messages
   * Deletes older messages to limit storage costs
   */
  async trimSessionMessages(
    sessionId: string,
    keepCount: number = this.MAX_MESSAGES_PER_SESSION
  ): Promise<void> {
    // First, get total count before trimming (for logging)
    const countSql = `
      SELECT COUNT(*) as count
      FROM message_history
      WHERE session_id = ?
    `;
    const countResult = await this.queryFirst<{ count: number }>(countSql, [
      sessionId,
    ]);
    const totalCount = countResult?.count || 0;

    if (totalCount <= keepCount) {
      return; // No trimming needed
    }

    // Get the IDs of the most recent N messages for this session
    const sql = `
      SELECT id
      FROM message_history
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `;

    const keepIds = await this.queryAll<{ id: string }>(sql, [
      sessionId,
      keepCount,
    ]);

    if (keepIds.length === 0) {
      return; // No messages to keep
    }

    const keepIdList = keepIds.map((r) => r.id);

    // Delete all messages for this session that are NOT in the keep list
    // Use parameterized query with placeholders
    const placeholders = keepIdList.map(() => "?").join(",");
    const deleteSql = `
      DELETE FROM message_history
      WHERE session_id = ? AND id NOT IN (${placeholders})
    `;

    await this.execute(deleteSql, [sessionId, ...keepIdList]);

    const deletedCount = totalCount - keepIds.length;
    if (deletedCount > 0) {
      console.log(
        `[MessageHistoryDAO] Trimmed ${deletedCount} old message(s) for session ${sessionId} (kept ${keepIds.length} most recent)`
      );
    }
  }

  /**
   * Get messages for a session with optional filters
   */
  async getMessages(options: GetMessagesOptions): Promise<ChatMessageRecord[]> {
    const conditions: string[] = [];
    const params: any[] = [];

    // sessionId is optional - can query by campaignId or username alone
    if (options.sessionId) {
      conditions.push("session_id = ?");
      params.push(options.sessionId);
    }

    if (options.username) {
      conditions.push("username = ?");
      params.push(options.username);
    }

    if (options.campaignId !== undefined) {
      if (options.campaignId === null) {
        conditions.push("campaign_id IS NULL");
      } else {
        conditions.push("campaign_id = ?");
        params.push(options.campaignId);
      }
    }

    if (options.role) {
      conditions.push("role = ?");
      params.push(options.role);
    }

    if (options.beforeDate) {
      conditions.push("created_at < ?");
      params.push(options.beforeDate);
    }

    if (options.afterDate) {
      conditions.push("created_at > ?");
      params.push(options.afterDate);
    }

    if (options.searchQuery) {
      conditions.push("content LIKE ?");
      params.push(`%${options.searchQuery}%`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const sql = `
      SELECT 
        id,
        session_id as sessionId,
        username,
        campaign_id as campaignId,
        role,
        content,
        message_data as messageData,
        created_at as createdAt
      FROM message_history
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    params.push(limit, offset);

    const results = await this.queryAll<ChatMessageRecord>(sql, params);
    // Reverse to get chronological order (oldest first)
    return results.reverse();
  }

  /**
   * Get recent messages for a session (last N messages)
   */
  async getRecentMessages(
    sessionId: string,
    limit: number = 10
  ): Promise<ChatMessageRecord[]> {
    return this.getMessages({ sessionId, limit });
  }

  /**
   * Get messages by campaign ID
   */
  async getMessagesByCampaign(
    campaignId: string,
    limit: number = 50
  ): Promise<ChatMessageRecord[]> {
    return this.getMessages({ campaignId, limit });
  }

  /**
   * Delete old messages (cleanup utility)
   */
  async deleteOldMessages(olderThanDays: number = 90): Promise<number> {
    const sql = `
      DELETE FROM message_history
      WHERE created_at < datetime('now', '-' || ? || ' days')
    `;

    await this.execute(sql, [olderThanDays]);
    // Note: SQLite doesn't return affected rows directly, but we can estimate
    return 0; // Return value not critical for cleanup
  }
}
