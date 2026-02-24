import { Logger as TsLogger } from "tslog";

export type LogLevelName =
  | "silent"
  | "error"
  | "warn"
  | "info"
  | "debug"
  | "trace";

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

function resolveLogLevelName(env?: Record<string, unknown>): LogLevelName {
  const fromEnv =
    normalizeLogLevelName(env?.LOG_LEVEL) ??
    normalizeLogLevelName(env?.LOGLEVEL) ??
    normalizeLogLevelName(process.env.LOG_LEVEL) ??
    normalizeLogLevelName(process.env.LOGLEVEL);

  if (fromEnv) return fromEnv;

  const debugFlag =
    normalizeBooleanFlag(env?.DEBUG) || normalizeBooleanFlag(process.env.DEBUG);
  if (debugFlag) return "debug";

  return "info";
}

function shouldLog(current: LogLevelName, messageLevel: LogLevelName): boolean {
  return LOG_LEVEL_ORDER[messageLevel] <= LOG_LEVEL_ORDER[current];
}

const tslog = new TsLogger({
  name: "loresmith",
  overwrite: {
    // Keep `Error` objects in the argument list so they remain inspectable
    // (and so tests spying on `console.error` can assert `Error` args).
    formatLogObj: (maskedArgs) => ({ args: maskedArgs, errors: [] }),

    // Ensure WARN/ERROR use console.warn/error (and keep argument order),
    // which also keeps existing tests that spy on console.error working.
    transportFormatted: (_meta, logArgs, _errors, logMeta) => {
      const level = (logMeta?.logLevelName || "").toUpperCase();
      switch (level) {
        case "WARN":
          console.warn(...logArgs);
          return;
        case "ERROR":
        case "FATAL":
          console.error(...logArgs);
          return;
        case "INFO":
          console.info(...logArgs);
          return;
        case "DEBUG":
        case "TRACE":
        case "SILLY":
        default:
          console.log(...logArgs);
          return;
      }
    },
  },
});

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
}

export function createLogger(
  env?: Record<string, unknown>,
  prefix?: string
): RequestLogger {
  configureGlobalLevelOnce(env);
  const level = resolveLogLevelName(env);

  const basePrefix = prefix?.trim() ? prefix.trim() : "";
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
      fn(...withPrefix(args));
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
      switch (messageLevel) {
        case "error":
          tslog.error(...withPrefix(args));
          return;
        case "warn":
          tslog.warn(...withPrefix(args));
          return;
        case "info":
          tslog.info(...withPrefix(args));
          return;
        case "debug":
          tslog.debug(...withPrefix(args));
          return;
        case "trace":
          tslog.trace(...withPrefix(args));
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
      return createLogger(env, combined);
    },
  };
}

/**
 * Scoped logger used across the codebase: `logger.scope("[Thing]")`.
 * Uses a globally-resolved level (process.env first, then first env-bound logger call).
 */
export class ScopedLogger {
  constructor(private prefix: string) {}

  trace(message: string, context?: LogContext): void {
    if (!shouldLog(GLOBAL_LEVEL, "trace")) return;
    tslog.trace(`${this.prefix} ${message}`, context ?? undefined);
  }

  debug(message: string, context?: LogContext): void {
    if (!shouldLog(GLOBAL_LEVEL, "debug")) return;
    tslog.debug(`${this.prefix} ${message}`, context ?? undefined);
  }

  info(message: string, context?: LogContext): void {
    if (!shouldLog(GLOBAL_LEVEL, "info")) return;
    tslog.info(`${this.prefix} ${message}`, context ?? undefined);
  }

  warn(message: string, context?: LogContext): void {
    if (!shouldLog(GLOBAL_LEVEL, "warn")) return;
    tslog.warn(`${this.prefix} ${message}`, context ?? undefined);
  }

  error(message: string, error?: unknown, context?: LogContext): void {
    if (!shouldLog(GLOBAL_LEVEL, "error")) return;
    if (context !== undefined) {
      tslog.error(`${this.prefix} ${message}`, error, context);
      return;
    }
    if (error !== undefined) {
      tslog.error(`${this.prefix} ${message}`, error);
      return;
    }
    tslog.error(`${this.prefix} ${message}`);
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
  scope: (prefix: string) => new ScopedLogger(prefix),
};
