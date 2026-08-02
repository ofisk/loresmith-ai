/**
 * Seamless looping playback for generated ambience and theme music (issue #756).
 *
 * Why this is not just `<audio loop>`: generative audio models emit short clips
 * (ElevenLabs caps sound effects at 22 seconds), but a scene at the table lasts
 * ten minutes or more. The clip therefore has to loop, and `<audio loop>` leaves
 * an audible gap at the seam because the element re-buffers on wrap. Over a
 * twenty-second bed that gap lands every twenty seconds and is the first thing a
 * player notices.
 *
 * So playback decodes to an AudioBuffer and schedules overlapping sources on the
 * Web Audio clock, crossfading the tail of one pass into the head of the next.
 * The crossfade uses an EQUAL-POWER curve rather than a linear one: for two
 * uncorrelated signals a linear fade dips about 3 dB at the midpoint, which is
 * heard as a dropout exactly at the loop point — the artifact this exists to
 * remove.
 */

/** Longest crossfade worth applying; also capped at a quarter of the clip. */
const MAX_CROSSFADE_SEC = 1.5;

/** Scheduling lookahead. Long enough to survive a busy main thread. */
const SCHEDULE_LOOKAHEAD_SEC = 0.5;
const SCHEDULE_INTERVAL_MS = 200;

/** Minimum clip length worth crossfading; below this, just loop plainly. */
const MIN_CROSSFADE_CLIP_SEC = 2;

export interface LoopPlayerOptions {
	/** Injected for tests; defaults to the platform AudioContext. */
	createContext?: () => AudioContext;
}

/**
 * Build an equal-power fade curve.
 *
 * `sin(x * π/2)` rising and `cos(x * π/2)` falling sum to constant power, so the
 * perceived level holds steady across the overlap.
 */
export function equalPowerCurve(
	direction: "in" | "out",
	steps = 64
): Float32Array {
	const curve = new Float32Array(steps);
	for (let i = 0; i < steps; i++) {
		const x = i / (steps - 1);
		curve[i] =
			direction === "in"
				? Math.sin((x * Math.PI) / 2)
				: Math.cos((x * Math.PI) / 2);
	}
	return curve;
}

/** Crossfade length for a clip: capped, and never more than a quarter of it. */
export function crossfadeSecFor(durationSec: number): number {
	if (durationSec < MIN_CROSSFADE_CLIP_SEC) return 0;
	return Math.min(MAX_CROSSFADE_SEC, durationSec / 4);
}

export class LoopPlayer {
	private ctx: AudioContext | null = null;
	private master: GainNode | null = null;
	private buffer: AudioBuffer | null = null;
	private timer: ReturnType<typeof setInterval> | null = null;
	private sources: AudioBufferSourceNode[] = [];
	/** Web Audio clock time at which the next pass should begin. */
	private nextStartTime = 0;
	private looping = false;
	private volume = 0.8;

	constructor(private readonly options: LoopPlayerOptions = {}) {}

	private context(): AudioContext {
		if (!this.ctx) {
			const create = this.options.createContext ?? (() => new AudioContext());
			this.ctx = create();
			this.master = this.ctx.createGain();
			this.master.gain.value = this.volume;
			this.master.connect(this.ctx.destination);
		}
		return this.ctx;
	}

	/** Decode encoded audio bytes. Must run before `play`. */
	async load(bytes: ArrayBuffer): Promise<void> {
		const ctx = this.context();
		this.buffer = await ctx.decodeAudioData(bytes.slice(0));
	}

	get durationSec(): number {
		return this.buffer?.duration ?? 0;
	}

	setVolume(volume: number): void {
		this.volume = Math.min(Math.max(volume, 0), 1);
		if (this.master) this.master.gain.value = this.volume;
	}

	/**
	 * Start playback.
	 *
	 * When `loop` is false the clip plays once — correct for a creature roar or a
	 * line of NPC dialogue, where looping would be absurd.
	 */
	async play(loop: boolean): Promise<void> {
		if (!this.buffer) throw new Error("No audio loaded");

		const ctx = this.context();
		// Browsers start contexts suspended until a user gesture.
		if (ctx.state === "suspended") await ctx.resume();

		this.stop();
		this.looping = loop;
		this.nextStartTime = ctx.currentTime + 0.05;

		if (!loop) {
			this.scheduleOnce(this.nextStartTime, 0);
			return;
		}

		this.scheduleAhead();
		this.timer = setInterval(() => this.scheduleAhead(), SCHEDULE_INTERVAL_MS);
	}

	stop(): void {
		if (this.timer !== null) {
			clearInterval(this.timer);
			this.timer = null;
		}
		this.looping = false;
		for (const source of this.sources) {
			try {
				source.stop();
			} catch {
				// Already stopped or never started; nothing to undo.
			}
			source.disconnect();
		}
		this.sources = [];
	}

	async close(): Promise<void> {
		this.stop();
		if (this.ctx) {
			await this.ctx.close().catch(() => {});
			this.ctx = null;
			this.master = null;
		}
	}

	/**
	 * Schedule any passes that begin inside the lookahead window.
	 *
	 * Scheduling ahead on the audio clock — rather than starting the next pass
	 * from a timer callback — is what keeps the seam sample-accurate when the main
	 * thread is busy rendering the rest of the app.
	 */
	private scheduleAhead(): void {
		if (!this.buffer || !this.ctx || !this.looping) return;

		const fade = crossfadeSecFor(this.buffer.duration);
		const advance = this.buffer.duration - fade;
		const horizon = this.ctx.currentTime + SCHEDULE_LOOKAHEAD_SEC;

		while (this.nextStartTime < horizon) {
			this.scheduleOnce(this.nextStartTime, fade);
			this.nextStartTime += advance;
		}
	}

	/** Schedule one pass, fading it in and back out over `fade` seconds. */
	private scheduleOnce(startTime: number, fade: number): void {
		const ctx = this.ctx;
		const buffer = this.buffer;
		if (!ctx || !buffer || !this.master) return;

		const source = ctx.createBufferSource();
		source.buffer = buffer;

		const gain = ctx.createGain();
		source.connect(gain);
		gain.connect(this.master);

		if (fade > 0) {
			gain.gain.setValueCurveAtTime(equalPowerCurve("in"), startTime, fade);
			gain.gain.setValueCurveAtTime(
				equalPowerCurve("out"),
				startTime + buffer.duration - fade,
				fade
			);
		}

		source.start(startTime);
		source.onended = () => {
			gain.disconnect();
			this.sources = this.sources.filter((s) => s !== source);
		};

		this.sources.push(source);
	}
}
