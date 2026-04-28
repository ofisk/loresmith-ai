import type { D1Database } from "@cloudflare/workers-types";
import { type EnvWithDb, getDAOFactory } from "@/dao/dao-factory";
import { LibraryEntityDAO } from "@/dao/library-entity-dao";
import { buildLibraryContentFingerprint } from "@/lib/library-entity-id";
import type { Env } from "@/middleware/auth";
import { tryCopyLibraryEntitiesToCampaign } from "@/services/campaign/library-entity-copy-to-campaign-service";
import type { PendingAttribution } from "@/services/campaign/pending-campaign-entity-copy";

export interface BackfillLibraryEntitiesToCampaignsOptions {
	dryRun?: boolean;
	fileKeyFilter?: string;
	usernameFilter?: string;
	limit?: number;
	/**
	 * When true (default), send "shards ready" to campaign members only for rows
	 * where the copy creates at least one new entity. Use false for silent runs
	 * (e.g. `notify=0` on the maintenance handler).
	 */
	sendNotifications?: boolean;
}

export interface BackfillResourceRow {
	id: string;
	campaign_id: string;
	file_key: string;
	file_name: string;
	entity_copy_status: string;
	pending_attribution: string | null;
	username: string;
	campaign_name: string;
}

export interface BackfillLibraryEntitiesToCampaignsResult {
	rowsConsidered: number;
	copiedOk: number;
	copyFailed: number;
	dryRunWouldCopy: number;
	dryRunNoop: number;
	/**
	 * Dry run only: rows returned by the SQL list but failing the second preflight
	 * (fingerprint drift vs discovery, file state race, etc.). See `dryRunSkippedPreflightReasons`.
	 */
	dryRunSkippedPreflight: number;
	/** Dry run only: counts by skip reason from secondary preflight. */
	dryRunSkippedPreflightReasons?: Record<string, number>;
	/** Rows where tryCopy returned true but every candidate id already existed (rare; still reconciles rels / importance). */
	noopAllEntitiesPresent: number;
	errors: {
		fileKey: string;
		campaignId: string;
		resourceId: string;
		message: string;
	}[];
}

/** D1 is enough for this flow; the maintenance worker has no other bindings. */
type BackfillRunEnv = EnvWithDb & { DB: D1Database };

function asServiceEnv(e: BackfillRunEnv): Env {
	return e as unknown as Env;
}

type PreflightSkipReason =
	| "schema_not_ready"
	| "discovery_missing_or_incomplete"
	| "file_missing_or_not_completed"
	| "fingerprint_mismatch";

async function wouldInsertAnyMissingEntity(options: {
	env: BackfillRunEnv;
	campaignId: string;
	username: string;
	fileKey: string;
}): Promise<
	| { eligible: false; skipReason?: PreflightSkipReason }
	| { eligible: true; wouldInsert: boolean }
> {
	const { env, campaignId, username, fileKey } = options;
	const libDao = new LibraryEntityDAO(env.DB);
	if (!(await libDao.isSchemaReady())) {
		return { eligible: false, skipReason: "schema_not_ready" };
	}
	const discovery = await libDao.getDiscovery(fileKey);
	if (!discovery || discovery.status !== "complete") {
		return { eligible: false, skipReason: "discovery_missing_or_incomplete" };
	}
	const daoFactory = getDAOFactory(env);
	const fileRecord = await daoFactory.fileDAO.getFileForRag(fileKey, username);
	if (!fileRecord || fileRecord.status !== "completed") {
		return { eligible: false, skipReason: "file_missing_or_not_completed" };
	}
	const fp = buildLibraryContentFingerprint(
		fileRecord.file_size,
		fileRecord.updated_at
	);
	if (
		discovery.content_fingerprint != null &&
		discovery.content_fingerprint !== fp
	) {
		return { eligible: false, skipReason: "fingerprint_mismatch" };
	}
	const candidates = await libDao.listCandidatesForFile(fileKey);
	if (candidates.length === 0) {
		return { eligible: true, wouldInsert: false };
	}
	for (const c of candidates) {
		const newId = `${campaignId}_${c.id_suffix}`;
		const existing = await daoFactory.entityDAO.getEntityById(newId);
		if (!existing) {
			return { eligible: true, wouldInsert: true };
		}
	}
	return { eligible: true, wouldInsert: false };
}

/**
 * One-off / maintenance: copy library-discovered entities into every campaign that already
 * has the file attached, if preconditions match and at least one target entity is missing.
 * `tryCopyLibraryEntitiesToCampaign` is idempotent per-entity; existing ids are skipped.
 */
export async function runBackfillLibraryEntitiesToCampaigns(
	env: BackfillRunEnv,
	op: BackfillLibraryEntitiesToCampaignsOptions = {}
): Promise<BackfillLibraryEntitiesToCampaignsResult> {
	const {
		dryRun = false,
		fileKeyFilter,
		usernameFilter,
		limit,
		sendNotifications = true,
	} = op;
	const result: BackfillLibraryEntitiesToCampaignsResult = {
		rowsConsidered: 0,
		copiedOk: 0,
		copyFailed: 0,
		dryRunWouldCopy: 0,
		dryRunNoop: 0,
		dryRunSkippedPreflight: 0,
		noopAllEntitiesPresent: 0,
		errors: [],
	};

	const libDao = new LibraryEntityDAO(env.DB);
	if (!(await libDao.isSchemaReady())) {
		result.errors.push({
			fileKey: "",
			campaignId: "",
			resourceId: "",
			message: "library_entity_discovery table missing",
		});
		return result;
	}

	const campaignDAO = getDAOFactory(env).campaignDAO;
	const rows = await campaignDAO.listResourcesEligibleForLibraryEntityBackfill({
		fileKey: fileKeyFilter,
		username: usernameFilter,
		limit,
	});
	result.rowsConsidered = rows.length;

	for (const row of rows) {
		if (dryRun) {
			const w = await wouldInsertAnyMissingEntity({
				env,
				campaignId: row.campaign_id,
				username: row.username,
				fileKey: row.file_key,
			});
			if (w.eligible) {
				if (w.wouldInsert) {
					result.dryRunWouldCopy += 1;
				} else {
					result.dryRunNoop += 1;
				}
			} else {
				result.dryRunSkippedPreflight += 1;
				const r = w.skipReason ?? "unknown";
				if (!result.dryRunSkippedPreflightReasons) {
					result.dryRunSkippedPreflightReasons = {};
				}
				result.dryRunSkippedPreflightReasons[r] =
					(result.dryRunSkippedPreflightReasons[r] ?? 0) + 1;
			}
			continue;
		}

		const pre = await wouldInsertAnyMissingEntity({
			env,
			campaignId: row.campaign_id,
			username: row.username,
			fileKey: row.file_key,
		});
		if (pre.eligible && !pre.wouldInsert) {
			result.noopAllEntitiesPresent += 1;
			if (
				row.entity_copy_status === "pending_library" ||
				row.entity_copy_status === "failed"
			) {
				await campaignDAO.setCampaignResourceEntityCopyStatus(
					row.campaign_id,
					row.id,
					"complete",
					null
				);
			}
			continue;
		}

		let attribution: PendingAttribution | undefined;
		if (row.pending_attribution) {
			try {
				attribution = JSON.parse(row.pending_attribution) as PendingAttribution;
			} catch {
				// ignore
			}
		}

		const copied = await tryCopyLibraryEntitiesToCampaign({
			env: asServiceEnv(env),
			username: row.username,
			campaignId: row.campaign_id,
			campaignName: row.campaign_name,
			resourceId: row.id,
			fileKey: row.file_key,
			fileName: row.file_name,
			attribution,
			skipNotification: !sendNotifications,
		});

		if (copied) {
			result.copiedOk += 1;
			if (row.entity_copy_status !== "complete") {
				await campaignDAO.setCampaignResourceEntityCopyStatus(
					row.campaign_id,
					row.id,
					"complete",
					null
				);
			}
		} else {
			result.copyFailed += 1;
			result.errors.push({
				fileKey: row.file_key,
				campaignId: row.campaign_id,
				resourceId: row.id,
				message: "tryCopy failed (fingerprint, file status, or no candidates)",
			});
		}
	}

	return result;
}
