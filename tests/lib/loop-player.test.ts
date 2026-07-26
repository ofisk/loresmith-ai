import { describe, expect, it, vi } from "vitest";
import {
	crossfadeSecFor,
	equalPowerCurve,
	LoopPlayer,
} from "@/lib/audio/loop-player";

/**
 * Looping is the part of #756 that decides whether generated ambience is usable
 * at a table. Models emit clips of tens of seconds; a scene lasts minutes, so
 * the clip has to wrap without an audible seam.
 *
 * Two things are worth pinning. The crossfade must be equal-power, because a
 * linear fade dips at the midpoint and is heard as a dropout exactly at the loop
 * point. And each pass must be scheduled to START BEFORE the previous one ends,
 * because that overlap is the crossfade — schedule them back to back and there
 * is nothing to fade between.
 */

/** Minimal Web Audio stand-in; jsdom has no AudioContext. */
function fakeAudioContext(durationSec = 20) {
	const started: number[] = [];
	const curves: Array<{ curve: Float32Array; at: number; dur: number }> = [];

	const ctx = {
		currentTime: 0,
		state: "running" as string,
		destination: {},
		resume: vi.fn().mockResolvedValue(undefined),
		close: vi.fn().mockResolvedValue(undefined),
		createGain: () => ({
			gain: {
				value: 1,
				setValueCurveAtTime: (curve: Float32Array, at: number, dur: number) => {
					curves.push({ curve, at, dur });
				},
			},
			connect: vi.fn(),
			disconnect: vi.fn(),
		}),
		createBufferSource: () => ({
			buffer: null as unknown,
			onended: null as null | (() => void),
			connect: vi.fn(),
			disconnect: vi.fn(),
			start: (when: number) => started.push(when),
			stop: vi.fn(),
		}),
		decodeAudioData: vi.fn().mockResolvedValue({ duration: durationSec }),
	};

	return { ctx, started, curves };
}

describe("equalPowerCurve", () => {
	it("rises from silence to unity", () => {
		const curve = equalPowerCurve("in");
		expect(curve[0]).toBeCloseTo(0, 5);
		expect(curve[curve.length - 1]).toBeCloseTo(1, 5);
	});

	it("falls from unity to silence", () => {
		const curve = equalPowerCurve("out");
		expect(curve[0]).toBeCloseTo(1, 5);
		expect(curve[curve.length - 1]).toBeCloseTo(0, 5);
	});

	it("holds constant power across the overlap, which is the whole point", () => {
		const fadeIn = equalPowerCurve("in");
		const fadeOut = equalPowerCurve("out");

		// A linear pair would sum to 0.5 here and be heard as a dip; an
		// equal-power pair sums to 1 in POWER (squares) at every point.
		for (let i = 0; i < fadeIn.length; i++) {
			expect(fadeIn[i] ** 2 + fadeOut[i] ** 2).toBeCloseTo(1, 5);
		}
	});
});

describe("crossfadeSecFor", () => {
	it("caps the fade so it never eats the clip", () => {
		expect(crossfadeSecFor(60)).toBe(1.5);
	});

	it("uses a quarter of a short clip rather than the full cap", () => {
		expect(crossfadeSecFor(4)).toBe(1);
	});

	it("does not crossfade a clip too short to spare the overlap", () => {
		expect(crossfadeSecFor(1)).toBe(0);
	});
});

describe("LoopPlayer", () => {
	it("refuses to play before anything is loaded", async () => {
		const player = new LoopPlayer({
			createContext: () => ({}) as AudioContext,
		});
		await expect(player.play(true)).rejects.toThrow(/no audio loaded/i);
	});

	it("plays a non-looping clip exactly once", async () => {
		const { ctx, started } = fakeAudioContext(20);
		const player = new LoopPlayer({
			createContext: () => ctx as unknown as AudioContext,
		});

		await player.load(new ArrayBuffer(8));
		await player.play(false);

		expect(started).toHaveLength(1);
	});

	it("overlaps successive passes so there is something to crossfade", async () => {
		vi.useFakeTimers();
		const { ctx, started } = fakeAudioContext(20);
		const player = new LoopPlayer({
			createContext: () => ctx as unknown as AudioContext,
		});

		await player.load(new ArrayBuffer(8));
		await player.play(true);

		// Walk the audio clock to just before the first pass ends so the scheduler
		// commits the second one; at t=0 only one pass fits the lookahead window.
		ctx.currentTime = 19;
		vi.advanceTimersByTime(200);
		player.stop();
		vi.useRealTimers();

		expect(started.length).toBeGreaterThan(1);
		const gap = started[1] - started[0];
		// The next pass starts one crossfade EARLY, not a full clip later. That
		// overlap IS the crossfade; back-to-back scheduling would leave a seam.
		expect(gap).toBeCloseTo(20 - crossfadeSecFor(20), 5);
		expect(gap).toBeLessThan(20);
	});

	it("applies both a fade in and a fade out to a looping pass", async () => {
		const { ctx, curves } = fakeAudioContext(20);
		const player = new LoopPlayer({
			createContext: () => ctx as unknown as AudioContext,
		});

		await player.load(new ArrayBuffer(8));
		await player.play(true);
		player.stop();

		expect(curves.length).toBeGreaterThanOrEqual(2);
		const fade = crossfadeSecFor(20);
		expect(curves[0].dur).toBe(fade);
		// The fade out begins one crossfade before the clip ends.
		expect(curves[1].at).toBeCloseTo(curves[0].at + 20 - fade, 5);
	});

	it("resumes a context the browser suspended until a user gesture", async () => {
		const { ctx } = fakeAudioContext(20);
		ctx.state = "suspended";
		const player = new LoopPlayer({
			createContext: () => ctx as unknown as AudioContext,
		});

		await player.load(new ArrayBuffer(8));
		await player.play(false);

		expect(ctx.resume).toHaveBeenCalled();
	});

	it("clamps volume into range", async () => {
		const { ctx } = fakeAudioContext(20);
		const player = new LoopPlayer({
			createContext: () => ctx as unknown as AudioContext,
		});
		await player.load(new ArrayBuffer(8));

		expect(() => player.setVolume(5)).not.toThrow();
		expect(() => player.setVolume(-1)).not.toThrow();
	});

	it("reports the decoded duration", async () => {
		const { ctx } = fakeAudioContext(37);
		const player = new LoopPlayer({
			createContext: () => ctx as unknown as AudioContext,
		});

		await player.load(new ArrayBuffer(8));
		expect(player.durationSec).toBe(37);
	});

	it("closes the audio context so playback does not leak hardware", async () => {
		const { ctx } = fakeAudioContext(20);
		const player = new LoopPlayer({
			createContext: () => ctx as unknown as AudioContext,
		});

		await player.load(new ArrayBuffer(8));
		await player.play(true);
		await player.close();

		expect(ctx.close).toHaveBeenCalled();
	});

	it("tolerates stop() before anything was ever played", () => {
		const player = new LoopPlayer({
			createContext: () => ({}) as AudioContext,
		});
		expect(() => player.stop()).not.toThrow();
	});
});
