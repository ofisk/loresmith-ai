// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { EventData } from "react-joyride";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTourState } from "@/hooks/useTourState";

const ev = (partial: Partial<EventData>) => partial as EventData;

describe("useTourState", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.clear();
	});

	it("initializes with runTour false and stepIndex 0", () => {
		const authState = {
			isAuthenticated: false,
			getStoredJwt: vi.fn(() => null),
		};
		const { result } = renderHook(() => useTourState({ authState }));
		expect(result.current.runTour).toBe(false);
		expect(result.current.stepIndex).toBe(0);
	});

	it("handleJoyrideCallback with action close sets runTour to false", () => {
		const authState = {
			isAuthenticated: true,
			getStoredJwt: vi.fn(() => "jwt"),
		};
		const { result } = renderHook(() => useTourState({ authState }));
		act(() =>
			result.current.handleJoyrideCallback(ev({ action: "close" }), {} as never)
		);
		expect(result.current.runTour).toBe(false);
		expect(localStorage.getItem("loresmith-tour-completed")).toBe("true");
	});

	it("handleJoyrideCallback with status finished sets runTour to false", () => {
		const authState = {
			isAuthenticated: true,
			getStoredJwt: vi.fn(() => "jwt"),
		};
		const { result } = renderHook(() => useTourState({ authState }));
		act(() =>
			result.current.handleJoyrideCallback(
				ev({ status: "finished" }),
				{} as never
			)
		);
		expect(result.current.runTour).toBe(false);
	});

	it("handleJoyrideCallback step:after with next updates stepIndex", () => {
		const authState = {
			isAuthenticated: true,
			getStoredJwt: vi.fn(() => "jwt"),
		};
		const { result } = renderHook(() => useTourState({ authState }));
		act(() =>
			result.current.handleJoyrideCallback(
				ev({
					action: "next",
					index: 0,
					type: "step:after",
				}),
				{} as never
			)
		);
		expect(result.current.stepIndex).toBe(1);
	});

	it("handleJoyrideCallback step:after with prev decrements stepIndex", () => {
		const authState = {
			isAuthenticated: true,
			getStoredJwt: vi.fn(() => "jwt"),
		};
		const { result } = renderHook(() => useTourState({ authState }));
		act(() =>
			result.current.handleJoyrideCallback(
				ev({
					action: "prev",
					index: 2,
					type: "step:after",
				}),
				{} as never
			)
		);
		expect(result.current.stepIndex).toBe(1);
	});

	it("returns steps array with expected structure", () => {
		const authState = {
			isAuthenticated: false,
			getStoredJwt: vi.fn(() => null),
		};
		const { result } = renderHook(() => useTourState({ authState }));
		expect(result.current.steps).toBeDefined();
		expect(Array.isArray(result.current.steps)).toBe(true);
		expect(result.current.steps.length).toBeGreaterThan(0);
		expect(result.current.steps[0]).toHaveProperty("target");
		expect(result.current.steps[0]).toHaveProperty("content");
	});
});
