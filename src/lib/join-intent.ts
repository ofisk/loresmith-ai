/**
 * Persists join campaign intent across auth flows (e.g. OAuth redirects, email verification)
 * so users can complete joining after signing up.
 */

const STORAGE_KEY = "loresmith-join-intent";

export interface JoinIntent {
	joinToken: string;
	campaignId?: string | null;
	campaignName?: string | null;
	role?: string | null;
}

export function getJoinIntent(): JoinIntent | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as JoinIntent;
		return parsed?.joinToken ? parsed : null;
	} catch {
		return null;
	}
}

export function setJoinIntent(intent: JoinIntent): void {
	if (typeof window === "undefined") return;
	try {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(intent));
	} catch {
		// ignore
	}
}

export function clearJoinIntent(): void {
	if (typeof window === "undefined") return;
	try {
		sessionStorage.removeItem(STORAGE_KEY);
	} catch {
		// ignore
	}
}
