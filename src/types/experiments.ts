/**
 * Runtime feature flags and A/B experiments (issue #755).
 *
 * See docs/FEATURE_FLAGS.md for the rollout model and migrations/0034_experiments.sql
 * for the storage shape.
 */

/**
 * `off` and `on` are plain feature-flag states; `experiment` is the only status
 * that consults `rolloutPct`. Collapsing flags and experiments into one status
 * enum means an experiment can be killed by flipping it to `off` without
 * deleting the row or losing its history.
 */
export type ExperimentStatus = "off" | "on" | "experiment";

export const EXPERIMENT_STATUSES: readonly ExperimentStatus[] = [
	"off",
	"on",
	"experiment",
];

/** Arm every user falls back to. Always `variants[0]`. */
export const CONTROL_VARIANT = "control";

/** The new experience. Always `variants[1]` when a second arm exists. */
export const TREATMENT_VARIANT = "treatment";

export const DEFAULT_VARIANTS: readonly string[] = [
	CONTROL_VARIANT,
	TREATMENT_VARIANT,
];

export interface Experiment {
	key: string;
	description: string;
	status: ExperimentStatus;
	/** 0-100, only meaningful when `status === "experiment"`. */
	rolloutPct: number;
	/** At least two arms; index 0 is control. */
	variants: string[];
	createdAt: string;
	updatedAt: string;
	/** Username of the admin who last wrote this row, or null for seeded rows. */
	updatedBy: string | null;
}

export interface UpsertExperimentInput {
	key: string;
	description?: string;
	status?: ExperimentStatus;
	rolloutPct?: number;
	variants?: string[];
}

/** Resolved `key -> variant` for one user, as returned by the assignments route. */
export type VariantMap = Record<string, string>;

/** Resolved `key -> variant !== control` for one user. */
export type FlagMap = Record<string, boolean>;

export interface ExperimentAssignmentsResponse {
	assignments: VariantMap;
	flags: FlagMap;
}

/** One arm's exposure count for an experiment, from `experiment_exposure` telemetry. */
export interface ExperimentArmExposure {
	variant: string;
	exposures: number;
}

/** One arm's aggregate of a chosen outcome metric. */
export interface ExperimentArmOutcome {
	variant: string;
	count: number;
	avg: number;
	sum: number;
}

export interface ExperimentResults {
	key: string;
	fromDate: string;
	exposures: ExperimentArmExposure[];
	/** Absent unless the caller named an outcome metric. */
	outcomeMetric?: string;
	outcomes?: ExperimentArmOutcome[];
}

export function isExperimentStatus(value: unknown): value is ExperimentStatus {
	return (
		typeof value === "string" &&
		(EXPERIMENT_STATUSES as readonly string[]).includes(value)
	);
}
