/**
 * Counts the HTTP attempts the AI SDK makes for one provider call.
 *
 * The AI SDK retries transient failures internally — the default is 2 retries,
 * so 3 total attempts (`LLMOptions.maxRetries`). Every attempt is a billed
 * request: a prompt that reliably 500s or 429s costs its full input price three
 * times and returns nothing. That spend is invisible in token totals, because
 * only the attempt that *succeeded* reports usage.
 *
 * `generateText` does not expose an attempt count on its result, so this counts
 * one layer down, at the transport `createAnthropic` accepts. Anything that
 * reaches the Messages endpoint increments the counter, whatever the reason the
 * SDK re-issued it.
 *
 * Read `attempts` only after the call settles. A counter is scoped to a single
 * provider-method invocation, which includes any JSON-repair call made on the
 * same model handle — the same grouping `queryCount` and the token totals
 * already use there.
 */

/**
 * Matches the Anthropic Messages endpoint exactly, ignoring host and query.
 *
 * Deliberately not `/v1/messages(/|$)` — that also matches `/v1/messages/batches`,
 * which is the Batches API, a different call with its own accounting. Counting
 * it here would inflate the retry signal on the one path this is meant to keep
 * honest.
 */
const MESSAGES_PATH = /\/v1\/messages\/?(\?|#|$)/;

export interface AttemptCounter {
	/** Drop-in replacement for `fetch`, passed to `createAnthropic`. */
	fetch: typeof globalThis.fetch;
	/** Requests issued so far. `1` means no retry; `0` means the call never left. */
	attempts(): number;
}

function urlOf(input: RequestInfo | URL): string {
	if (typeof input === "string") return input;
	if (input instanceof URL) return input.toString();
	return input.url;
}

/**
 * Build a counting `fetch` wrapper.
 *
 * Falls back to the global `fetch` when no base is supplied. Counting happens
 * before the request is awaited, so an attempt that throws still counts — that
 * is the case worth seeing.
 */
export function createAttemptCounter(
	baseFetch: typeof globalThis.fetch = globalThis.fetch
): AttemptCounter {
	let count = 0;
	return {
		fetch: (input, init) => {
			try {
				if (MESSAGES_PATH.test(urlOf(input))) {
					count += 1;
				}
			} catch {
				// A URL we cannot read is not worth failing a generation over.
			}
			return baseFetch(input, init);
		},
		attempts: () => count,
	};
}

/**
 * Attempt count worth reporting, or `undefined` when there is nothing to say.
 *
 * A single attempt is the expected case and would be noise on every log line;
 * `0` means the counter never saw the endpoint (a mocked provider, or a call
 * that failed before dispatch) and reporting it would look like a real
 * measurement of zero.
 */
export function reportableAttempts(count: number): number | undefined {
	return count > 1 ? count : undefined;
}
