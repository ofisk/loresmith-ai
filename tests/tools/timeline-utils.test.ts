import { describe, expect, it } from "vitest";
import {
	applyTimelineFilters,
	groupBySession,
	sortTimelineEvents,
	type TimelineEvent,
	toEpoch,
	withinDateRange,
	withinSessionRange,
} from "@/tools/campaign-context/timeline-utils";

const mkEvent = (overrides: Partial<TimelineEvent> = {}): TimelineEvent => ({
	id: "e1",
	source: "session_digest",
	timestamp: "2024-01-15T12:00:00Z",
	campaignSessionId: 1,
	title: "Session 1",
	summary: "Summary",
	entityIds: [],
	...overrides,
});

describe("timeline-utils", () => {
	describe("toEpoch", () => {
		it("returns NaN for null/undefined", () => {
			expect(Number.isNaN(toEpoch(null))).toBe(true);
			expect(Number.isNaN(toEpoch(undefined))).toBe(true);
		});

		it("returns timestamp for valid ISO string", () => {
			const ts = toEpoch("2024-01-15T12:00:00Z");
			expect(Number.isFinite(ts)).toBe(true);
		});
	});

	describe("withinDateRange", () => {
		it("returns true when no filters", () => {
			expect(withinDateRange("2024-01-15T12:00:00Z")).toBe(true);
		});

		it("returns false when timestamp before fromDate", () => {
			expect(
				withinDateRange("2024-01-10T12:00:00Z", "2024-01-15T00:00:00Z")
			).toBe(false);
		});

		it("returns false when timestamp after toDate", () => {
			expect(
				withinDateRange(
					"2024-01-20T12:00:00Z",
					undefined,
					"2024-01-15T00:00:00Z"
				)
			).toBe(false);
		});
	});

	describe("withinSessionRange", () => {
		it("returns true for null session when no filters", () => {
			expect(withinSessionRange(null)).toBe(true);
		});

		it("returns false when session below fromSession", () => {
			expect(withinSessionRange(5, 10, undefined)).toBe(false);
		});

		it("returns false when session above toSession", () => {
			expect(withinSessionRange(15, undefined, 10)).toBe(false);
		});

		it("returns true when session in range", () => {
			expect(withinSessionRange(5, 1, 10)).toBe(true);
		});
	});

	describe("applyTimelineFilters", () => {
		it("filters by entityFilter in title", () => {
			const events = [
				mkEvent({ id: "1", title: "Goblin attack" }),
				mkEvent({ id: "2", title: "Dragon quest" }),
			];
			const filtered = applyTimelineFilters(events, { entityFilter: "goblin" });
			expect(filtered).toHaveLength(1);
			expect(filtered[0].title).toBe("Goblin attack");
		});

		it("filters by entityFilter in entityIds", () => {
			const events = [
				mkEvent({ id: "1", entityIds: ["entity-goblin-1"] }),
				mkEvent({ id: "2", entityIds: ["entity-dragon-1"] }),
			];
			const filtered = applyTimelineFilters(events, { entityFilter: "goblin" });
			expect(filtered).toHaveLength(1);
		});
	});

	describe("sortTimelineEvents", () => {
		it("sorts by timestamp", () => {
			const events = [
				mkEvent({ id: "2", timestamp: "2024-01-20T12:00:00Z" }),
				mkEvent({ id: "1", timestamp: "2024-01-10T12:00:00Z" }),
			];
			const sorted = sortTimelineEvents(events);
			expect(sorted[0].id).toBe("1");
			expect(sorted[1].id).toBe("2");
		});

		it("does not mutate original", () => {
			const events = [mkEvent({ id: "1" }), mkEvent({ id: "2" })];
			sortTimelineEvents(events);
			expect(events[0].id).toBe("1");
		});
	});

	describe("groupBySession", () => {
		it("groups events by campaignSessionId", () => {
			const events = [
				mkEvent({ id: "1", campaignSessionId: 1 }),
				mkEvent({ id: "2", campaignSessionId: 1 }),
				mkEvent({ id: "3", campaignSessionId: 2 }),
			];
			const groups = groupBySession(events);
			expect(groups).toHaveLength(2);
			const session1 = groups.find((g) => g.sessionNumber === 1);
			expect(session1?.events).toHaveLength(2);
			const session2 = groups.find((g) => g.sessionNumber === 2);
			expect(session2?.events).toHaveLength(1);
		});

		it("includes unassigned group for null session", () => {
			const events = [mkEvent({ id: "1", campaignSessionId: null })];
			const groups = groupBySession(events);
			expect(groups.some((g) => g.label === "Unassigned events")).toBe(true);
		});
	});
});
