import type { z } from "zod";

export interface ParseOrThrowOptions {
  /** Prefix for the console.warn log (e.g. "[CharacterSheetDetection]") */
  logPrefix?: string;
  /** Prefix for the thrown error message (e.g. "Invalid detection result") */
  messagePrefix?: string;
  /** If provided, throw this error instead of Error (e.g. EntityExtractionError) */
  customError?: (message: string) => Error;
}

/**
 * Parse with a Zod schema; on failure log and throw with validation messages.
 * Use for LLM/external input where we want to fail fast with clear errors.
 */
export function parseOrThrow<T extends z.ZodType>(
  schema: T,
  data: unknown,
  options: ParseOrThrowOptions = {}
): z.infer<T> {
  const parsed = schema.safeParse(data);
  if (parsed.success) return parsed.data as z.infer<T>;

  const prefix = options.logPrefix ?? "[Schema]";
  console.warn(`${prefix} Schema validation failed:`, parsed.error.flatten());

  const message = options.messagePrefix
    ? `${options.messagePrefix}: ${parsed.error.errors.map((e) => e.message).join(", ")}`
    : parsed.error.errors.map((e) => e.message).join(", ");

  const ErrorClass = options.customError ?? ((msg: string) => new Error(msg));
  throw ErrorClass(message);
}
