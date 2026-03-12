/**
 * Pure helpers for timeline event filtering, sorting, and grouping.
 * No env, DAO, or I/O – safe to unit test.
 */

export type TimelineSource =
	| "session_digest"
	| "world_state_live"
	| "world_state_archived"
	| "timeline_manual";

export interface TimelineEvent {
	id: string;
	source: TimelineSource;
	timestamp: string;
	campaignSessionId: number | null;
	title: string;
	summary: string;
	entityIds: string[];
}

export interface TimelineGroup {
	sessionNumber: number | null;
	label: string;
	events: TimelineEvent[];
}

export interface TimelineFilters {
	fromDate?: string;
	toDate?: string;
	fromSession?: number;
	toSession?: number;
	entityFilter?: string;
}

export function toEpoch(value: string | null | undefined): number {
	if (!value) return Number.NaN;
	return new Date(value).getTime();
}

export function withinDateRange(
	timestamp: string,
	fromDate?: string,
	toDate?: string
): boolean {
	const ts = toEpoch(timestamp);
	if (!Number.isFinite(ts)) return false;

	if (fromDate) {
		const fromTs = toEpoch(fromDate);
		if (Number.isFinite(fromTs) && ts < fromTs) return false;
	}
	if (toDate) {
		const toTs = toEpoch(toDate);
		if (Number.isFinite(toTs) && ts > toTs) return false;
	}
	return true;
}

export function withinSessionRange(
	campaignSessionId: number | null,
	fromSession?: number,
	toSession?: number
): boolean {
	if (campaignSessionId === null) {
		return fromSession === undefined && toSession === undefined;
	}
	if (fromSession !== undefined && campaignSessionId < fromSession)
		return false;
	if (toSession !== undefined && campaignSessionId > toSession) return false;
	return true;
}

export function applyTimelineFilters(
	events: TimelineEvent[],
	filters: TimelineFilters
): TimelineEvent[] {
	const entityFilter = filters.entityFilter?.trim().toLowerCase();
	return events.filter((event) => {
		if (!withinDateRange(event.timestamp, filters.fromDate, filters.toDate)) {
			return false;
		}
		if (
			!withinSessionRange(
				event.campaignSessionId,
				filters.fromSession,
				filters.toSession
			)
		) {
			return false;
		}
		if (!entityFilter) return true;

		const inEntities = event.entityIds.some((id) =>
			id.toLowerCase().includes(entityFilter)
		);
		if (inEntities) return true;

		return (
			event.title.toLowerCase().includes(entityFilter) ||
			event.summary.toLowerCase().includes(entityFilter)
		);
	});
}

const sourcePriority: Record<TimelineSource, number> = {
	session_digest: 0,
	timeline_manual: 1,
	world_state_live: 2,
	world_state_archived: 3,
};

export function sortTimelineEvents(events: TimelineEvent[]): TimelineEvent[] {
	return events.slice().sort((a, b) => {
		const tsDiff = toEpoch(a.timestamp) - toEpoch(b.timestamp);
		if (Number.isFinite(tsDiff) && tsDiff !== 0) return tsDiff;
		const priorityDiff = sourcePriority[a.source] - sourcePriority[b.source];
		if (priorityDiff !== 0) return priorityDiff;
		return a.id.localeCompare(b.id);
	});
}

export function groupBySession(events: TimelineEvent[]): TimelineGroup[] {
	const groups = new Map<number | null, TimelineEvent[]>();
	for (const event of events) {
		const key = event.campaignSessionId ?? null;
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key)!.push(event);
	}

	const keys = Array.from(groups.keys()).sort((a, b) => {
		if (a === null && b === null) return 0;
		if (a === null) return 1;
		if (b === null) return -1;
		return a - b;
	});

	return keys.map((key) => ({
		sessionNumber: key,
		label: key === null ? "Unassigned events" : `Session ${key}`,
		events: groups.get(key) ?? [],
	}));
}
