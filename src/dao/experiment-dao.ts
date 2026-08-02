import { clampRolloutPct } from "@/lib/experiment-bucketing";
import type { Experiment, UpsertExperimentInput } from "@/types/experiments";
import {
	DEFAULT_VARIANTS,
	type ExperimentStatus,
	isExperimentStatus,
} from "@/types/experiments";
import { BaseDAOClass } from "./base-dao";

/** Raw row shape from `experiments` (migrations/0034_experiments.sql). */
export interface ExperimentRow {
	key: string;
	description: string;
	status: string;
	rollout_pct: number;
	variants: string;
	created_at: string;
	updated_at: string;
	updated_by: string | null;
}

const SELECT_COLUMNS = `
      key,
      description,
      status,
      rollout_pct,
      variants,
      created_at,
      updated_at,
      updated_by
`;

/**
 * A row that survived a bad write — an unknown status, or `variants` that is not
 * a JSON array — must not throw on the read path, because every authenticated
 * request resolves flags. Anything unparseable degrades to the safest possible
 * state: `off` with the default two arms, i.e. everybody on control.
 */
function parseVariants(raw: string): string[] {
	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
			return parsed.length > 0 ? parsed : [...DEFAULT_VARIANTS];
		}
	} catch {
		// fall through to the default arms
	}
	return [...DEFAULT_VARIANTS];
}

function parseStatus(raw: string): ExperimentStatus {
	return isExperimentStatus(raw) ? raw : "off";
}

export function mapExperimentRow(row: ExperimentRow): Experiment {
	return {
		key: row.key,
		description: row.description ?? "",
		status: parseStatus(row.status),
		rolloutPct: clampRolloutPct(Number(row.rollout_pct ?? 0)),
		variants: parseVariants(row.variants),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		updatedBy: row.updated_by ?? null,
	};
}

export class ExperimentDAO extends BaseDAOClass {
	/**
	 * The whole table in one query. Flag resolution needs every row anyway (the
	 * assignments endpoint returns the full map), and the table holds tens of
	 * rows, so there is never a reason to fetch one key at a time on the hot path.
	 */
	async listAll(): Promise<Experiment[]> {
		const rows = await this.queryAll<ExperimentRow>(
			`SELECT ${SELECT_COLUMNS} FROM experiments ORDER BY key ASC`
		);
		return rows.map(mapExperimentRow);
	}

	async getByKey(key: string): Promise<Experiment | null> {
		const row = await this.queryFirst<ExperimentRow>(
			`SELECT ${SELECT_COLUMNS} FROM experiments WHERE key = ?`,
			[key]
		);
		return row ? mapExperimentRow(row) : null;
	}

	/**
	 * Create-or-update in one statement. Omitted fields keep their existing value
	 * on update (via `COALESCE` against the excluded row) so a PATCH that only
	 * moves the slider does not blank out the description.
	 */
	async upsert(input: UpsertExperimentInput, updatedBy: string): Promise<void> {
		const variants = input.variants ?? [...DEFAULT_VARIANTS];
		await this.execute(
			`INSERT INTO experiments (
        key, description, status, rollout_pct, variants, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, current_timestamp, current_timestamp)
      ON CONFLICT(key) DO UPDATE SET
        description = COALESCE(?, experiments.description),
        status = COALESCE(?, experiments.status),
        rollout_pct = COALESCE(?, experiments.rollout_pct),
        variants = COALESCE(?, experiments.variants),
        updated_by = ?,
        updated_at = current_timestamp`,
			[
				input.key,
				input.description ?? "",
				input.status ?? "off",
				clampRolloutPct(input.rolloutPct ?? 0),
				JSON.stringify(variants),
				updatedBy,
				input.description ?? null,
				input.status ?? null,
				input.rolloutPct === undefined
					? null
					: clampRolloutPct(input.rolloutPct),
				input.variants === undefined ? null : JSON.stringify(input.variants),
				updatedBy,
			]
		);
	}

	/** Returns the number of rows removed, so the route can 404 an unknown key. */
	async deleteByKey(key: string): Promise<number> {
		return this.executeReturningChanges(
			"DELETE FROM experiments WHERE key = ?",
			[key]
		);
	}
}
