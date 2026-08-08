import type { D1Database } from "@cloudflare/workers-types";
import {
	AgentActivityDAO,
	type PendingAgentActivityWrite,
} from "@/dao/agent-activity-dao";
import {
	summarizeToolInput,
	summarizeToolResult,
} from "@/lib/agent-activity-summary";
import type { EnvWithSecrets } from "@/lib/env-utils";
import { createLogger } from "@/lib/logger";
import { nanoid } from "@/lib/nanoid";
import type {
	AgentActivityActionType,
	AgentActivityStatus,
	AgentActivitySummary,
} from "@/types/agent-activity";
import { AGENT_ACTIVITY_STATUS } from "@/types/agent-activity";

/** Env var gate. Unset defaults to enabled; set to a falsy value to turn off. */
export const AGENT_ACTIVITY_ENV = "LORESMITH_AGENT_ACTIVITY_LOG";

const FALSY_FLAG_VALUES = new Set(["0", "false", "no", "off"]);

/** Longest error message kept on a row. */
const MAX_ERROR_LENGTH = 500;

/**
 * Whether the activity log is enabled. Defaults to on; an explicit falsy value
 * turns it off without a deploy, which matters because this writes from inside
 * the tool-execution path of every agent.
 */
export function isAgentActivityLoggingEnabled(
	env?: EnvWithSecrets | Record<string, unknown>
): boolean {
	const fromEnv = (env as Record<string, unknown> | undefined)?.[
		AGENT_ACTIVITY_ENV
	];
	if (typeof fromEnv === "boolean") return fromEnv;

	const fromProcess =
		typeof process !== "undefined"
			? process.env[AGENT_ACTIVITY_ENV]
			: undefined;
	const raw =
		(typeof fromEnv === "string" ? fromEnv : undefined) ??
		(typeof fromProcess === "string" ? fromProcess : undefined);

	if (raw === undefined || raw.trim() === "") return true;
	return !FALSY_FLAG_VALUES.has(raw.trim().toLowerCase());
}

/** Identity of the agent and turn a recorder is writing for. */
export interface AgentActivityContext {
	username: string;
	agentType: string;
	campaignId: string | null;
	sessionId: string;
	/**
	 * The delegating action, when this recorder belongs to a delegate. Its row
	 * becomes the parent of everything the delegate does, and carries the tree's
	 * root forward.
	 */
	parentId?: string | null;
	rootId?: string | null;
}

export interface BeginActivityInput {
	actionType: AgentActivityActionType;
	toolName: string | null;
	/** Raw tool arguments. Redacted and truncated before anything is stored. */
	input?: unknown;
}

export interface FinishActivityInput {
	status: AgentActivityStatus;
	/** Raw tool result, mined for touched ids and the tool's own message. */
	result?: unknown;
	error?: unknown;
}

/**
 * Buffered writer for the agent activity log (issue #739).
 *
 * The issue's open question was write cost: a D1 round-trip per tool call, on
 * the path a user is waiting on, twice (start and finish). The answer here is
 * that nothing on the hot path is awaited.
 *
 * `begin` and `finish` only mutate an in-memory map and mark the row dirty.
 * Flushes are chained onto a single promise, so any number of enqueues while a
 * flush is in flight coalesce into the next one, and every flush drains
 * everything dirty in one `db.batch()`. A tool that starts and finishes between
 * two flushes — the common case for a fast tool — is written exactly once, with
 * its final state, because the DAO's upsert makes "first write" and "second
 * write" the same statement.
 *
 * Losing a row is acceptable and losing a turn is not, so every failure path
 * logs and continues. `settle()` exists for tests and for callers that want the
 * log durable before they return.
 */
export class AgentActivityRecorder {
	private readonly dao: AgentActivityDAO;
	private readonly context: AgentActivityContext;
	private readonly log: ReturnType<typeof createLogger>;
	private readonly rows = new Map<string, PendingAgentActivityWrite>();
	private readonly dirty = new Set<string>();
	private readonly startedAtMs = new Map<string, number>();
	private flushChain: Promise<void> = Promise.resolve();

	private constructor(
		db: D1Database,
		context: AgentActivityContext,
		env: Record<string, unknown>
	) {
		this.dao = new AgentActivityDAO(db);
		this.context = context;
		this.log = createLogger(env, "[AgentActivity]");
	}

	/**
	 * Build a recorder, or return null when there is nothing useful to write.
	 *
	 * A null recorder is the normal state in unit tests (no DB binding) and for
	 * unauthenticated turns. Returning null rather than a silently inert object
	 * keeps the "is this on?" check at one call site instead of inside every
	 * method.
	 */
	static create(
		env: Record<string, unknown> | undefined,
		context: Omit<Partial<AgentActivityContext>, "username"> & {
			/** Null on an unauthenticated turn, which is why it is not just optional. */
			username: string | null;
		}
	): AgentActivityRecorder | null {
		const db = (env as { DB?: D1Database } | undefined)?.DB;
		if (!db) return null;
		if (!isAgentActivityLoggingEnabled(env)) return null;

		// A row is authorized by its username; one without an owner could never be
		// read back, so writing it would only cost storage.
		if (!context.username) return null;
		if (!context.agentType || !context.sessionId) return null;

		return new AgentActivityRecorder(
			db,
			{
				username: context.username,
				agentType: context.agentType,
				campaignId: context.campaignId ?? null,
				sessionId: context.sessionId,
				parentId: context.parentId ?? null,
				rootId: context.rootId ?? null,
			},
			env ?? {}
		);
	}

	/** Record that an action started. Returns the row id to pass to `finish`. */
	begin(input: BeginActivityInput): string {
		const id = nanoid();
		const now = new Date();

		const summary: AgentActivitySummary = {};
		const inputSummary = summarizeToolInput(input.input);
		if (Object.keys(inputSummary).length > 0) summary.input = inputSummary;

		this.rows.set(id, {
			id,
			username: this.context.username,
			agentType: this.context.agentType,
			campaignId: this.context.campaignId,
			sessionId: this.context.sessionId,
			actionType: input.actionType,
			toolName: input.toolName,
			status: AGENT_ACTIVITY_STATUS.RUNNING,
			parentId: this.context.parentId ?? null,
			// A root is its own root, so one indexed equality fetches the tree
			// whether or not delegation happened.
			rootId: this.context.rootId ?? id,
			startedAt: now.toISOString(),
			endedAt: null,
			durationMs: null,
			summary: Object.keys(summary).length > 0 ? summary : null,
			error: null,
		});
		this.startedAtMs.set(id, now.getTime());
		this.markDirty(id);
		return id;
	}

	/** Record how an action ended. Unknown ids are ignored, never thrown on. */
	finish(id: string, input: FinishActivityInput): void {
		const row = this.rows.get(id);
		if (!row) return;

		const endedAt = new Date();
		const startedAtMs = this.startedAtMs.get(id) ?? endedAt.getTime();

		row.status = input.status;
		row.endedAt = endedAt.toISOString();
		row.durationMs = Math.max(0, endedAt.getTime() - startedAtMs);
		row.error = formatError(input.error);
		if (input.result !== undefined) {
			row.summary = summarizeToolResult(input.result, row.summary);
		}

		this.markDirty(id);
	}

	/**
	 * The context a delegate should record under: same user and campaign, its own
	 * agent type, and this action as the parent.
	 *
	 * Falls back to treating the parent as the tree root when its row is no
	 * longer buffered. That fallback is exact rather than approximate today,
	 * because delegation cannot nest — `allowDelegation: false` is forced on a
	 * delegate's toolset — so a delegating action is always its own root.
	 */
	childContext(parentId: string, agentType: string): AgentActivityContext {
		const row = this.rows.get(parentId);
		return {
			username: this.context.username,
			agentType,
			campaignId: this.context.campaignId,
			sessionId: this.context.sessionId,
			parentId,
			rootId: row?.rootId ?? parentId,
		};
	}

	/** Wait for every queued write to land. For tests and end-of-turn flushes. */
	async settle(): Promise<void> {
		// Two awaits, not one: the first drains what is already queued, and the
		// second covers anything enqueued while that flush was running.
		await this.flushChain;
		await this.flushChain;
	}

	private markDirty(id: string): void {
		this.dirty.add(id);
		this.scheduleFlush();
	}

	/**
	 * Chain a flush behind whatever is already running. Not awaited by callers —
	 * the whole point is that the user's turn never waits on the log.
	 */
	private scheduleFlush(): void {
		this.flushChain = this.flushChain.then(() => this.flush());
	}

	private async flush(): Promise<void> {
		if (this.dirty.size === 0) return;

		const ids = [...this.dirty];
		this.dirty.clear();
		const batch = ids
			.map((id) => this.rows.get(id))
			.filter((row): row is PendingAgentActivityWrite => Boolean(row))
			// Snapshot each row: `finish` mutates in place, and an in-flight write
			// must not see half of the next state.
			.map((row) => ({ ...row }));

		try {
			await this.dao.saveMany(batch);
			// Terminal rows will never change again, so nothing needs their state
			// after a successful write. Dropping them keeps a long turn's memory
			// bounded by concurrent tool calls rather than total tool calls.
			for (const row of batch) {
				if (!this.dirty.has(row.id) && isTerminal(row.status)) {
					this.rows.delete(row.id);
					this.startedAtMs.delete(row.id);
				}
			}
		} catch (error) {
			this.log.warn("Failed to persist agent activity", {
				rows: batch.length,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}

function isTerminal(status: AgentActivityStatus): boolean {
	return status !== AGENT_ACTIVITY_STATUS.RUNNING;
}

/**
 * The one tool whose row is a delegation rather than a plain call. Its children
 * are whatever the delegate then did, which is what #281 renders as attribution.
 */
export const DELEGATION_TOOL_NAME = "askAnotherAgent";

/**
 * A tool reports failure by returning `{ result: { success: false } }`, not by
 * throwing — the wrapper's own guards do exactly that for loop-limited and
 * stale-command calls. Reading the envelope keeps those visible as failures in
 * the log instead of silently succeeding.
 */
export function isSuccessfulToolResult(value: unknown): boolean {
	if (!value || typeof value !== "object") return true;
	const envelope = value as Record<string, unknown>;
	const inner = envelope.result;
	const source =
		inner && typeof inner === "object"
			? (inner as Record<string, unknown>)
			: envelope;
	return source.success !== false;
}

/**
 * Wrap a tool's implementation so every call it serves is logged.
 *
 * A decorator rather than a call inside the implementation, because it lets
 * `BaseAgent`'s tool wrapper stay one anonymous function instead of a named
 * inner one plus a shim — the wrapper is long-standing grandfathered
 * complexity, and renaming it would read to the complexity ratchet as brand
 * new debt rather than the same code with a hat on.
 *
 * The `any`s match the AI SDK's untyped tool `execute` signature, which this
 * has to reproduce exactly.
 */
export function withActivityRecording<T>(
	recorder: AgentActivityRecorder | null,
	toolName: string,
	run: (args: any, context: any, activityId: string | null) => Promise<T>
): (args: any, context: any) => Promise<T> {
	return (args, context) =>
		recordAgentActivity(recorder, { toolName, input: args }, (activityId) =>
			run(args, context, activityId)
		);
}

/**
 * Run one action inside an activity record.
 *
 * Lives here rather than inline in the agent so the recording rules — which
 * result maps to which status, what a thrown error does, that a null recorder
 * changes nothing — are testable without standing up an agent.
 */
export async function recordAgentActivity<T>(
	recorder: AgentActivityRecorder | null,
	action: { toolName: string; input: unknown },
	run: (activityId: string | null) => Promise<T>
): Promise<T> {
	if (!recorder) return run(null);

	const activityId = recorder.begin({
		actionType:
			action.toolName === DELEGATION_TOOL_NAME ? "delegation" : "tool_call",
		toolName: action.toolName,
		input: action.input,
	});

	try {
		const result = await run(activityId);
		recorder.finish(activityId, {
			status: isSuccessfulToolResult(result)
				? AGENT_ACTIVITY_STATUS.SUCCEEDED
				: AGENT_ACTIVITY_STATUS.FAILED,
			result,
		});
		return result;
	} catch (error) {
		recorder.finish(activityId, {
			status: AGENT_ACTIVITY_STATUS.FAILED,
			error,
		});
		throw error;
	}
}

function formatError(error: unknown): string | null {
	if (error === undefined || error === null) return null;
	const message = error instanceof Error ? error.message : String(error);
	return message.slice(0, MAX_ERROR_LENGTH) || null;
}
