import type { D1Database } from "@cloudflare/workers-types";
import type { ExperimentDAO } from "@/dao/experiment-dao";
import {
	clampRolloutPct,
	isVariantEnabled,
	resolveVariant,
} from "@/lib/experiment-bucketing";
import type {
	Experiment,
	FlagMap,
	UpsertExperimentInput,
	VariantMap,
} from "@/types/experiments";
import { CONTROL_VARIANT, isExperimentStatus } from "@/types/experiments";

/**
 * How long a cached snapshot of the `experiments` table is served before the
 * next read goes back to D1.
 *
 * `wrangler.jsonc` binds R2, D1, Vectorize, AI and queues — there is no KV
 * namespace — so there is nowhere faster than the isolate itself to put this.
 * 60s is the price of not having KV: an emergency kill switch takes up to a
 * minute to reach every isolate, which the admin UI states plainly rather than
 * pretending toggles are instant.
 */
export const EXPERIMENT_CACHE_TTL_MS = 60_000;

interface CacheEntry {
	expiresAt: number;
	experiments: Experiment[];
}

/**
 * Module scope, so the snapshot survives across requests within an isolate —
 * that is the entire point. Keyed by the D1 binding rather than by the service
 * or DAO instance because those are constructed per request, and a per-instance
 * cache would never hit.
 */
const snapshotCache = new WeakMap<D1Database, CacheEntry>();

/** Test seam: drop every cached snapshot. */
export function clearExperimentCache(db?: D1Database): void {
	if (db) {
		snapshotCache.delete(db);
	}
}

export class ExperimentService {
	constructor(private readonly dao: ExperimentDAO) {}

	private get db(): D1Database {
		return this.dao.db;
	}

	/**
	 * Cached read of the whole table. Every flag check funnels through here, so
	 * a hot path with N flag checks costs at most one D1 query per minute per
	 * isolate rather than N queries per request.
	 */
	async getCachedExperiments(): Promise<Experiment[]> {
		const cached = snapshotCache.get(this.db);
		if (cached && cached.expiresAt > Date.now()) {
			return cached.experiments;
		}

		let experiments: Experiment[];
		try {
			experiments = await this.dao.listAll();
		} catch (error) {
			// A flags table that is unreadable (not yet migrated, D1 blip) must not
			// take down every request that reads a flag. Serve the stale snapshot if
			// we have one, otherwise behave as if no experiments exist — which
			// resolves everything to control.
			if (cached) return cached.experiments;
			throw error;
		}

		snapshotCache.set(this.db, {
			expiresAt: Date.now() + EXPERIMENT_CACHE_TTL_MS,
			experiments,
		});
		return experiments;
	}

	/** Invalidate immediately after a write so the admin sees their own toggle. */
	private invalidate(): void {
		snapshotCache.delete(this.db);
	}

	/**
	 * Resolved arm for one user. An unknown key resolves to control, so removing
	 * an experiment row is equivalent to turning its feature off — the call site
	 * keeps compiling and keeps taking the old path.
	 */
	async getVariant(key: string, username: string): Promise<string> {
		const experiments = await this.getCachedExperiments();
		const experiment = experiments.find((e) => e.key === key);
		if (!experiment) return CONTROL_VARIANT;
		return resolveVariant(experiment, username);
	}

	async isEnabled(key: string, username: string): Promise<boolean> {
		const experiments = await this.getCachedExperiments();
		const experiment = experiments.find((e) => e.key === key);
		if (!experiment) return false;
		return isVariantEnabled(
			resolveVariant(experiment, username),
			experiment.variants
		);
	}

	/** The full `key -> variant` map, as served to the client at app start. */
	async getAllForUser(username: string): Promise<VariantMap> {
		const experiments = await this.getCachedExperiments();
		const map: VariantMap = {};
		for (const experiment of experiments) {
			map[experiment.key] = resolveVariant(experiment, username);
		}
		return map;
	}

	/** Boolean projection of {@link getAllForUser}, for `isFeatureEnabled` call sites. */
	async getFlagsForUser(username: string): Promise<FlagMap> {
		const experiments = await this.getCachedExperiments();
		const flags: FlagMap = {};
		for (const experiment of experiments) {
			flags[experiment.key] = isVariantEnabled(
				resolveVariant(experiment, username),
				experiment.variants
			);
		}
		return flags;
	}

	/**
	 * Only the experiments actually splitting traffic. Exposure is recorded for
	 * these alone: an `off` or `on` flag has one arm by definition, so counting
	 * exposures for it would just inflate the telemetry table.
	 */
	async getRunningExperiments(): Promise<Experiment[]> {
		const experiments = await this.getCachedExperiments();
		return experiments.filter((e) => e.status === "experiment");
	}

	/** Admin listing: deliberately uncached, so a write is visible on the next refresh. */
	async listExperiments(): Promise<Experiment[]> {
		return this.dao.listAll();
	}

	async getExperiment(key: string): Promise<Experiment | null> {
		return this.dao.getByKey(key);
	}

	async upsertExperiment(
		input: UpsertExperimentInput,
		updatedBy: string
	): Promise<void> {
		await this.dao.upsert(normalizeInput(input), updatedBy);
		this.invalidate();
	}

	async deleteExperiment(key: string): Promise<boolean> {
		const removed = await this.dao.deleteByKey(key);
		this.invalidate();
		return removed > 0;
	}
}

/**
 * Validation lives here rather than in the DAO so both the create and the patch
 * route get it. Statuses and percentages arrive from an admin form, and a
 * `rollout_pct` of 5000 stored in the table would be a silently permanent
 * 100% rollout.
 */
function normalizeInput(input: UpsertExperimentInput): UpsertExperimentInput {
	const normalized: UpsertExperimentInput = { key: input.key.trim() };
	if (input.description !== undefined) {
		normalized.description = input.description;
	}
	if (input.status !== undefined && isExperimentStatus(input.status)) {
		normalized.status = input.status;
	}
	if (input.rolloutPct !== undefined) {
		normalized.rolloutPct = clampRolloutPct(input.rolloutPct);
	}
	if (input.variants !== undefined && input.variants.length >= 2) {
		normalized.variants = input.variants;
	}
	return normalized;
}
