import { generateId } from "ai";
import type {
  D1Database,
  R2Bucket,
  VectorizeIndex,
} from "@cloudflare/workers-types";
import { ChangelogArchiveDAO } from "@/dao/changelog-archive-dao";
import type {
  ChangelogArchiveFile,
  ChangelogArchiveMetadata,
  CreateChangelogArchiveMetadataInput,
} from "@/types/changelog-archive";
import type { WorldStateChangelogEntry } from "@/types/world-state";
import { WorldStateChangelogDAO } from "@/dao/world-state-changelog-dao";
import { PlanningContextService } from "@/services/rag/planning-context-service";
import { R2Helper } from "@/lib/r2";

export interface ChangelogArchiveServiceOptions {
  db: D1Database;
  r2: R2Bucket;
  vectorize?: VectorizeIndex;
  openaiApiKey?: string;
  env?: any;
  archiveDAO?: ChangelogArchiveDAO;
  changelogDAO?: WorldStateChangelogDAO;
  planningContextService?: PlanningContextService;
}

export class ChangelogArchiveService {
  private readonly archiveDAO: ChangelogArchiveDAO;
  private readonly changelogDAO: WorldStateChangelogDAO;
  private readonly r2Helper: R2Helper;
  private readonly planningContextService?: PlanningContextService;

  constructor(options: ChangelogArchiveServiceOptions) {
    this.archiveDAO = options.archiveDAO ?? new ChangelogArchiveDAO(options.db);
    this.changelogDAO =
      options.changelogDAO ?? new WorldStateChangelogDAO(options.db);
    this.r2Helper = new R2Helper(options.env);

    if (options.vectorize && options.openaiApiKey) {
      this.planningContextService = new PlanningContextService(
        options.db,
        options.vectorize,
        options.openaiApiKey,
        options.env
      );
    }
  }

  /**
   * Archive changelog entries after a rebuild
   * Moves entries from D1 to R2, creates metadata, generates embeddings, and deletes from D1
   */
  async archiveChangelogEntries(
    entryIds: string[],
    rebuildId: string,
    campaignId: string
  ): Promise<ChangelogArchiveMetadata> {
    if (entryIds.length === 0) {
      throw new Error("Cannot archive empty entry list");
    }

    console.log(
      `[ChangelogArchive] Archiving ${entryIds.length} entries for rebuild ${rebuildId}`
    );

    // Get entries from D1
    const entries = await this.changelogDAO.listEntriesForCampaign(campaignId, {
      limit: entryIds.length * 2, // Get more to filter by IDs
    });

    const entriesToArchive = entries.filter((entry) =>
      entryIds.includes(entry.id)
    );

    if (entriesToArchive.length === 0) {
      throw new Error(
        `No entries found to archive for IDs: ${entryIds.join(", ")}`
      );
    }

    // Calculate session and timestamp ranges
    const sessionIds = entriesToArchive
      .map((e) => e.campaignSessionId)
      .filter((id): id is number => id !== null);
    const sessionRange = {
      min: sessionIds.length > 0 ? Math.min(...sessionIds) : null,
      max: sessionIds.length > 0 ? Math.max(...sessionIds) : null,
    };

    const timestamps = entriesToArchive.map((e) => e.timestamp);
    const timestampRange = {
      from:
        timestamps.length > 0 ? timestamps.sort()[0] : new Date().toISOString(),
      to:
        timestamps.length > 0
          ? timestamps.sort()[timestamps.length - 1]
          : new Date().toISOString(),
    };

    // Create archive file structure
    const archiveFile: ChangelogArchiveFile = {
      rebuildId,
      campaignId,
      entries: entriesToArchive.map((entry) => ({
        id: entry.id,
        campaignSessionId: entry.campaignSessionId,
        timestamp: entry.timestamp,
        payload: entry.payload,
        impactScore: entry.impactScore,
        createdAt: entry.createdAt,
      })),
      sessionRange,
      timestampRange,
    };

    // Compress and store in R2
    const archiveKey = `changelog-archive/${campaignId}/${rebuildId}.json.gz`;
    const jsonContent = JSON.stringify(archiveFile);
    const jsonBuffer = new TextEncoder().encode(jsonContent);

    // Compress using CompressionStream
    const compressionStream = new CompressionStream("gzip");
    const writer = compressionStream.writable.getWriter();
    const reader = compressionStream.readable.getReader();

    writer.write(jsonBuffer);
    writer.close();

    const chunks: Uint8Array[] = [];
    let done = false;
    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        chunks.push(value);
      }
    }

    const compressedBuffer = new Uint8Array(
      chunks.reduce((acc, chunk) => acc + chunk.length, 0)
    );
    let offset = 0;
    for (const chunk of chunks) {
      compressedBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    await this.r2Helper.put(
      archiveKey,
      compressedBuffer.buffer,
      "application/gzip"
    );

    console.log(
      `[ChangelogArchive] Stored archive to R2: ${archiveKey} (${compressedBuffer.length} bytes compressed from ${jsonBuffer.length} bytes)`
    );

    // Create metadata in D1
    const metadataId = generateId();
    const metadataInput: CreateChangelogArchiveMetadataInput = {
      id: metadataId,
      campaignId,
      rebuildId,
      archiveKey,
      sessionRange,
      timestampRange,
      entryCount: entriesToArchive.length,
    };

    await this.archiveDAO.createArchiveMetadata(metadataInput);

    // Generate embeddings for archived entries
    if (this.planningContextService) {
      console.log(
        `[ChangelogArchive] Generating embeddings for ${entriesToArchive.length} archived entries`
      );
      for (const entry of entriesToArchive) {
        try {
          await this.planningContextService.indexChangelogEntry(entry, {
            archived: true,
            archiveKey,
            r2Key: archiveKey,
          });
        } catch (error) {
          console.error(
            `[ChangelogArchive] Failed to index archived entry ${entry.id}:`,
            error
          );
          // Continue with other entries even if one fails
        }
      }
    }

    // Delete entries from D1
    await this.changelogDAO.deleteEntries(entryIds);

    console.log(
      `[ChangelogArchive] Successfully archived ${entriesToArchive.length} entries and deleted from D1`
    );

    const metadata = await this.archiveDAO.getArchiveMetadataByKey(archiveKey);
    if (!metadata) {
      throw new Error("Failed to retrieve created archive metadata");
    }

    return metadata;
  }

  /**
   * Get archived entries from R2
   */
  async getArchivedEntries(
    campaignId: string,
    options: {
      campaignSessionId?: number;
      fromTimestamp?: string;
      toTimestamp?: string;
    } = {}
  ): Promise<WorldStateChangelogEntry[]> {
    // Query metadata to find relevant archives
    const metadataList = await this.archiveDAO.getArchiveMetadata(campaignId, {
      campaignSessionId: options.campaignSessionId,
      fromTimestamp: options.fromTimestamp,
      toTimestamp: options.toTimestamp,
    });

    const allEntries: WorldStateChangelogEntry[] = [];

    for (const metadata of metadataList) {
      try {
        // Load and decompress archive from R2
        const compressedData = await this.r2Helper.get(metadata.archiveKey);
        if (!compressedData) {
          console.warn(
            `[ChangelogArchive] Archive not found in R2: ${metadata.archiveKey}`
          );
          continue;
        }

        // Decompress using DecompressionStream
        const decompressionStream = new DecompressionStream("gzip");
        const writer = decompressionStream.writable.getWriter();
        const reader = decompressionStream.readable.getReader();

        writer.write(compressedData);
        writer.close();

        const chunks: Uint8Array[] = [];
        let done = false;
        while (!done) {
          const { value, done: readerDone } = await reader.read();
          done = readerDone;
          if (value) {
            chunks.push(value);
          }
        }

        const decompressedBuffer = new Uint8Array(
          chunks.reduce((acc, chunk) => acc + chunk.length, 0)
        );
        let offset = 0;
        for (const chunk of chunks) {
          decompressedBuffer.set(chunk, offset);
          offset += chunk.length;
        }

        const jsonText = new TextDecoder().decode(decompressedBuffer);
        const archiveFile: ChangelogArchiveFile = JSON.parse(jsonText);

        // Filter entries by session/timestamp if specified
        let filteredEntries = archiveFile.entries;
        if (options.campaignSessionId !== undefined) {
          filteredEntries = filteredEntries.filter(
            (e) => e.campaignSessionId === options.campaignSessionId
          );
        }
        if (options.fromTimestamp) {
          filteredEntries = filteredEntries.filter(
            (e) => e.timestamp >= options.fromTimestamp!
          );
        }
        if (options.toTimestamp) {
          filteredEntries = filteredEntries.filter(
            (e) => e.timestamp <= options.toTimestamp!
          );
        }

        // Convert to WorldStateChangelogEntry format
        const entries: WorldStateChangelogEntry[] = filteredEntries.map(
          (e) => ({
            id: e.id,
            campaignId: archiveFile.campaignId,
            campaignSessionId: e.campaignSessionId,
            timestamp: e.timestamp,
            payload: e.payload,
            impactScore: e.impactScore,
            appliedToGraph: true, // All archived entries were applied
            createdAt: e.createdAt,
          })
        );

        allEntries.push(...entries);
      } catch (error) {
        console.error(
          `[ChangelogArchive] Failed to load archive ${metadata.archiveKey}:`,
          error
        );
        // Continue with other archives even if one fails
      }
    }

    // Sort by timestamp
    allEntries.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return allEntries;
  }

  /**
   * Delete archived changelog (for restoration support)
   */
  async deleteArchivedChangelog(archiveKey: string): Promise<void> {
    await this.r2Helper.delete(archiveKey);
    await this.archiveDAO.deleteArchiveMetadata(archiveKey);
    console.log(`[ChangelogArchive] Deleted archive: ${archiveKey}`);
  }
}
