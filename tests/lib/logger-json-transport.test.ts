import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Production runs `LOG_FORMAT=json`, and until now nothing covered that path -- the
 * pretty-mode guards in logger-transport.test.ts all run through a different sink.
 *
 * tslog v5 made that gap dangerous. Its Node entry writes `type: "json"` lines through
 * a batched `process.stdout.write` rather than `console.log`, so if src/lib/logger.ts
 * ever stops owning the sink (`type: "hidden"` + an explicit transport), production
 * logging silently depends on which conditional export the bundler resolved -- and on
 * workerd, where there is no `process.stdout`, that means no logs at all.
 *
 * These assert the json path writes to console, exactly once, as one parseable line.
 */

const CONSOLE_METHODS = ["log", "info", "warn", "error"] as const;

type ConsoleCall = {
	method: (typeof CONSOLE_METHODS)[number];
	args: unknown[];
};

/** Spies every console method so a duplicated write cannot hide on another channel. */
function captureConsole(): ConsoleCall[] {
	const calls: ConsoleCall[] = [];
	for (const method of CONSOLE_METHODS) {
		vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
			calls.push({ method, args });
		});
	}
	return calls;
}

/**
 * The tslog instance is a module-level singleton keyed to the first format it sees,
 * so each test needs a fresh module graph to pick up json mode.
 */
async function freshLogger() {
	vi.resetModules();
	return import("@/lib/logger");
}

describe("logger json transport", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.resetModules();
	});

	it("writes error-level logs to console.error as one structured line", async () => {
		const { createLogger } = await freshLogger();
		const calls = captureConsole();

		createLogger({ LOG_FORMAT: "json" }, "[Test]").error(
			"insert failed",
			new Error("no such column: id")
		);

		expect(calls).toHaveLength(1);
		expect(calls[0].method).toBe("error");
		expect(calls[0].args).toHaveLength(1);

		const record = JSON.parse(String(calls[0].args[0]));
		expect(record.message).toBe("[Test] insert failed");
		expect(record._logMeta.logLevelName).toBe("ERROR");
		expect(record.error.message).toBe("no such column: id");
		expect(record.error.stack.length).toBeGreaterThan(0);
	});

	it("routes each level to its console method and spreads context fields", async () => {
		const { createLogger } = await freshLogger();
		const calls = captureConsole();

		const log = createLogger(
			{ LOG_FORMAT: "json", LOG_LEVEL: "trace" },
			"[Test]"
		);
		log.info("hello", { requestId: "r1" });
		log.warn("heads up");

		expect(calls.map((c) => c.method)).toEqual(["info", "warn"]);

		const info = JSON.parse(String(calls[0].args[0]));
		expect(info.message).toBe("[Test] hello");
		expect(info.requestId).toBe("r1");
		expect(info._logMeta.logLevelName).toBe("INFO");

		const warn = JSON.parse(String(calls[1].args[0]));
		expect(warn._logMeta.logLevelName).toBe("WARN");
	});

	it("still masks password values, as tslog v4 did by default", async () => {
		// v4's `maskValuesOfKeys` defaulted to ["password"]; v5's `mask.keys` defaults
		// to [], so this asserts the default was carried across the major bump rather
		// than silently dropped.
		const { createLogger } = await freshLogger();
		const calls = captureConsole();

		createLogger({ LOG_FORMAT: "json" }, "[Test]").info("login attempt", {
			user: "ofisk",
			password: "hunter2",
		});

		const line = String(calls[0].args[0]);
		expect(line).not.toContain("hunter2");

		const record = JSON.parse(line);
		expect(record.user).toBe("ofisk");
		expect(record.password).toBe("[***]");
	});

	it("does not double-write through tslog's built-in sink", async () => {
		const { createLogger } = await freshLogger();
		const calls = captureConsole();

		createLogger({ LOG_FORMAT: "json" }, "[Test]").error("only once");

		expect(calls).toHaveLength(1);
	});
});
