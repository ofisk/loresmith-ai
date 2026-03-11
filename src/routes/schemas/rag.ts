import { z } from "@hono/zod-openapi";
import { ErrorSchema } from "./common";

export const FileKeyParamSchema = z
	.object({
		fileKey: z.string().openapi({ param: { name: "fileKey", in: "path" } }),
	})
	.openapi("FileKeyParam");

export const ErrorResponseContent = {
	"application/json": { schema: ErrorSchema },
} as const;
