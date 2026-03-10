import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	clearJoinIntent,
	getJoinIntent,
	type JoinIntent,
	setJoinIntent,
} from "@/lib/join-intent";

describe("join-intent", () => {
	const validIntent: JoinIntent = {
		joinToken: "token-123",
		campaignId: "campaign-1",
		campaignName: "Test Campaign",
		role: "player",
	};

	beforeEach(() => {
		vi.stubGlobal("window", {});
		vi.stubGlobal("sessionStorage", {
			getItem: vi.fn(),
			setItem: vi.fn(),
			removeItem: vi.fn(),
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("getJoinIntent returns null when no window", () => {
		vi.stubGlobal("window", undefined);
		expect(getJoinIntent()).toBeNull();
	});

	it("getJoinIntent returns null when storage empty", () => {
		(sessionStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
		expect(getJoinIntent()).toBeNull();
	});

	it("getJoinIntent returns null when invalid JSON", () => {
		(sessionStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(
			"invalid"
		);
		expect(getJoinIntent()).toBeNull();
	});

	it("getJoinIntent returns null when no joinToken", () => {
		(sessionStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(
			JSON.stringify({ campaignId: "c1" })
		);
		expect(getJoinIntent()).toBeNull();
	});

	it("getJoinIntent returns parsed intent when valid", () => {
		(sessionStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(
			JSON.stringify(validIntent)
		);
		expect(getJoinIntent()).toEqual(validIntent);
	});

	it("setJoinIntent stores stringified intent", () => {
		setJoinIntent(validIntent);
		expect(sessionStorage.setItem).toHaveBeenCalledWith(
			"loresmith-join-intent",
			JSON.stringify(validIntent)
		);
	});

	it("setJoinIntent does nothing when no window", () => {
		vi.stubGlobal("window", undefined);
		setJoinIntent(validIntent);
		expect(sessionStorage.setItem).not.toHaveBeenCalled();
	});

	it("clearJoinIntent removes from storage", () => {
		clearJoinIntent();
		expect(sessionStorage.removeItem).toHaveBeenCalledWith(
			"loresmith-join-intent"
		);
	});
});
