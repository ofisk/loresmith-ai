/**
 * Tool-call receipts: the record of what an agent actually ran during a turn.
 *
 * A single user message can trigger many tool calls across several model round
 * trips (`stopWhen: stepCountIs(MAX_AGENT_STEPS)`), and today all of that is
 * invisible — the user sees a spinner and then prose. Receipts make the run
 * inspectable so a wrong action can be caught before it compounds.
 */

/**
 * Whether a call changed campaign state.
 *
 * - `read`   — retrieval or inspection; nothing was modified
 * - `write`  — created, updated or deleted something
 * - `action` — ran, but we will not claim either way (unrecognised verb, or a
 *   tool that only sometimes persists). Deliberately non-committal: a false
 *   "nothing changed" is worse for trust than an honest shrug.
 */
export type ToolEffect = "read" | "write" | "action";

/** Whether the call succeeded. Failures are shown, never swallowed. */
export type ToolOutcomeStatus = "ok" | "error";

/** An entity a call touched, deep-linkable into the entity/graph UI. */
export interface ToolReceiptEntity {
	id: string;
	name: string;
}

/** One row of the receipt: a single tool call and what it did. */
export interface ToolReceipt {
	/** Raw tool name, e.g. `createEntityRelationshipTool`. Kept for debugging. */
	toolName: string;
	/** Humanised name shown to the user, e.g. "Create entity relationship". */
	label: string;
	effect: ToolEffect;
	status: ToolOutcomeStatus;
	/** What it was called with, e.g. `"sea captain"`. */
	detail?: string;
	/** What came back, e.g. "3 matches" or the tool's own result message. */
	outcome?: string;
	/** Entities named in the call or its result, rendered as links. */
	entities?: ToolReceiptEntity[];
	/**
	 * How many times this identical call ran. Above 1 the agent retried, which
	 * the UI states explicitly rather than hiding behind a single tidy row.
	 */
	attempts?: number;
}

/** All tool activity behind one assistant message. */
export interface ToolReceipts {
	calls: ToolReceipt[];
	/** Calls that changed state. Drives the "did it change anything?" badge. */
	writeCount: number;
	/** Calls that failed, including ones a later attempt recovered from. */
	errorCount: number;
	/** Calls made before truncation to MAX_RECEIPT_CALLS. */
	totalCallCount: number;
}

/**
 * Rows carried per message. Receipts ride along in the persisted assistant
 * message row, so a runaway loop must not be able to bloat chat history.
 */
export const MAX_RECEIPT_CALLS = 24;

/** Longest detail/outcome string carried per row; the UI clamps further. */
export const MAX_RECEIPT_TEXT_LENGTH = 140;
