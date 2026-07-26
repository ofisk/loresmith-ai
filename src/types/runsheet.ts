/**
 * Session runsheet: a single GM-facing page assembled from content that already
 * exists elsewhere in the campaign (session digests, planning tasks, the entity
 * graph, house rules). See issue #742.
 *
 * A runsheet is a SNAPSHOT. It is assembled once, frozen, and then hand-editable.
 * It is never a live view — the plan must not shift under the GM mid-session.
 *
 * Runsheets are full of secrets and are GM-only. They must never be reachable
 * through the player-facing share flow (`src/routes/campaign-share.ts`); the
 * player-safe equivalent is handouts.
 */

/** Where a piece of runsheet content came from, so the GM can go fix it at the source. */
export type RunsheetSourceKind =
	| "session_digest"
	| "planning_task"
	| "entity"
	| "house_rule"
	| "manual";

export interface RunsheetSourceRef {
	kind: RunsheetSourceKind;
	/** Id of the originating record, when it has one. */
	id?: string | null;
	/** Human-readable origin, e.g. "Session 4 digest". */
	label?: string | null;
}

/** "Where we left off", taken from the most recent prior session digest. */
export interface RunsheetRecap {
	/** Session the recap describes (the one before this runsheet's session). */
	fromSessionNumber: number | null;
	keyEvents: string[];
	stateChanges: {
		factions: string[];
		locations: string[];
		npcs: string[];
	};
	source: RunsheetSourceRef | null;
}

/** A single prep item the GM still needs to do, or a beat to hit. */
export interface RunsheetPlanItem {
	title: string;
	detail?: string | null;
	source: RunsheetSourceRef;
}

/** This session's plan: beats from the digest plus planning tasks scoped to it. */
export interface RunsheetPlan {
	objectives: string[];
	probablePlayerGoals: string[];
	beats: string[];
	ifThenBranches: string[];
	/** Open planning tasks targeting this session (issue #699 scopes these). */
	openTasks: RunsheetPlanItem[];
	/** Unfinished prep from the digest's own checklist. */
	todoChecklist: string[];
	source: RunsheetSourceRef | null;
}

/** An NPC likely to appear, with a one-line voice/motivation hook. */
export interface RunsheetCastMember {
	name: string;
	/** One-line hook: what they want / how they sound. Empty when unknown. */
	hook: string;
	role?: string | null;
	/** GM-only. Never rendered on any player-facing surface. */
	secrets?: string | null;
	source: RunsheetSourceRef;
}

/** An encounter seed, enriched with a statblock summary when the monster is known. */
export interface RunsheetEncounter {
	name: string;
	summary: string;
	/** Statblock at-a-glance, e.g. { CR: "5", AC: "17", HP: "94" }. */
	statblock: Record<string, string>;
	source: RunsheetSourceRef;
}

/** A prepared reward, enriched from the item entity when one matches. */
export interface RunsheetLootItem {
	name: string;
	detail: string;
	source: RunsheetSourceRef;
}

/** An active house rule for this campaign. */
export interface RunsheetRule {
	name: string;
	category: string;
	text: string;
	source: RunsheetSourceRef;
}

/** An unresolved hook or thread carried into this session. */
export interface RunsheetThread {
	text: string;
	source: RunsheetSourceRef;
}

/** The frozen snapshot persisted in `campaign_runsheets.runsheet_data`. */
export interface RunsheetData {
	recap: RunsheetRecap;
	plan: RunsheetPlan;
	cast: RunsheetCastMember[];
	encounters: RunsheetEncounter[];
	loot: RunsheetLootItem[];
	rules: RunsheetRule[];
	openThreads: RunsheetThread[];
	/** Freeform GM notes. Always empty on generation; filled in by hand-editing. */
	notes: string;
	/**
	 * Sections that had no content at assembly time, so the UI can explain the
	 * gap ("no house rules recorded") instead of silently omitting the section.
	 */
	emptySections: RunsheetSectionKey[];
}

export const RUNSHEET_SECTION_KEYS = [
	"recap",
	"plan",
	"cast",
	"encounters",
	"loot",
	"rules",
	"openThreads",
] as const;

export type RunsheetSectionKey = (typeof RUNSHEET_SECTION_KEYS)[number];

/** Database row shape for `campaign_runsheets`. */
export interface RunsheetRecord {
	id: string;
	campaign_id: string;
	session_number: number;
	title: string;
	runsheet_data: string;
	generated_at: string;
	created_at: string;
	updated_at: string;
}

/** Runsheet with `runsheet_data` parsed, as exposed to the rest of the app. */
export interface RunsheetWithData {
	id: string;
	campaignId: string;
	sessionNumber: number;
	title: string;
	runsheetData: RunsheetData;
	generatedAt: string;
	createdAt: string;
	updatedAt: string;
}

/** Summary row for list views — omits the (large) snapshot body. */
export interface RunsheetSummary {
	id: string;
	campaignId: string;
	sessionNumber: number;
	title: string;
	generatedAt: string;
	createdAt: string;
	updatedAt: string;
}

export interface CreateRunsheetInput {
	campaignId: string;
	sessionNumber: number;
	title: string;
	runsheetData: RunsheetData;
}

export interface UpdateRunsheetInput {
	title?: string;
	runsheetData?: RunsheetData;
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every key on the given object must hold an array of strings. */
function hasStringArrays(
	source: Record<string, unknown>,
	keys: string[]
): boolean {
	return keys.every((key) => isStringArray(source[key]));
}

/** Every key on the given object must hold an array (entries unchecked). */
function hasArrays(source: Record<string, unknown>, keys: string[]): boolean {
	return keys.every((key) => Array.isArray(source[key]));
}

function isValidRecap(value: unknown): boolean {
	if (!isObject(value)) return false;
	if (!isStringArray(value.keyEvents)) return false;
	if (!isObject(value.stateChanges)) return false;
	return hasStringArrays(value.stateChanges, ["factions", "locations", "npcs"]);
}

function isValidPlan(value: unknown): boolean {
	if (!isObject(value)) return false;
	const listFields = [
		"objectives",
		"probablePlayerGoals",
		"beats",
		"ifThenBranches",
		"todoChecklist",
	];
	return hasStringArrays(value, listFields) && Array.isArray(value.openTasks);
}

/**
 * Structural validation for a hand-edited runsheet body.
 *
 * Deliberately shallow on the list entries: the GM is allowed to edit prose
 * freely, so we check the shape of the document rather than the wording inside
 * it. Anything that would break rendering (a missing section, a section of the
 * wrong type) is rejected.
 */
export function validateRunsheetData(data: unknown): data is RunsheetData {
	if (!isObject(data)) return false;
	if (!isValidRecap(data.recap)) return false;
	if (!isValidPlan(data.plan)) return false;
	if (
		!hasArrays(data, ["cast", "encounters", "loot", "rules", "openThreads"])
	) {
		return false;
	}
	if (typeof data.notes !== "string") return false;
	return isStringArray(data.emptySections);
}
