import { SignJWT } from "jose";
import { vi } from "vitest";
import type { Env } from "@/routes/env";

function createMockD1() {
	const mockStmt: {
		bind: ReturnType<typeof vi.fn>;
		all: ReturnType<typeof vi.fn>;
		first: ReturnType<typeof vi.fn>;
		run: ReturnType<typeof vi.fn>;
	} = {
		bind: vi.fn(() => mockStmt),
		all: vi.fn(async () => ({ results: [] })),
		first: vi.fn(async () => null),
		run: vi.fn(async () => ({ meta: { changes: 0 } })),
	};
	return {
		prepare: vi.fn(() => mockStmt),
		batch: vi.fn(async (stmts: unknown[]) =>
			stmts.map(() => ({ meta: { changes: 0 } }))
		),
	} as unknown as D1Database;
}

function createMockR2() {
	return {
		list: vi.fn(async () => ({ objects: [] })),
		head: vi.fn(async () => null),
		put: vi.fn(async () => ({})),
		delete: vi.fn(async () => ({})),
		get: vi.fn(async () => null),
	} as unknown as R2Bucket;
}

function createMockDurableObjectNamespace() {
	const stub = {
		fetch: vi.fn(() => new Response()),
	};
	return {
		idFromName: vi.fn(() => ({ toString: () => "test-id" })),
		get: vi.fn(() => stub),
	} as unknown as DurableObjectNamespace;
}

function createMockQueue() {
	return {
		send: vi.fn(async () => {}),
	} as unknown as Queue;
}

function createMockVectorize() {
	return {} as unknown as VectorizeIndex;
}

function createMockFetcher() {
	return {
		fetch: vi.fn(() => new Response("Not found", { status: 404 })),
	} as unknown as Fetcher;
}

/**
 * Creates a minimal test environment for route integration tests.
 * All bindings are mocks; use vi.mock() in test files to override
 * getDAOFactory, getAuthService, etc. for specific behaviors.
 */
export function createRouteTestEnv(overrides: Partial<Env> = {}): Env {
	const mockChat = createMockDurableObjectNamespace();
	return {
		JWT_SECRET: "test-jwt-secret",
		DB: createMockD1(),
		R2: createMockR2(),
		VECTORIZE: createMockVectorize(),
		AI: null,
		Chat: mockChat,
		CHAT: mockChat,
		UPLOAD_SESSION: createMockDurableObjectNamespace(),
		NOTIFICATIONS: createMockDurableObjectNamespace(),
		ASSETS: createMockFetcher(),
		FILE_PROCESSING_QUEUE: createMockQueue(),
		FILE_PROCESSING_DLQ: createMockQueue(),
		GRAPH_REBUILD_QUEUE: createMockQueue(),
		SHARD_EMBEDDING_QUEUE: createMockQueue(),
		APP_ORIGIN: "http://localhost:5173",
		...overrides,
	} as Env;
}

/**
 *
 * Creates a signed JWT for testing authenticated routes.
 * Use with Authorization: `Bearer ${token}`
 */
export async function createTestJwt(
	secret: string | undefined,
	payload: { username?: string; isAdmin?: boolean } = {}
): Promise<string> {
	const key = new TextEncoder().encode(secret || "test-jwt-secret");
	return new SignJWT({
		type: "user-auth",
		username: payload.username ?? "test-user",
		isAdmin: payload.isAdmin ?? false,
	})
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime("1h")
		.sign(key);
}
