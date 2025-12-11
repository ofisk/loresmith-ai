import { BaseDAOClass } from "./base-dao";
import type {
  ChangelogArchiveMetadata,
  ChangelogArchiveMetadataRecord,
  ChangelogArchiveQueryOptions,
  CreateChangelogArchiveMetadataInput,
} from "@/types/changelog-archive";

export class ChangelogArchiveDAO extends BaseDAOClass {
  async createArchiveMetadata(
    input: CreateChangelogArchiveMetadataInput
  ): Promise<void> {
    const sql = `
      INSERT INTO changelog_archive_metadata (
        id,
        campaign_id,
        rebuild_id,
        archive_key,
        session_range_min,
        session_range_max,
        timestamp_range_from,
        timestamp_range_to,
        entry_count,
        archived_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
      )
    `;

    await this.execute(sql, [
      input.id,
      input.campaignId,
      input.rebuildId,
      input.archiveKey,
      input.sessionRange.min,
      input.sessionRange.max,
      input.timestampRange.from,
      input.timestampRange.to,
      input.entryCount,
    ]);
  }

  async getArchiveMetadata(
    campaignId: string,
    options: ChangelogArchiveQueryOptions = {}
  ): Promise<ChangelogArchiveMetadata[]> {
    const conditions: string[] = ["campaign_id = ?"];
    const params: any[] = [campaignId];

    if (options.campaignSessionId !== undefined) {
      conditions.push(
        "(session_range_min IS NULL OR session_range_min <= ?) AND (session_range_max IS NULL OR session_range_max >= ?)"
      );
      params.push(options.campaignSessionId, options.campaignSessionId);
    }

    if (options.fromTimestamp) {
      conditions.push("timestamp_range_to >= ?");
      params.push(options.fromTimestamp);
    }

    if (options.toTimestamp) {
      conditions.push("timestamp_range_from <= ?");
      params.push(options.toTimestamp);
    }

    let sql = `
      SELECT 
        id,
        campaign_id,
        rebuild_id,
        archive_key,
        session_range_min,
        session_range_max,
        timestamp_range_from,
        timestamp_range_to,
        entry_count,
        archived_at
      FROM changelog_archive_metadata
      WHERE ${conditions.join(" AND ")}
      ORDER BY timestamp_range_from ASC, archived_at ASC
    `;

    if (typeof options.limit === "number") {
      sql += " LIMIT ?";
      params.push(options.limit);
    }

    if (typeof options.offset === "number") {
      sql += " OFFSET ?";
      params.push(options.offset);
    }

    const records = await this.queryAll<ChangelogArchiveMetadataRecord>(
      sql,
      params
    );
    return records.map((record) => this.mapRecord(record));
  }

  async getArchiveMetadataByKey(
    archiveKey: string
  ): Promise<ChangelogArchiveMetadata | null> {
    const sql = `
      SELECT 
        id,
        campaign_id,
        rebuild_id,
        archive_key,
        session_range_min,
        session_range_max,
        timestamp_range_from,
        timestamp_range_to,
        entry_count,
        archived_at
      FROM changelog_archive_metadata
      WHERE archive_key = ?
    `;

    const record = await this.queryFirst<ChangelogArchiveMetadataRecord>(sql, [
      archiveKey,
    ]);

    return record ? this.mapRecord(record) : null;
  }

  async deleteArchiveMetadata(archiveKey: string): Promise<void> {
    const sql = `
      DELETE FROM changelog_archive_metadata
      WHERE archive_key = ?
    `;

    await this.execute(sql, [archiveKey]);
  }

  private mapRecord(
    record: ChangelogArchiveMetadataRecord
  ): ChangelogArchiveMetadata {
    return {
      id: record.id,
      campaignId: record.campaign_id,
      rebuildId: record.rebuild_id,
      archiveKey: record.archive_key,
      sessionRange: {
        min: record.session_range_min,
        max: record.session_range_max,
      },
      timestampRange: {
        from: record.timestamp_range_from,
        to: record.timestamp_range_to,
      },
      entryCount: record.entry_count,
      archivedAt: record.archived_at,
    };
  }
}
