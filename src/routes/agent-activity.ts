import type { Context } from "hono";
import { getDAOFactory } from "@/dao/dao-factory";
import { UserAuthenticationMissingError } from "@/lib/errors";
import { getRequestLogger } from "@/lib/logger";
import type { Env } from "@/routes/env";
import type { AuthPayload } from "@/services/core/auth-service";
import type { AgentActivityQuery } from "@/types/agent-activity";
import { isAgentActivityStatus } from "@/types/agent-activity";

/**
 * Read API over the agent activity log (issue #739).
 *
 * Deliberately read-only. Rows are written from `BaseAgent`'s tool wrapper, so
 * an endpoint that accepted them would be a way to forge a record of work that
 * never happened — and the dashboard's whole value is that it is trustworthy.
 */

type ContextWithAuth = Context<{ Bindings: Env }> & {
	userAuth?: AuthPayload;
};

function getUserAuth(c: ContextWithAuth): AuthPayload {
	const userAuth = (c as any).userAuth as AuthPayload | undefined;
	if (!userAuth) {
		throw new UserAuthenticationMissingError();
	}
	return userAuth;
}

/**
 * `requireUserJwt` already rejects anonymous callers, so a missing `userAuth`
 * here means the handler was mounted or invoked without it. Answering 401
 * rather than 500 keeps that honest — nothing is broken, the caller is just
 * not signed in.
 */
function errorResponse(c: ContextWithAuth, error: unknown) {
	if (error instanceof UserAuthenticationMissingError) {
		return c.json({ error: error.message }, 401);
	}
	return c.json(
		{ error: error instanceof Error ? error.message : "Internal server error" },
		500
	);
}

/**
 * Build the query from the URL, pinning `username` to the authenticated caller.
 *
 * The username is never read from a parameter. It is the only authorization
 * check on this table — rows carry it denormalized precisely so a read needs no
 * join to prove ownership — so accepting it as input would make every other
 * user's campaign activity a query string away.
 */
function parseQuery(c: ContextWithAuth, username: string): AgentActivityQuery {
	const query: AgentActivityQuery = { username };

	const campaignId = c.req.query("campaignId");
	if (campaignId) query.campaignId = campaignId;

	const sessionId = c.req.query("sessionId");
	if (sessionId) query.sessionId = sessionId;

	const agentType = c.req.query("agentType");
	if (agentType) query.agentType = agentType;

	const status = c.req.query("status");
	if (isAgentActivityStatus(status)) query.status = status;

	const since = c.req.query("since");
	if (since) query.since = since;

	const limit = Number.parseInt(c.req.query("limit") ?? "", 10);
	if (Number.isFinite(limit)) query.limit = limit;

	const offset = Number.parseInt(c.req.query("offset") ?? "", 10);
	if (Number.isFinite(offset)) query.offset = offset;

	return query;
}

/**
 * GET /api/agent-activity
 *
 * The feed behind #273: this user's agent actions, newest first, filterable by
 * campaign, session, agent type, and status.
 */
export async function handleListAgentActivity(c: ContextWithAuth) {
	try {
		const { username } = getUserAuth(c);
		const dao = getDAOFactory(c.env).agentActivityDAO;
		const activities = await dao.query(parseQuery(c, username));
		return c.json({ activities });
	} catch (error) {
		getRequestLogger(c).error(
			"[handleListAgentActivity] Failed to read agent activity",
			error
		);
		return errorResponse(c, error);
	}
}

/**
 * GET /api/agent-activity/summary
 *
 * Counts over the same filters as the list, minus paging. Separate from the
 * list because a dashboard header wants totals for the window, not for the page.
 */
export async function handleGetAgentActivitySummary(c: ContextWithAuth) {
	try {
		const { username } = getUserAuth(c);
		const dao = getDAOFactory(c.env).agentActivityDAO;
		const counts = await dao.getSummaryCounts(parseQuery(c, username));
		return c.json(counts);
	} catch (error) {
		getRequestLogger(c).error(
			"[handleGetAgentActivitySummary] Failed to summarize agent activity",
			error
		);
		return errorResponse(c, error);
	}
}

/**
 * GET /api/agent-activity/tree/:rootId
 *
 * One turn's actions in order, including anything a delegate did on another
 * agent's behalf — the join #281 renders as per-agent attribution.
 */
export async function handleGetAgentActivityTree(c: ContextWithAuth) {
	try {
		const { username } = getUserAuth(c);
		const rootId = c.req.param("rootId");
		if (!rootId) {
			return c.json({ error: "rootId is required" }, 400);
		}

		const dao = getDAOFactory(c.env).agentActivityDAO;
		const activities = await dao.getTree(rootId, username);
		if (activities.length === 0) {
			// Indistinguishable from "belongs to someone else", on purpose: the tree
			// query is scoped by username, so a 404 here never confirms that an id
			// exists for another user.
			return c.json({ error: "Activity tree not found" }, 404);
		}

		return c.json({ activities });
	} catch (error) {
		getRequestLogger(c).error(
			"[handleGetAgentActivityTree] Failed to read activity tree",
			error
		);
		return errorResponse(c, error);
	}
}
