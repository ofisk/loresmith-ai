/**
 * Agent activity log (issue #739).
 *
 * One append-only record of what agents did, written from the single tool
 * wrapper in `BaseAgent`. Five stalled issues are views over or hooks into this
 * shape: #273 and #281 read it, #276 and #277 add a status transition to it,
 * #279 walks its parent/child linkage.
 */

/** Lifecycle of a single agent action. */
export const AGENT_ACTIVITY_STATUS = {
	/** Started, not yet resolved. The only non-terminal status today. */
	RUNNING: "running",
	SUCCEEDED: "succeeded",
	FAILED: "failed",
	/**
	 * Reserved for #277 (interrupt controls): an action abandoned because the
	 * user stopped the turn. Nothing writes it yet.
	 */
	CANCELLED: "cancelled",
	/**
	 * Reserved for #276 (autonomy levels): a write-capable action held at the
	 * gate pending user approval. Nothing writes it yet.
	 */
	AWAITING_APPROVAL: "awaiting_approval",
} as const;

export type AgentActivityStatus =
	(typeof AGENT_ACTIVITY_STATUS)[keyof typeof AGENT_ACTIVITY_STATUS];

const STATUS_VALUES = new Set<string>(Object.values(AGENT_ACTIVITY_STATUS));

export function isAgentActivityStatus(
	value: unknown
): value is AgentActivityStatus {
	return typeof value === "string" && STATUS_VALUES.has(value);
}

/** Terminal statuses — an action in any other status is still in flight. */
export function isTerminalAgentActivityStatus(
	status: AgentActivityStatus
): boolean {
	return (
		status === AGENT_ACTIVITY_STATUS.SUCCEEDED ||
		status === AGENT_ACTIVITY_STATUS.FAILED ||
		status === AGENT_ACTIVITY_STATUS.CANCELLED
	);
}

/**
 * What kind of action this row describes. Coarser than `toolName` on purpose:
 * a future generation or indexing step needs a home here, not a migration.
 */
export const AGENT_ACTIVITY_ACTION_TYPE = {
	TOOL_CALL: "tool_call",
	/** An `askAnotherAgent` call — the parent of whatever the delegate then did. */
	DELEGATION: "delegation",
} as const;

export type AgentActivityActionType =
	(typeof AGENT_ACTIVITY_ACTION_TYPE)[keyof typeof AGENT_ACTIVITY_ACTION_TYPE];

/**
 * Redacted, size-capped description of one action. Never holds raw tool input:
 * the tool wrapper injects the caller's JWT into arguments before execution, so
 * a verbatim copy would persist a credential in a table built to be read by a
 * dashboard.
 */
export interface AgentActivitySummary {
	/** Argument names and truncated values, with secrets dropped. */
	input?: Record<string, string>;
	/** Ids the action read or wrote, by kind, for #281's attribution badges. */
	touched?: {
		entityIds?: string[];
		fileKeys?: string[];
		campaignIds?: string[];
		shardIds?: string[];
	};
	/** The tool's own one-line message, when it returned one. */
	message?: string;
}

/** One row, as the rest of the app sees it. */
export interface AgentActivityRecord {
	id: string;
	username: string;
	agentType: string;
	campaignId: string | null;
	sessionId: string;
	actionType: AgentActivityActionType;
	toolName: string | null;
	status: AgentActivityStatus;
	parentId: string | null;
	rootId: string;
	startedAt: string;
	endedAt: string | null;
	durationMs: number | null;
	summary: AgentActivitySummary | null;
	error: string | null;
}

/** Everything known when an action starts. */
export interface StartAgentActivityInput {
	id: string;
	username: string;
	agentType: string;
	campaignId: string | null;
	sessionId: string;
	actionType: AgentActivityActionType;
	toolName: string | null;
	parentId: string | null;
	rootId: string;
	startedAt: string;
	summary: AgentActivitySummary | null;
}

/** Everything learned when it resolves. */
export interface FinishAgentActivityInput {
	status: AgentActivityStatus;
	endedAt: string;
	durationMs: number;
	summary?: AgentActivitySummary | null;
	error?: string | null;
}

/** Filters accepted by the read path. */
export interface AgentActivityQuery {
	/** Always required: every read is scoped to the caller. */
	username: string;
	campaignId?: string;
	sessionId?: string;
	agentType?: string;
	status?: AgentActivityStatus;
	/** ISO timestamp; rows started strictly before this are excluded. */
	since?: string;
	limit?: number;
	offset?: number;
}

/** Counts for the dashboard header (#273), over the same window as the list. */
export interface AgentActivitySummaryCounts {
	total: number;
	running: number;
	succeeded: number;
	failed: number;
	/** Action counts keyed by agent type — the raw material for #281. */
	byAgentType: Record<string, number>;
}
