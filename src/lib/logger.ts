/**
 * Centralized logging utility
 * Replaces scattered console.log statements with structured logging
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogContext {
  [key: string]: unknown;
}

class Logger {
  private level: LogLevel = LogLevel.INFO;
  private enabled: boolean = true;

  /**
   * Set the minimum log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Enable or disable logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Create a scoped logger with a prefix
   */
  scope(prefix: string): ScopedLogger {
    return new ScopedLogger(prefix, this);
  }

  /**
   * Log at DEBUG level
   */
  debug(message: string, context?: LogContext): void {
    if (this.enabled && this.level <= LogLevel.DEBUG) {
      console.log(`[DEBUG] ${message}`, context || "");
    }
  }

  /**
   * Log at INFO level
   */
  info(message: string, context?: LogContext): void {
    if (this.enabled && this.level <= LogLevel.INFO) {
      console.log(`[INFO] ${message}`, context || "");
    }
  }

  /**
   * Log at WARN level
   */
  warn(message: string, context?: LogContext): void {
    if (this.enabled && this.level <= LogLevel.WARN) {
      console.warn(`[WARN] ${message}`, context || "");
    }
  }

  /**
   * Log at ERROR level
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    if (this.enabled && this.level <= LogLevel.ERROR) {
      const errorDetails =
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
            }
          : error;
      console.error(`[ERROR] ${message}`, errorDetails, context || "");
    }
  }

  /**
   * Log operation start/end with timing
   */
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
      } else {
        const duration = Date.now() - startTime;
        this.debug(`===== COMPLETED ${operation} =====`, {
          duration: `${duration}ms`,
        });
        return result;
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      this.error(`===== FAILED ${operation} =====`, error, {
        duration: `${duration}ms`,
      });
      throw error;
    }
  }
}

/**
 * Scoped logger with a prefix
 */
export class ScopedLogger {
  constructor(
    private prefix: string,
    private parent: Logger
  ) {}

  debug(message: string, context?: LogContext): void {
    this.parent.debug(`${this.prefix} ${message}`, context);
  }

  info(message: string, context?: LogContext): void {
    this.parent.info(`${this.prefix} ${message}`, context);
  }

  warn(message: string, context?: LogContext): void {
    this.parent.warn(`${this.prefix} ${message}`, context);
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    this.parent.error(`${this.prefix} ${message}`, error, context);
  }

  operation(
    operation: string,
    fn: () => Promise<void> | void
  ): Promise<void> | void {
    return this.parent.operation(`${this.prefix} ${operation}`, fn);
  }
}

// Global logger instance
export const logger = new Logger();

// Set log level from environment if available
if (typeof process !== "undefined" && process.env.LOG_LEVEL) {
  const envLevel = process.env.LOG_LEVEL.toUpperCase();
  if (envLevel === "DEBUG") logger.setLevel(LogLevel.DEBUG);
  else if (envLevel === "INFO") logger.setLevel(LogLevel.INFO);
  else if (envLevel === "WARN") logger.setLevel(LogLevel.WARN);
  else if (envLevel === "ERROR") logger.setLevel(LogLevel.ERROR);
}
