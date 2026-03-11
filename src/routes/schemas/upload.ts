import { z } from "@hono/zod-openapi";
import { ErrorSchema } from "./common";

export const TenantFilenameParams = z
	.object({
		tenant: z.string().openapi({ param: { name: "tenant", in: "path" } }),
		filename: z.string().openapi({ param: { name: "filename", in: "path" } }),
	})
	.openapi("TenantFilenameParams");

export const SessionIdParam = z
	.object({
		sessionId: z.string().openapi({ param: { name: "sessionId", in: "path" } }),
	})
	.openapi("SessionIdParam");

export const SessionIdPartParams = z
	.object({
		sessionId: z.string().openapi({ param: { name: "sessionId", in: "path" } }),
		partNumber: z
			.string()
			.openapi({ param: { name: "partNumber", in: "path" } }),
	})
	.openapi("SessionIdPartParams");

export const ErrorResponseContent = {
	"application/json": { schema: ErrorSchema },
} as const;
