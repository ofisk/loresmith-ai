import type { ILogObj, LogMiddleware } from "tslog";
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

/**
 * tslog level ids: SILLY 0, TRACE 1, DEBUG 2, INFO 3, WARN 4, ERROR 5, FATAL 6.
 *
 * We drive tslog through `log(id, name, ...args)` rather than its named level
 * methods. tslog v5 overloads those methods fields-first --
 * `error(fields: object, message?: string, ...args)` / `error(message: string, ...args)`
 * -- and spreading an `unknown[]` matches neither overload (TS2556). `log()` is the
 * one entry point with a real `...args: unknown[]` rest parameter, so it is how this
 * module's variadic API forwards without casting.
 */
const TSLOG_LEVEL_IDS: Record<Exclude<LogLevelName, "silent">, number> = {
	trace: 1,
	debug: 2,
	info: 3,
	warn: 4,
	error: 5,
};

/**
 * The single place this module writes.
 *
 * WARN/ERROR must reach console.warn/console.error so Workers `wrangler tail`
 * classifies them and so tests spying on console.error observe them; the rest keep
 * argument order on console.info/console.log. Args are passed through untouched, so
 * `Error` objects stay live and inspectable rather than being stringified.
 *
 * Every branch must actually write. PR #552 turned the branches of this function's
 * v4 predecessor into bare `return`s, discarding every log line the app produced for
 * ~5 months -- `wrangler tail` showed `"logs": []` on every request. The failure mode
 * is silence, which no "does not throw" test catches; tests/lib/logger-transport.test.ts
 * is the guard.
 */
function writeToConsole(logLevelName: string, args: unknown[]): void {
	switch (logLevelName.toUpperCase()) {
		case "WARN":
			console.warn(...args);
			return;
		case "ERROR":
		case "FATAL":
			console.error(...args);
			return;
		case "INFO":
			console.info(...args);
			return;
		default:
			console.log(...args);
			return;
	}
}

/**
 * Pretty (development) sink.
 *
 * tslog v5 removed the whole v4 `overwrite.*` object. Middleware is the replacement
 * that matters here because it is the only extension point still holding the raw
 * `unknown[]` the caller passed -- and therefore the only place `Error` objects
 * survive with their identity intact. By the time a `Transport` runs, args have been
 * folded into a fields-first record (`{ 0, 1, 2, _logMeta }`) and rendered to a
 * string, so neither argument order nor `Error` identity is recoverable there.
 *
 * Returning `null` ends the pipeline: the record is never built and no transport
 * runs, so nothing downstream can emit a second copy of this line. `type: "hidden"`
 * below independently guarantees the same thing in pretty mode -- keeping both means
 * neither a stray transport nor a changed `type` silently starts double-writing.
 */
const prettyConsoleSink: LogMiddleware<ILogObj> = (ctx) => {
	writeToConsole(ctx.logLevelName, ctx.args);
	return null;
};

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
	tslogInstance = new TsLogger<ILogObj>({
		name: "loresmith",
		// This module owns the sink; `hidden` suppresses tslog's own output while
		// still running middleware and attached transports.
		//
		// In pretty mode the middleware below also short-circuits the pipeline, so
		// either guard alone would stop a duplicate line. In json mode there is no
		// middleware and `hidden` is the only one: without it tslog's built-in sink
		// writes a second copy of every record.
		//
		// Owning the sink also decides *where* logs go. tslog v5's Node entry writes
		// `type: "json"` through a batched `process.stdout.write`, while its
		// browser/worker entry uses `console.log`. Left on, whether production logs
		// reach `wrangler tail` would depend on which conditional export the bundler
		// resolved -- and workerd has no `process.stdout`. This keeps output
		// identical on workerd, under `wrangler dev`, and in vitest.
		type: "hidden",
		// `shouldLog` has already gated the call before tslog sees it, so tslog must
		// never drop a line we decided to emit.
		minLevel: 0,
		// v4 shipped `maskValuesOfKeys: ["password"]`; v5 defaults `mask.keys` to `[]`,
		// so leaving this out would silently start writing passwords in clear text to
		// production logs. Restored as-was rather than widened -- broadening it to
		// tokens/keys is a worthwhile follow-up, but not something to smuggle into a
		// dependency bump.
		//
		// Only the json path below is covered: masking runs while the record is built,
		// which is after middleware, so the pretty dev sink still sees raw args.
		mask: { keys: ["password"] },
		middleware: format === "pretty" ? [prettyConsoleSink] : [],
	});

	if (format === "json") {
		// Production. tslog renders the structured line (fields, `_logMeta`, and
		// error stacks); we still choose the console method so levels survive.
		tslogInstance.attachTransport({
			name: "console-json",
			format: "json",
			write: (record, line) => {
				writeToConsole(record._logMeta.logLevelName, [line]);
			},
		});
	}

	return tslogInstance;
}

/** Forwards already-prefixed, already-level-gated args to tslog. */
function emitToTsLog(
	tslog: TsLogger<ILogObj>,
	messageLevel: Exclude<LogLevelName, "silent">,
	args: unknown[]
): void {
	tslog.log(TSLOG_LEVEL_IDS[messageLevel], messageLevel.toUpperCase(), ...args);
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
		(messageLevel: Exclude<LogLevelName, "silent">) =>
		(...args: unknown[]) => {
			if (!shouldLog(level, messageLevel)) return;
			const prefixed = withPrefix(args);
			emitToTsLog(tslog, messageLevel, mergeLogArgs(prefixed, ctx));
		};

	return {
		error: logAt("error"),
		warn: logAt("warn"),
		info: logAt("info"),
		debug: logAt("debug"),
		trace: logAt("trace"),
		once: (key: string, messageLevel: LogLevelName, ...args: unknown[]) => {
			if (!shouldLog(level, messageLevel)) return;
			if (ONCE_KEYS.has(key)) return;
			ONCE_KEYS.add(key);
			if (messageLevel === "silent") return;
			const prefixed = withPrefix(args);
			emitToTsLog(tslog, messageLevel, mergeLogArgs(prefixed, ctx));
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
		emitToTsLog(getTsLog(), "trace", [
			`${this.prefix} ${message}`,
			merged ?? undefined,
		]);
	}

	debug(message: string, context?: LogContext): void {
		if (!shouldLog(GLOBAL_LEVEL, "debug")) return;
		const merged = this.mergeContext(context);
		emitToTsLog(getTsLog(), "debug", [
			`${this.prefix} ${message}`,
			merged ?? undefined,
		]);
	}

	info(message: string, context?: LogContext): void {
		if (!shouldLog(GLOBAL_LEVEL, "info")) return;
		const merged = this.mergeContext(context);
		emitToTsLog(getTsLog(), "info", [
			`${this.prefix} ${message}`,
			merged ?? undefined,
		]);
	}

	warn(message: string, context?: LogContext): void {
		if (!shouldLog(GLOBAL_LEVEL, "warn")) return;
		const merged = this.mergeContext(context);
		emitToTsLog(getTsLog(), "warn", [
			`${this.prefix} ${message}`,
			merged ?? undefined,
		]);
	}

	error(message: string, error?: unknown, context?: LogContext): void {
		if (!shouldLog(GLOBAL_LEVEL, "error")) return;
		const merged = this.mergeContext(context);
		if (merged !== undefined) {
			emitToTsLog(getTsLog(), "error", [
				`${this.prefix} ${message}`,
				error,
				merged,
			]);
			return;
		}
		if (error !== undefined) {
			emitToTsLog(getTsLog(), "error", [`${this.prefix} ${message}`, error]);
			return;
		}
		emitToTsLog(getTsLog(), "error", [`${this.prefix} ${message}`]);
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
