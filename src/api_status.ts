import type { Context } from "hono";
import { AutoRAGClient } from "./lib/autorag";
import { R2Helper } from "./lib/r2";
import type { Env } from "./middleware/auth";

// Extend the context to include userAuth
type ContextWithAuth = Context<{
  Bindings: Env;
  Variables: { userAuth: any };
}>;

/**
 * GET /ingestion/status
 * Check AutoRAG ingestion status by tenant and document
 */
export async function handleIngestionStatus(c: ContextWithAuth) {
  try {
    const tenant = c.req.query("tenant");
    const doc = c.req.query("doc");

    if (!tenant || !doc) {
      return c.json(
        {
          error: "Missing required parameters: tenant, doc",
          usage: "GET /ingestion/status?tenant=<tenant>&doc=<document>",
        },
        400
      );
    }

    const r2Helper = new R2Helper(c.env);
    const autoragClient = new AutoRAGClient(c.env.AUTORAG_SEARCH_URL);

    // Check if manifest exists for the document
    const manifestKey = `autorag/${tenant}/manifests/${doc}.manifest.json`;
    const manifestExists = await r2Helper.exists(manifestKey);

    if (!manifestExists) {
      // Check if single file exists in AutoRAG
      const singleFileKey = `autorag/${tenant}/${doc}`;
      const singleFileExists = await r2Helper.exists(singleFileKey);

      if (singleFileExists) {
        // Single file exists, check AutoRAG status
        const status = await autoragClient.checkStatus(`file:${singleFileKey}`);

        return c.json({
          status: status.status,
          message: status.message,
          tenant,
          doc,
          type: "single_file",
          singleFileKey,
          lastUpdate: status.lastUpdate,
          timestamp: new Date().toISOString(),
        });
      } else {
        // Check if file is still in staging
        const stagingKey = `staging/${tenant}/${doc}`;
        const stagingExists = await r2Helper.exists(stagingKey);

        if (stagingExists) {
          return c.json({
            status: "processing",
            message: "File is in staging, waiting for processing",
            tenant,
            doc,
            type: "staging",
            stagingKey,
            timestamp: new Date().toISOString(),
          });
        } else {
          return c.json({
            status: "not_found",
            message: "File not found in staging or AutoRAG",
            tenant,
            doc,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    // Manifest exists, read it to get probe token and shard info
    const manifestContent = await r2Helper.get(manifestKey);
    if (!manifestContent) {
      return c.json({
        status: "error",
        message: "Manifest exists but could not be read",
        tenant,
        doc,
        manifestKey,
        timestamp: new Date().toISOString(),
      });
    }

    const manifest = JSON.parse(new TextDecoder().decode(manifestContent)) as {
      probeToken: string;
      shardCount: number;
      shards: Array<{ key: string; size: number; contentType: string }>;
    };
    const { probeToken, shardCount, shards } = manifest;

    // Check AutoRAG status using probe token
    const status = await autoragClient.checkStatus(probeToken, shardCount);

    // Verify all shards exist
    let existingShards = 0;
    for (const shard of shards as Array<{ key: string }>) {
      if (await r2Helper.exists(shard.key)) {
        existingShards++;
      }
    }

    return c.json({
      status: status.status,
      message: status.message,
      tenant,
      doc,
      type: "split_file",
      manifestKey,
      probeToken,
      shardCount,
      existingShards,
      expectedShards: status.expectedShards,
      lastUpdate: status.lastUpdate,
      shards: shards.map((shard) => ({
        key: shard.key,
        size: shard.size,
        contentType: shard.contentType,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[StatusAPI] Error checking ingestion status:", error);
    return c.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
}

/**
 * GET /ingestion/health
 * Check AutoRAG service health
 */
export async function handleIngestionHealth(c: ContextWithAuth) {
  try {
    const autoragClient = new AutoRAGClient(c.env.AUTORAG_SEARCH_URL);
    const health = await autoragClient.getHealth();

    return c.json({
      service: "autorag-ingestion",
      status: health.status,
      message: health.message,
      timestamp: health.timestamp,
    });
  } catch (error) {
    console.error("[StatusAPI] Error checking health:", error);
    return c.json(
      {
        service: "autorag-ingestion",
        status: "unhealthy",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
}

/**
 * GET /ingestion/stats
 * Get processing statistics
 */
export async function handleIngestionStats(c: ContextWithAuth) {
  try {
    const r2Helper = new R2Helper(c.env);
    const stats = await r2Helper.getBucketStats();

    return c.json({
      staging: {
        objectCount: stats.staging.objectCount,
        totalSizeBytes: stats.staging.totalSize,
        totalSizeMB:
          Math.round((stats.staging.totalSize / (1024 * 1024)) * 100) / 100,
      },
      autorag: {
        objectCount: stats.autorag.objectCount,
        totalSizeBytes: stats.autorag.totalSize,
        totalSizeMB:
          Math.round((stats.autorag.totalSize / (1024 * 1024)) * 100) / 100,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[StatusAPI] Error getting stats:", error);
    return c.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
}
