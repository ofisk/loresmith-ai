import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
import {
	routeCreateEntityRelationship,
	routeDeleteEntityRelationship,
	routeGetEntity,
	routeGetEntityImportance,
	routeGetEntityNeighbors,
	routeGetEntityRelationships,
	routeListEntities,
	routeListPendingDeduplication,
	routeListRelationshipTypes,
	routeListTopEntitiesByImportance,
	routeResolveDeduplicationEntry,
	routeTestEntityExtractionFromR2,
	routeTriggerEntityDeduplication,
	routeTriggerEntityExtraction,
	routeUpdateEntityImportance,
} from "@/routes/campaigns/entities-routes-openapi";
import {
	handleCreateEntityRelationship,
	handleDeleteEntityRelationship,
	handleGetEntity,
	handleGetEntityImportance,
	handleGetEntityNeighbors,
	handleGetEntityRelationships,
	handleListEntities,
	handleListPendingDeduplication,
	handleListRelationshipTypes,
	handleListTopEntitiesByImportance,
	handleResolveDeduplicationEntry,
	handleTestEntityExtractionFromR2,
	handleTriggerEntityDeduplication,
	handleTriggerEntityExtraction,
	handleUpdateEntityImportance,
} from "@/routes/entities";
import type { Env } from "@/routes/env";

export function registerCampaignEntitiesRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.openapi(routeListEntities, handleListEntities as unknown as Handler);
	app.openapi(routeGetEntity, handleGetEntity as unknown as Handler);
	app.openapi(
		routeGetEntityRelationships,
		handleGetEntityRelationships as unknown as Handler
	);
	app.openapi(
		routeGetEntityNeighbors,
		handleGetEntityNeighbors as unknown as Handler
	);
	app.openapi(
		routeListRelationshipTypes,
		handleListRelationshipTypes as unknown as Handler
	);
	app.openapi(
		routeUpdateEntityImportance,
		handleUpdateEntityImportance as unknown as Handler
	);
	app.openapi(
		routeGetEntityImportance,
		handleGetEntityImportance as unknown as Handler
	);
	app.openapi(
		routeListTopEntitiesByImportance,
		handleListTopEntitiesByImportance as unknown as Handler
	);
	app.openapi(
		routeCreateEntityRelationship,
		handleCreateEntityRelationship as unknown as Handler
	);
	app.openapi(
		routeDeleteEntityRelationship,
		handleDeleteEntityRelationship as unknown as Handler
	);
	app.openapi(
		routeTriggerEntityExtraction,
		handleTriggerEntityExtraction as unknown as Handler
	);
	app.openapi(
		routeTriggerEntityDeduplication,
		handleTriggerEntityDeduplication as unknown as Handler
	);
	app.openapi(
		routeListPendingDeduplication,
		handleListPendingDeduplication as unknown as Handler
	);
	app.openapi(
		routeResolveDeduplicationEntry,
		handleResolveDeduplicationEntry as unknown as Handler
	);
	app.openapi(
		routeTestEntityExtractionFromR2,
		handleTestEntityExtractionFromR2 as unknown as Handler
	);
}
