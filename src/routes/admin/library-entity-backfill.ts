import type { Context } from "hono";
import { ALLOWED_LIBRARY_ENTITY_BACKFILL_EMAIL } from "@/constants/backfill";
import { getDAOFactory } from "@/dao/dao-factory";
import { UserAuthenticationMissingError } from "@/lib/errors";
import { getRequestLogger } from "@/lib/logger";
import type { Env } from "@/middleware/auth";
import { runBackfillLibraryEntitiesToCampaigns } from "@/services/campaign/backfill-library-entities-to-campaigns";
import type { AuthPayload } from "@/services/core/auth-service";

type ContextWithAuth = Context<{ Bindings: Env }> & { userAuth?: AuthPayload };

function getUserAuth(c: ContextWithAuth): AuthPayload {
	const userAuth = (c as { userAuth?: AuthPayload }).userAuth;
	if (!userAuth) {
		throw new UserAuthenticationMissingError();
	}
	return userAuth;
}

/**
 * POST /api/admin/library-entity-backfill
 * Copy library entities into campaigns for resources that qualify.
 * Restricted to {@link ALLOWED_LIBRARY_ENTITY_BACKFILL_EMAIL}.
 */
export async function handlePostLibraryEntityBackfill(c: ContextWithAuth) {
	const log = getRequestLogger(c);
	try {
		const userAuth = getUserAuth(c);
		const row = await getDAOFactory(c.env).authUserDAO.getUserByUsername(
			userAuth.username
		);
		if (
			!row ||
			row.email.toLowerCase() !==
				ALLOWED_LIBRARY_ENTITY_BACKFILL_EMAIL.toLowerCase()
		) {
			return c.json({ error: "Forbidden" }, 403);
		}

		let body: Record<string, unknown> = {};
		try {
			const raw = await c.req.json();
			if (raw && typeof raw === "object" && !Array.isArray(raw)) {
				body = raw as Record<string, unknown>;
			}
		} catch {
			// empty body
		}

		const dryRun =
			body.dryRun === true ||
			body.dryRun === "true" ||
			body.dryRun === 1 ||
			body.dryRun === "1";
		const fileKeyFilter =
			typeof body.fileKeyFilter === "string" ? body.fileKeyFilter : undefined;
		const usernameFilter =
			typeof body.usernameFilter === "string" ? body.usernameFilter : undefined;
		const limitRaw = body.limit;
		let limit: number | undefined;
		if (typeof limitRaw === "number" && Number.isFinite(limitRaw)) {
			limit = Math.floor(limitRaw);
		} else if (typeof limitRaw === "string" && limitRaw.trim() !== "") {
			const n = parseInt(limitRaw, 10);
			if (!Number.isNaN(n)) limit = n;
		}
		if (limit !== undefined && (limit <= 0 || Number.isNaN(limit))) {
			return c.json({ error: "invalid limit" }, 400);
		}

		let sendNotifications = true;
		if (
			body.sendNotifications === false ||
			body.sendNotifications === "false"
		) {
			sendNotifications = false;
		}
		if (body.sendNotifications === true || body.sendNotifications === "true") {
			sendNotifications = true;
		}

		const result = await runBackfillLibraryEntitiesToCampaigns(c.env, {
			dryRun,
			fileKeyFilter,
			usernameFilter,
			limit,
			sendNotifications,
		});
		return c.json(result);
	} catch (error) {
		if (error instanceof UserAuthenticationMissingError) {
			return c.json({ error: "Authentication required" }, 401);
		}
		log.error("[handlePostLibraryEntityBackfill] failed", error);
		return c.json({ error: "Internal server error" }, 500);
	}
}
