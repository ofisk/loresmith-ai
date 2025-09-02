import type { D1Database } from "@cloudflare/workers-types";
import { SNIPPET_STATUSES, type SnippetStatus } from "../lib/content-types";
import type { DatabaseSnippet, CreateSnippetData } from "../types/snippet";

export type StagedSnippet = DatabaseSnippet;
export type CreateStagedSnippetData = CreateSnippetData;

export class StagedSnippetsDAO {
  constructor(private db: D1Database) {}

  /**
   * Create a new staged snippet
   */
  async createSnippet(data: CreateStagedSnippetData): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `
      insert into staged_snippets (
        id, campaign_id, resource_id, snippet_type, content, metadata, 
        status, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, 'staged', ?, ?)
    `
      )
      .bind(
        data.id,
        data.campaign_id,
        data.resource_id,
        data.snippet_type,
        data.content,
        data.metadata || null,
        now,
        now
      )
      .run();
  }

  /**
   * Create multiple staged snippets in a batch
   */
  async createStagedSnippets(
    snippets: CreateStagedSnippetData[]
  ): Promise<void> {
    if (snippets.length === 0) return;

    const now = new Date().toISOString();
    const batch = this.db.batch(
      snippets.map((snippet) =>
        this.db
          .prepare(
            `
          insert into staged_snippets (
            id, campaign_id, resource_id, snippet_type, content, metadata, 
            status, created_at, updated_at
          ) values (?, ?, ?, ?, ?, ?, 'staged', ?, ?)
        `
          )
          .bind(
            snippet.id,
            snippet.campaign_id,
            snippet.resource_id,
            snippet.snippet_type,
            snippet.content,
            snippet.metadata || null,
            now,
            now
          )
      )
    );

    await batch;
  }

  /**
   * Get all staged snippets for a campaign
   */
  async getStagedSnippetsByCampaign(
    campaignId: string
  ): Promise<StagedSnippet[]> {
    const result = await this.db
      .prepare(
        `
      select * from staged_snippets 
      where campaign_id = ? and status = ?
      order by created_at desc
    `
      )
      .bind(campaignId, SNIPPET_STATUSES.STAGED)
      .all<StagedSnippet>();

    return result.results || [];
  }

  /**
   * Get all snippets for a campaign (any status)
   */
  async getSnippetsByCampaign(campaignId: string): Promise<StagedSnippet[]> {
    const result = await this.db
      .prepare(
        `
      select * from staged_snippets 
      where campaign_id = ?
      order by created_at desc
    `
      )
      .bind(campaignId)
      .all<StagedSnippet>();

    return result.results || [];
  }

  /**
   * Get snippets by resource
   */
  async getSnippetsByResource(resourceId: string): Promise<StagedSnippet[]> {
    const result = await this.db
      .prepare(
        `
      select * from staged_snippets 
      where resource_id = ?
      order by created_at desc
    `
      )
      .bind(resourceId)
      .all<StagedSnippet>();

    return result.results || [];
  }

  /**
   * Update snippet status (approve/reject)
   */
  async updateSnippetStatus(
    snippetId: string,
    status: SnippetStatus
  ): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `
      update staged_snippets 
      set status = ?, updated_at = ?
      where id = ?
    `
      )
      .bind(status, now, snippetId)
      .run();
  }

  /**
   * Bulk update snippet statuses (approve/reject multiple snippets)
   */
  async bulkUpdateSnippetStatuses(
    snippetIds: string[],
    status: SnippetStatus
  ): Promise<void> {
    if (snippetIds.length === 0) return;

    const now = new Date().toISOString();
    const batch = this.db.batch(
      snippetIds.map((snippetId) =>
        this.db
          .prepare(
            `
          update staged_snippets 
          set status = ?, updated_at = ?
          where id = ?
        `
          )
          .bind(status, now, snippetId)
      )
    );

    await batch;
  }

  /**
   * Delete a snippet
   */
  async deleteSnippet(snippetId: string): Promise<void> {
    await this.db
      .prepare(
        `
      delete from staged_snippets where id = ?
    `
      )
      .bind(snippetId)
      .run();
  }

  /**
   * Delete all snippets for a campaign
   */
  async deleteSnippetsByCampaign(campaignId: string): Promise<void> {
    await this.db
      .prepare(
        `
      delete from staged_snippets where campaign_id = ?
    `
      )
      .bind(campaignId)
      .run();
  }

  /**
   * Delete all snippets for a resource
   */
  async deleteSnippetsByResource(resourceId: string): Promise<void> {
    await this.db
      .prepare(
        `
      delete from staged_snippets where resource_id = ?
    `
      )
      .bind(resourceId)
      .run();
  }

  /**
   * Get snippet by ID
   */
  async getSnippetById(snippetId: string): Promise<StagedSnippet | null> {
    const result = await this.db
      .prepare(
        `
      select * from staged_snippets where id = ?
    `
      )
      .bind(snippetId)
      .first<StagedSnippet>();

    return result || null;
  }

  /**
   * Search snippets by content (for approved snippets)
   */
  async searchApprovedSnippets(
    campaignId: string,
    query: string
  ): Promise<StagedSnippet[]> {
    const result = await this.db
      .prepare(
        `
      select * from staged_snippets 
      where campaign_id = ? and status = ? 
      and (content like ? or snippet_type like ?)
      order by created_at desc
    `
      )
      .bind(campaignId, SNIPPET_STATUSES.APPROVED, `%${query}%`, `%${query}%`)
      .all<StagedSnippet>();

    return result.results || [];
  }
}
