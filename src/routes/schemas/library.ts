import { z } from "@hono/zod-openapi";
import { ErrorSchema } from "./common";

export const FileIdParamSchema = z
	.object({
		fileId: z.string().openapi({ param: { name: "fileId", in: "path" } }),
	})
	.openapi("FileIdParam");

export const ErrorResponseContent = {
	"application/json": { schema: ErrorSchema },
} as const;
