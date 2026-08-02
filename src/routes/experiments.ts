import type { Context } from "hono";
import { getDAOFactory } from "@/dao/dao-factory";
import { TelemetryDAO } from "@/dao/telemetry-dao";
import { UserAuthenticationMissingError } from "@/lib/errors";
import { getRequestLogger } from "@/lib/logger";
import type { Env } from "@/routes/env";
import type { AuthPayload } from "@/services/core/auth-service";
import { ExperimentService } from "@/services/experiment-service";
import { TelemetryService } from "@/services/telemetry/telemetry-service";
import type {
	ExperimentResults,
	UpsertExperimentInput,
} from "@/types/experiments";
import { isExperimentStatus } from "@/types/experiments";
import type { MetricType } from "@/types/telemetry";

type ContextWithAuth = Context<{ Bindings: Env }> & {
	userAuth?: AuthPayload;
};

/** Default reporting window for an experiment's per-arm numbers. */
const DEFAULT_RESULTS_WINDOW_DAYS = 30;

function getUserAuth(c: ContextWithAuth): AuthPayload {
	const userAuth = (c as any).userAuth as AuthPayload | undefined;
	if (!userAuth) {
		throw new UserAuthenticationMissingError();
	}
	return userAuth;
}

function getExperimentService(c: ContextWithAuth): ExperimentService {
	return new ExperimentService(getDAOFactory(c.env).experimentDAO);
}

function internalError(c: ContextWithAuth, error: unknown) {
	return c.json(
		{ error: error instanceof Error ? error.message : "Internal server error" },
		500
	);
}

/**
 * GET /api/experiments/assignments
 *
 * The client's single read of the flag system: one call at app start, then every
 * `isFeatureEnabled` / `useVariant` is synchronous against the returned map.
 *
 * Also the natural place to count exposures — it fires exactly once per session
 * per user, which is precisely the denominator an A/B comparison needs.
 */
export async function handleGetAssignments(c: ContextWithAuth) {
	try {
		const userAuth = getUserAuth(c);
		const service = getExperimentService(c);

		const [assignments, flags] = await Promise.all([
			service.getAllForUser(userAuth.username),
			service.getFlagsForUser(userAuth.username),
		]);

		await recordExposures(c, service, assignments);

		return c.json({ assignments, flags });
	} catch (error) {
		getRequestLogger(c).error(
			"[handleGetAssignments] Failed to resolve assignments",
			error
		);
		return internalError(c, error);
	}
}

/**
 * Exposure writes are best-effort and never block the response: a user who
 * cannot get their flags sees a broken app, whereas a lost exposure row only
 * nudges a denominator. Only `experiment`-status rows are counted — an `on` or
 * `off` flag has a single arm, so its "exposures" would carry no information.
 */
async function recordExposures(
	c: ContextWithAuth,
	service: ExperimentService,
	assignments: Record<string, string>
): Promise<void> {
	if (!c.env.DB) return;
	try {
		const running = await service.getRunningExperiments();
		if (running.length === 0) return;

		const telemetry = new TelemetryService(new TelemetryDAO(c.env.DB));
		await Promise.all(
			running.map((experiment) =>
				telemetry.recordExperimentExposure(
					experiment.key,
					assignments[experiment.key] ?? "control"
				)
			)
		);
	} catch (error) {
		getRequestLogger(c).error(
			"[handleGetAssignments] Failed to record exposures",
			error
		);
	}
}

/** GET /api/admin/experiments — uncached, so an admin sees their own write. */
export async function handleListExperiments(c: ContextWithAuth) {
	try {
		const experiments = await getExperimentService(c).listExperiments();
		return c.json({ experiments });
	} catch (error) {
		getRequestLogger(c).error(
			"[handleListExperiments] Failed to list experiments",
			error
		);
		return internalError(c, error);
	}
}

/** POST /api/admin/experiments */
export async function handleCreateExperiment(c: ContextWithAuth) {
	try {
		const userAuth = getUserAuth(c);
		const body = (await c.req.json()) as Partial<UpsertExperimentInput>;

		const key = typeof body.key === "string" ? body.key.trim() : "";
		if (!key) {
			return c.json({ error: "key is required" }, 400);
		}
		if (body.status !== undefined && !isExperimentStatus(body.status)) {
			return c.json(
				{ error: "status must be one of: off, on, experiment" },
				400
			);
		}

		const service = getExperimentService(c);
		if (await service.getExperiment(key)) {
			return c.json({ error: `Experiment "${key}" already exists` }, 409);
		}

		await service.upsertExperiment({ ...body, key }, userAuth.username);
		return c.json({ experiment: await service.getExperiment(key) }, 201);
	} catch (error) {
		getRequestLogger(c).error(
			"[handleCreateExperiment] Failed to create experiment",
			error
		);
		return internalError(c, error);
	}
}

/**
 * PATCH /api/admin/experiments/:key
 *
 * Partial by design: the admin UI's status dropdown and rollout slider each send
 * one field, and the DAO's upsert leaves omitted columns untouched.
 */
export async function handleUpdateExperiment(c: ContextWithAuth) {
	try {
		const userAuth = getUserAuth(c);
		const key = c.req.param("key");
		if (!key) {
			return c.json({ error: "key is required" }, 400);
		}

		const body = (await c.req.json()) as Partial<UpsertExperimentInput>;
		if (body.status !== undefined && !isExperimentStatus(body.status)) {
			return c.json(
				{ error: "status must be one of: off, on, experiment" },
				400
			);
		}

		const service = getExperimentService(c);
		if (!(await service.getExperiment(key))) {
			return c.json({ error: `Experiment "${key}" not found` }, 404);
		}

		await service.upsertExperiment({ ...body, key }, userAuth.username);
		return c.json({ experiment: await service.getExperiment(key) });
	} catch (error) {
		getRequestLogger(c).error(
			"[handleUpdateExperiment] Failed to update experiment",
			error
		);
		return internalError(c, error);
	}
}

/** DELETE /api/admin/experiments/:key */
export async function handleDeleteExperiment(c: ContextWithAuth) {
	try {
		const key = c.req.param("key");
		if (!key) {
			return c.json({ error: "key is required" }, 400);
		}

		const removed = await getExperimentService(c).deleteExperiment(key);
		if (!removed) {
			return c.json({ error: `Experiment "${key}" not found` }, 404);
		}
		return c.json({ success: true });
	} catch (error) {
		getRequestLogger(c).error(
			"[handleDeleteExperiment] Failed to delete experiment",
			error
		);
		return internalError(c, error);
	}
}

/**
 * GET /api/admin/experiments/:key/results?metricType=&days=
 *
 * Raw per-arm numbers only. Calling a winner stays a human judgment (issue #755
 * puts significance testing explicitly out of scope for v1), so this reports
 * exposures per arm and, optionally, one outcome metric split the same way.
 */
export async function handleGetExperimentResults(c: ContextWithAuth) {
	try {
		const key = c.req.param("key");
		if (!key) {
			return c.json({ error: "key is required" }, 400);
		}
		if (!c.env.DB) {
			return c.json({ error: "Database not configured" }, 500);
		}

		const days = Number(c.req.query("days") ?? DEFAULT_RESULTS_WINDOW_DAYS);
		const windowDays =
			Number.isFinite(days) && days > 0 ? days : DEFAULT_RESULTS_WINDOW_DAYS;
		const fromDate = new Date(
			Date.now() - windowDays * 86_400_000
		).toISOString();

		const telemetryDAO = new TelemetryDAO(c.env.DB);
		const results: ExperimentResults = {
			key,
			fromDate,
			exposures: await telemetryDAO.getExperimentExposures(key, fromDate),
		};

		const outcomeMetric = c.req.query("metricType");
		if (outcomeMetric) {
			results.outcomeMetric = outcomeMetric;
			results.outcomes = await telemetryDAO.getExperimentOutcomes(
				key,
				outcomeMetric as MetricType,
				fromDate
			);
		}

		return c.json(results);
	} catch (error) {
		getRequestLogger(c).error(
			"[handleGetExperimentResults] Failed to load results",
			error
		);
		return internalError(c, error);
	}
}
