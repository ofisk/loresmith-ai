import { SourceObjectNotFoundError } from "@/lib/errors";
import type { Env } from "@/middleware/auth";

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
	 * Get an object from R2 as a stream (for large files to avoid loading into memory)
	 */
	async getStream(key: string): Promise<ReadableStream | null> {
		const object = await this.env.R2.get(key);
		return object?.body ?? null;
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

	/** Max keys per R2 batch delete call */
	private static readonly BATCH_DELETE_LIMIT = 1000;

	/**
	 * Clean up old objects in staging (older than specified hours)
	 */
	async cleanupOldStagingObjects(hours: number = 24): Promise<number> {
		const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
		let deletedCount = 0;
		let cursor: string | undefined;
		const keysToDelete: string[] = [];

		const flushDeleteBatch = async () => {
			if (keysToDelete.length === 0) return;
			await this.env.R2.delete(keysToDelete);
			deletedCount += keysToDelete.length;
			keysToDelete.length = 0;
		};

		try {
			do {
				const listResult = await this.env.R2.list({
					prefix: "staging/",
					cursor,
					limit: 1000,
				});

				for (const object of listResult.objects) {
					if (object.uploaded < cutoffTime) {
						keysToDelete.push(object.key);
						if (keysToDelete.length >= R2Helper.BATCH_DELETE_LIMIT) {
							await flushDeleteBatch();
						}
					}
				}

				cursor = listResult.truncated ? listResult.cursor : undefined;
			} while (cursor);

			await flushDeleteBatch();
		} catch (err) {
			throw new Error(
				`R2 cleanupOldStagingObjects failed: ${err instanceof Error ? err.message : String(err)}`
			);
		}
		return deletedCount;
	}

	/**
	 * Get bucket statistics
	 */
	async getBucketStats(): Promise<{
		staging: { objectCount: number; totalSize: number };
		library: { objectCount: number; totalSize: number };
	}> {
		let stagingObjects = 0;
		let stagingSize = 0;
		let libraryObjects = 0;
		let librarySize = 0;
		let cursor: string | undefined;

		try {
			do {
				const listResult = await this.env.R2.list({
					prefix: "staging/",
					cursor,
					limit: 1000,
				});

				stagingObjects += listResult.objects.length;
				stagingSize += listResult.objects.reduce(
					(sum, obj) => sum + obj.size,
					0
				);

				cursor = listResult.truncated ? listResult.cursor : undefined;
			} while (cursor);

			cursor = undefined;

			do {
				const listResult = await this.env.R2.list({
					prefix: "library/",
					cursor,
					limit: 1000,
				});

				libraryObjects += listResult.objects.length;
				librarySize += listResult.objects.reduce(
					(sum, obj) => sum + obj.size,
					0
				);

				cursor = listResult.truncated ? listResult.cursor : undefined;
			} while (cursor);
		} catch (err) {
			throw new Error(
				`R2 getBucketStats failed: ${err instanceof Error ? err.message : String(err)}`
			);
		}

		return {
			staging: { objectCount: stagingObjects, totalSize: stagingSize },
			library: { objectCount: libraryObjects, totalSize: librarySize },
		};
	}
}
