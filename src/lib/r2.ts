import type { Env } from "../middleware/auth";
import { SourceObjectNotFoundError } from "@/lib/errors";

export interface R2Object {
  key: string;
  size: number;
  etag: string;
  uploaded: Date;
  httpMetadata?: {
    contentType?: string;
  };
}

export class R2Helper {
  constructor(private env: Env) {}

  /**
   * Get an object from R2
   */
  async get(key: string): Promise<ArrayBuffer | null> {
    const object = await this.env.R2.get(key);
    if (!object) {
      return null;
    }

    return await object.arrayBuffer();
  }

  /**
   * Put an object to R2
   */
  async put(
    key: string,
    content: ArrayBuffer,
    contentType: string = "application/octet-stream"
  ): Promise<void> {
    await this.env.R2.put(key, content, {
      httpMetadata: { contentType },
    });

    console.log(`[R2Helper] Put object: ${key} (${content.byteLength} bytes)`);
  }

  /**
   * Head an object (get metadata without content)
   */
  async head(key: string): Promise<R2Object | null> {
    const object = await this.env.R2.head(key);
    if (!object) {
      return null;
    }

    return {
      key: object.key,
      size: object.size,
      etag: object.etag,
      uploaded: object.uploaded,
      httpMetadata: object.httpMetadata,
    };
  }

  /**
   * Delete an object from R2
   */
  async delete(key: string): Promise<void> {
    await this.env.R2.delete(key);
    console.log(`[R2Helper] Deleted object: ${key}`);
  }

  /**
   * Move an object from source to destination (copy + delete)
   */
  async move(sourceKey: string, destKey: string): Promise<void> {
    // Copy the object
    const sourceObject = await this.env.R2.get(sourceKey);
    if (!sourceObject) {
      throw new SourceObjectNotFoundError(sourceKey);
    }

    const content = await sourceObject.arrayBuffer();
    const contentType =
      sourceObject.httpMetadata?.contentType || "application/octet-stream";

    // Put to destination
    await this.put(destKey, content, contentType);

    // Delete source
    await this.delete(sourceKey);

    console.log(`[R2Helper] Moved object: ${sourceKey} → ${destKey}`);
  }

  /**
   * Copy an object from source to destination
   */
  async copy(sourceKey: string, destKey: string): Promise<void> {
    const sourceObject = await this.env.R2.get(sourceKey);
    if (!sourceObject) {
      throw new SourceObjectNotFoundError(sourceKey);
    }

    const content = await sourceObject.arrayBuffer();
    const contentType =
      sourceObject.httpMetadata?.contentType || "application/octet-stream";

    await this.put(destKey, content, contentType);

    console.log(`[R2Helper] Copied object: ${sourceKey} → ${destKey}`);
  }

  /**
   * Check if an object exists
   */
  async exists(key: string): Promise<boolean> {
    const object = await this.head(key);
    return object !== null;
  }

  /**
   * Get object size
   */
  async getSize(key: string): Promise<number | null> {
    const object = await this.head(key);
    return object?.size || null;
  }

  /**
   * Get object content type
   */
  async getContentType(key: string): Promise<string | null> {
    const object = await this.head(key);
    return object?.httpMetadata?.contentType || null;
  }

  /**
   * Clean up old objects in staging (older than specified hours)
   */
  async cleanupOldStagingObjects(hours: number = 24): Promise<number> {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    let deletedCount = 0;
    let cursor: string | undefined;

    do {
      const listResult = await this.env.R2.list({
        prefix: "staging/",
        cursor,
        limit: 1000,
      });

      for (const object of listResult.objects) {
        if (object.uploaded < cutoffTime) {
          await this.delete(object.key);
          deletedCount++;
        }
      }

      cursor = listResult.truncated ? listResult.cursor : undefined;
    } while (cursor);

    console.log(`[R2Helper] Cleaned up ${deletedCount} old staging objects`);
    return deletedCount;
  }

  /**
   * Get bucket statistics
   */
  async getBucketStats(): Promise<{
    staging: { objectCount: number; totalSize: number };
    library: { objectCount: number; totalSize: number };
  }> {
    // Get staging stats
    let stagingObjects = 0;
    let stagingSize = 0;
    let cursor: string | undefined;

    do {
      const listResult = await this.env.R2.list({
        prefix: "staging/",
        cursor,
        limit: 1000,
      });

      stagingObjects += listResult.objects.length;
      stagingSize += listResult.objects.reduce((sum, obj) => sum + obj.size, 0);

      cursor = listResult.truncated ? listResult.cursor : undefined;
    } while (cursor);

    // Get library stats
    let libraryObjects = 0;
    let librarySize = 0;
    cursor = undefined;

    do {
      const listResult = await this.env.R2.list({
        prefix: "library/",
        cursor,
        limit: 1000,
      });

      libraryObjects += listResult.objects.length;
      librarySize += listResult.objects.reduce((sum, obj) => sum + obj.size, 0);

      cursor = listResult.truncated ? listResult.cursor : undefined;
    } while (cursor);

    return {
      staging: { objectCount: stagingObjects, totalSize: stagingSize },
      library: { objectCount: libraryObjects, totalSize: librarySize },
    };
  }
}
