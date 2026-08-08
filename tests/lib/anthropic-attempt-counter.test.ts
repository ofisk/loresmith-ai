import { describe, expect, it, vi } from "vitest";
import {
	createAttemptCounter,
	reportableAttempts,
} from "@/lib/anthropic-attempt-counter";

const MESSAGES_URL = "https://api.anthropic.com/v1/messages";

function okFetch() {
	return vi.fn(async () => new Response("{}", { status: 200 }));
}

describe("createAttemptCounter", () => {
	it("starts at zero before anything is dispatched", () => {
		expect(createAttemptCounter(okFetch() as never).attempts()).toBe(0);
	});

	it("counts each request to the messages endpoint", async () => {
		const base = okFetch();
		const counter = createAttemptCounter(base as never);

		await counter.fetch(MESSAGES_URL, { method: "POST" });
		await counter.fetch(MESSAGES_URL, { method: "POST" });
		await counter.fetch(MESSAGES_URL, { method: "POST" });

		expect(counter.attempts()).toBe(3);
		expect(base).toHaveBeenCalledTimes(3);
	});

	it("passes the request through unchanged", async () => {
		const base = okFetch();
		const counter = createAttemptCounter(base as never);
		const init = { method: "POST", body: "{}" };

		await counter.fetch(MESSAGES_URL, init);

		expect(base).toHaveBeenCalledWith(MESSAGES_URL, init);
	});

	it("accepts URL and Request inputs, not just strings", async () => {
		const counter = createAttemptCounter(okFetch() as never);

		await counter.fetch(new URL(MESSAGES_URL));
		await counter.fetch(new Request(MESSAGES_URL, { method: "POST" }));

		expect(counter.attempts()).toBe(2);
	});

	// Token counting, model listing and any other endpoint the SDK may call are
	// not generation attempts; counting them would inflate the retry signal.
	it("ignores requests to other endpoints", async () => {
		const counter = createAttemptCounter(okFetch() as never);

		await counter.fetch("https://api.anthropic.com/v1/models");
		await counter.fetch("https://api.anthropic.com/v1/messages/batches");

		expect(counter.attempts()).toBe(0);
	});

	it("counts the messages endpoint when it carries a query string", async () => {
		const counter = createAttemptCounter(okFetch() as never);
		await counter.fetch(`${MESSAGES_URL}?beta=true`);
		await counter.fetch(`${MESSAGES_URL}/`);
		expect(counter.attempts()).toBe(2);
	});

	// An attempt that throws is the case most worth seeing: it was dispatched,
	// so it may have been billed, and it returns no usage to account for it.
	it("counts an attempt that rejects", async () => {
		const base = vi.fn(async () => {
			throw new Error("overloaded");
		});
		const counter = createAttemptCounter(base as never);

		await expect(counter.fetch(MESSAGES_URL)).rejects.toThrow("overloaded");
		expect(counter.attempts()).toBe(1);
	});

	it("does not fail a generation when the URL cannot be read", async () => {
		const base = okFetch();
		const counter = createAttemptCounter(base as never);

		await counter.fetch({} as never);

		expect(base).toHaveBeenCalled();
	});
});

describe("reportableAttempts", () => {
	// A single attempt is the expected case; logging it on every call would be
	// noise. Zero means the counter never saw the endpoint (a mocked provider),
	// and reporting it would read as a measurement of zero attempts.
	it("reports nothing for the no-retry and never-dispatched cases", () => {
		expect(reportableAttempts(0)).toBeUndefined();
		expect(reportableAttempts(1)).toBeUndefined();
	});

	it("reports the count once a retry has happened", () => {
		expect(reportableAttempts(2)).toBe(2);
		expect(reportableAttempts(3)).toBe(3);
	});
});
