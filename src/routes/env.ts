import type { EnvWithSecrets } from "@/lib/env-utils";
import type { AuthEnv } from "@/services/core/auth-service";

export interface Env extends AuthEnv, EnvWithSecrets {
	JWT_SECRET?: string;
	OPENAI_API_KEY?: unknown;
	R2: R2Bucket;
	DB: D1Database;
	VECTORIZE: VectorizeIndex;
	AI: any;
	CHAT: DurableObjectNamespace;
	UPLOAD_SESSION: DurableObjectNamespace;
	NOTIFICATIONS: DurableObjectNamespace;
	ASSETS: Fetcher;
	FILE_PROCESSING_QUEUE: Queue;
	FILE_PROCESSING_DLQ: Queue;
	GRAPH_REBUILD_QUEUE: Queue;
	SHARD_EMBEDDING_QUEUE?: Queue;
}

/** Prefix path with /api for server route registration */
export const toApiRoutePath = (path: string) =>
	`/api${path.startsWith("/") ? path : `/${path}`}`;
