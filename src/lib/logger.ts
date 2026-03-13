import type { ILogObj } from "tslog";
import { Logger as TsLogger } from "tslog";

export type LogLevelName =
	| "silent"
	| "error"
	| "warn"
	| "info"
	| "debug"
	| "trace";

/** Request-scoped context for log correlation (e.g. CF-Ray, userId) */
export type RequestContext = {
	requestId?: string;
	userId?: string;
	[key: string]: unknown;
};

type LogContext = Record<string, unknown>;

const LOG_LEVEL_ORDER: Record<LogLevelName, number> = {
	silent: 0,
	error: 1,
	warn: 2,
	info: 3,
	debug: 4,
	trace: 5,
};

function normalizeLogLevelName(value: unknown): LogLevelName | null {
	if (typeof value !== "string") return null;

	const v = value.trim().toLowerCase();
	if (!v) return null;

	switch (v) {
		case "silent":
		case "none":
		case "off":
			return "silent";
		case "error":
			return "error";
		case "warn":
		case "warning":
			return "warn";
		case "info":
			return "info";
		case "debug":
			return "debug";
		case "trace":
			return "trace";
		default:
			return null;
	}
}

function normalizeBooleanFlag(value: unknown): boolean {
	if (value === true) return true;
	if (value === false) return false;
	if (typeof value !== "string") return false;

	switch (value.trim().toLowerCase()) {
		case "1":
		case "true":
		case "yes":
		case "y":
		case "on":
			return true;
		default:
			return false;
	}
}

function getProcessEnv(): Record<string, string | undefined> | undefined {
	if (typeof process === "undefined") return undefined;
	return process.env as Record<string, string | undefined>;
}

function resolveLogLevelName(env?: Record<string, unknown>): LogLevelName {
	const proc = getProcessEnv();
	const fromEnv =
		normalizeLogLevelName(env?.LOG_LEVEL) ??
		normalizeLogLevelName(env?.LOGLEVEL) ??
		(proc && normalizeLogLevelName(proc.LOG_LEVEL)) ??
		(proc && normalizeLogLevelName(proc.LOGLEVEL));

	if (fromEnv) return fromEnv;

	const debugFlag =
		normalizeBooleanFlag(env?.DEBUG) ||
		(proc && normalizeBooleanFlag(proc.DEBUG));
	if (debugFlag) return "debug";

	return "info";
}

function shouldLog(current: LogLevelName, messageLevel: LogLevelName): boolean {
	return LOG_LEVEL_ORDER[messageLevel] <= LOG_LEVEL_ORDER[current];
}

function resolveLogFormat(env?: Record<string, unknown>): "json" | "pretty" {
	const proc = getProcessEnv();
	const explicitFormat =
		env?.LOG_FORMAT === "json"
			? "json"
			: env?.LOG_FORMAT === "pretty"
				? "pretty"
				: null;
	if (explicitFormat) return explicitFormat;

	const isProd =
		env?.NODE_ENV === "production" ||
		env?.ENVIRONMENT === "production" ||
		proc?.NODE_ENV === "production" ||
		proc?.ENVIRONMENT === "production";
	return isProd ? "json" : "pretty";
}

let tslogInstance: TsLogger<ILogObj> | null = null;
let tslogFormat: "json" | "pretty" | null = null;

function getTsLog(env?: Record<string, unknown>): TsLogger<ILogObj> {
	const format = resolveLogFormat(env);
	if (tslogInstance && tslogFormat === format) {
		return tslogInstance;
	}
	if (tslogInstance && tslogFormat !== format) {
		// Env changed (e.g. first call was without env); keep existing
		return tslogInstance;
	}
	tslogFormat = format;
	tslogInstance = new TsLogger({
		name: "loresmith",
		type: format,
		overwrite: {
			// Keep `Error` objects in the argument list so they remain inspectable
			// (and so tests spying on `console.error` can assert `Error` args).
			formatLogObj: (maskedArgs) => ({ args: maskedArgs, errors: [] }),

			// Ensure WARN/ERROR use console.warn/error (and keep argument order),
			// which also keeps existing tests that spy on console.error working.
			transportFormatted: (_meta, _logArgs, _errors, logMeta) => {
				const level = (logMeta?.logLevelName || "").toUpperCase();
				switch (level) {
					case "WARN":
						return;
					case "ERROR":
					case "FATAL":
						return;
					case "INFO":
						return;
					default:
						return;
				}
			},
		},
	});
	return tslogInstance;
}

let GLOBAL_LEVEL: LogLevelName = resolveLogLevelName();
let GLOBAL_LEVEL_CONFIGURED = false;
function configureGlobalLevelOnce(env?: Record<string, unknown>): void {
	if (GLOBAL_LEVEL_CONFIGURED) return;
	GLOBAL_LEVEL_CONFIGURED = true;
	GLOBAL_LEVEL = resolveLogLevelName(env);
}

const ONCE_KEYS = new Set<string>();

export interface RequestLogger {
	error: (...args: unknown[]) => void;
	warn: (...args: unknown[]) => void;
	info: (...args: unknown[]) => void;
	debug: (...args: unknown[]) => void;
	trace: (...args: unknown[]) => void;
	once: (key: string, level: LogLevelName, ...args: unknown[]) => void;
	child: (prefix: string) => RequestLogger;
	withContext: (ctx: RequestContext) => RequestLogger;
}

function mergeLogArgs(
	args: unknown[],
	requestContext?: RequestContext
): unknown[] {
	if (!requestContext || Object.keys(requestContext).length === 0) {
		return args;
	}
	// Append context as last arg for tslog to include in JSON output
	const last = args[args.length - 1];
	if (last !== null && typeof last === "object" && !Array.isArray(last)) {
		return [...args.slice(0, -1), { ...last, ...requestContext }];
	}
	return [...args, requestContext];
}

export function createLogger(
	env?: Record<string, unknown>,
	prefix?: string,
	requestContext?: RequestContext
): RequestLogger {
	configureGlobalLevelOnce(env);
	const level = resolveLogLevelName(env);
	const tslog = getTsLog(env);

	const basePrefix = prefix?.trim() ? prefix.trim() : "";
	const ctx = requestContext;

	const withPrefix = (args: unknown[]) => {
		if (!basePrefix) return args;
		if (args.length === 0) return [basePrefix];
		if (typeof args[0] === "string") {
			return [`${basePrefix} ${args[0]}`, ...args.slice(1)];
		}
		return [basePrefix, ...args];
	};

	const logAt =
		(messageLevel: LogLevelName, fn: (...a: unknown[]) => void) =>
		(...args: unknown[]) => {
			if (!shouldLog(level, messageLevel)) return;
			const prefixed = withPrefix(args);
			fn(...mergeLogArgs(prefixed, ctx));
		};

	return {
		error: logAt("error", (...a) => tslog.error(...a)),
		warn: logAt("warn", (...a) => tslog.warn(...a)),
		info: logAt("info", (...a) => tslog.info(...a)),
		debug: logAt("debug", (...a) => tslog.debug(...a)),
		trace: logAt("trace", (...a) => tslog.trace(...a)),
		once: (key: string, messageLevel: LogLevelName, ...args: unknown[]) => {
			if (!shouldLog(level, messageLevel)) return;
			if (ONCE_KEYS.has(key)) return;
			ONCE_KEYS.add(key);
			const prefixed = withPrefix(args);
			const merged = mergeLogArgs(prefixed, ctx);
			switch (messageLevel) {
				case "error":
					tslog.error(...merged);
					return;
				case "warn":
					tslog.warn(...merged);
					return;
				case "info":
					tslog.info(...merged);
					return;
				case "debug":
					tslog.debug(...merged);
					return;
				case "trace":
					tslog.trace(...merged);
					return;
				default:
					return;
			}
		},
		child: (childPrefix: string) => {
			const combined =
				basePrefix && childPrefix?.trim()
					? `${basePrefix} ${childPrefix.trim()}`
					: basePrefix || childPrefix?.trim() || "";
			return createLogger(env, combined, ctx);
		},
		withContext: (newCtx: RequestContext) => {
			const mergedCtx: RequestContext = { ...ctx, ...newCtx };
			return createLogger(env, basePrefix, mergedCtx);
		},
	};
}

/**
 * Scoped logger used across the codebase: `logger.scope("[Thing]")`.
 * Uses a globally-resolved level (process.env first, then first env-bound logger call).
 */
export class ScopedLogger {
	constructor(
		private prefix: string,
		private requestContext?: RequestContext
	) {}

	withContext(ctx: RequestContext): ScopedLogger {
		return new ScopedLogger(this.prefix, {
			...this.requestContext,
			...ctx,
		});
	}

	private mergeContext(context?: LogContext): LogContext | undefined {
		const merged = { ...this.requestContext, ...context };
		if (Object.keys(merged).length === 0) return undefined;
		return merged;
	}

	trace(message: string, context?: LogContext): void {
		if (!shouldLog(GLOBAL_LEVEL, "trace")) return;
		const merged = this.mergeContext(context);
		getTsLog().trace(`${this.prefix} ${message}`, merged ?? undefined);
	}

	debug(message: string, context?: LogContext): void {
		if (!shouldLog(GLOBAL_LEVEL, "debug")) return;
		const merged = this.mergeContext(context);
		getTsLog().debug(`${this.prefix} ${message}`, merged ?? undefined);
	}

	info(message: string, context?: LogContext): void {
		if (!shouldLog(GLOBAL_LEVEL, "info")) return;
		const merged = this.mergeContext(context);
		getTsLog().info(`${this.prefix} ${message}`, merged ?? undefined);
	}

	warn(message: string, context?: LogContext): void {
		if (!shouldLog(GLOBAL_LEVEL, "warn")) return;
		const merged = this.mergeContext(context);
		getTsLog().warn(`${this.prefix} ${message}`, merged ?? undefined);
	}

	error(message: string, error?: unknown, context?: LogContext): void {
		if (!shouldLog(GLOBAL_LEVEL, "error")) return;
		const merged = this.mergeContext(context);
		if (merged !== undefined) {
			getTsLog().error(`${this.prefix} ${message}`, error, merged);
			return;
		}
		if (error !== undefined) {
			getTsLog().error(`${this.prefix} ${message}`, error);
			return;
		}
		getTsLog().error(`${this.prefix} ${message}`);
	}

	operation(
		operation: string,
		fn: () => Promise<void> | void
	): Promise<void> | void {
		const startTime = Date.now();
		this.debug(`===== STARTING ${operation} =====`);

		try {
			const result = fn();
			if (result instanceof Promise) {
				return result
					.then(() => {
						const duration = Date.now() - startTime;
						this.debug(`===== COMPLETED ${operation} =====`, {
							duration: `${duration}ms`,
						});
					})
					.catch((error) => {
						const duration = Date.now() - startTime;
						this.error(`===== FAILED ${operation} =====`, error, {
							duration: `${duration}ms`,
						});
						throw error;
					});
			}

			const duration = Date.now() - startTime;
			this.debug(`===== COMPLETED ${operation} =====`, {
				duration: `${duration}ms`,
			});
			return result;
		} catch (error) {
			const duration = Date.now() - startTime;
			this.error(`===== FAILED ${operation} =====`, error, {
				duration: `${duration}ms`,
			});
			throw error;
		}
	}
}

export const logger = {
	scope: (prefix: string, requestContext?: RequestContext) =>
		new ScopedLogger(prefix, requestContext),
};

/** Key used to store request-scoped logger on Hono context. */
export const REQUEST_LOGGER_KEY = "logger";

/** Retrieves the request-scoped logger from Hono context, or a fallback. */
export function getRequestLogger(c: {
	get: (key: string) => unknown;
}): RequestLogger {
	const log = c.get(REQUEST_LOGGER_KEY);
	if (log && typeof (log as RequestLogger).info === "function") {
		return log as RequestLogger;
	}
	return createLogger(undefined, "[Server]");
}
