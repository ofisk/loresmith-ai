import { cleanup } from "@testing-library/react";
import { afterEach, expect, vi } from "vitest";

// Node tests import agents/DO code paths; real `cloudflare:workers` is not available.
vi.mock("cloudflare:workers", () => ({
	DurableObject: class {
		ctx!: DurableObjectState;
		env!: unknown;
		constructor(ctx: DurableObjectState, env?: unknown) {
			this.ctx = ctx;
			this.env = env;
		}
	},
}));

// partyserver imports `cloudflare:workers` at module load; stub it for Node (same as DurableObject mock).
vi.mock("partyserver", () => ({
	Server: class Server {
		ctx!: DurableObjectState;
		env!: unknown;
		static options = { hibernate: false };
		constructor(ctx: DurableObjectState, env?: unknown) {
			this.ctx = ctx;
			this.env = env;
		}
	},
}));

// jsdom implements no scroll methods at all — `Element.prototype.scrollTo` is
// simply absent, so any call throws "scrollTo is not a function". Chat auto-scroll
// runs from a 100ms timer (src/hooks/useChatSession.ts), which on a slow enough
// machine fires after the test that scheduled it has finished. The throw then
// surfaces as an unhandled error that fails the whole run even though every test
// passed — a real CI failure that does not reproduce on a fast local box.
if (typeof Element !== "undefined" && !Element.prototype.scrollTo) {
	Element.prototype.scrollTo = function scrollTo() {
		// No layout in jsdom, so there is nothing to scroll; existing as a callable
		// no-op is the entire contract these tests need.
	};
}

// Custom matchers (since jest-dom may not be available)
declare module "vitest" {
	interface Assertion<T = any> {
		toBeInTheDocument(): T;
		toHaveValue(expected: string): T;
		toBeDisabled(): T;
	}
}

expect.extend({
	toBeInTheDocument(received: any) {
		const pass =
			received !== null &&
			received !== undefined &&
			typeof received === "object" &&
			"ownerDocument" in received &&
			received.ownerDocument?.contains(received as Node);

		if (pass) {
			return {
				message: () => `expected element not to be in document`,
				pass: true,
			};
		} else {
			return {
				message: () => `expected element to be in document`,
				pass: false,
			};
		}
	},
	toHaveValue(received: any, expected: string) {
		const actual =
			(received as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)
				?.value || "";
		const pass = actual === expected;

		if (pass) {
			return {
				message: () => `expected element not to have value "${expected}"`,
				pass: true,
			};
		} else {
			return {
				message: () =>
					`expected element to have value "${expected}", but got "${actual}"`,
				pass: false,
			};
		}
	},
	toBeDisabled(received: any) {
		const element = received as HTMLElement;
		const pass =
			element.hasAttribute("disabled") ||
			(element as HTMLInputElement | HTMLButtonElement)?.disabled === true;

		if (pass) {
			return {
				message: () => `expected element not to be disabled`,
				pass: true,
			};
		} else {
			return {
				message: () => `expected element to be disabled`,
				pass: false,
			};
		}
	},
});

// Cleanup after each test
afterEach(() => {
	cleanup();
});
