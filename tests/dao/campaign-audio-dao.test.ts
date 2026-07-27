import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it } from "vitest";
import { CampaignAudioDAO } from "@/dao/campaign-audio-dao";

/**
 * Audio rows carry the async generation state machine for #756 —
 * pending → ready | failed — and that lifecycle is the thing worth exercising
 * against real SQL rather than a mocked D1. The boolean round-trip matters too:
 * SQLite has no boolean type, so `loopable` is an INTEGER that the DAO has to
 * map back, and a mock would happily hand back whatever it was given.
 *
 * The schema comes from the real migration file, so these tests fail if the
 * migration and the queries drift apart.
 */

function d1Adapter(db: DatabaseSync): D1Database {
	return {
		prepare(sql: string) {
			return {
				bind(...params: unknown[]) {
					return {
						all: async () => ({
							results: db.prepare(sql).all(...(params as [])),
						}),
						first: async () => db.prepare(sql).get(...(params as [])) ?? null,
						run: async () => {
							const result = db.prepare(sql).run(...(params as []));
							return { meta: { changes: Number(result.changes ?? 0) } };
						},
					};
				},
			};
		},
	} as unknown as D1Database;
}

const MIGRATION = readFileSync(
	join(__dirname, "../../migrations/0033_campaign_audio.sql"),
	"utf8"
);

let db: DatabaseSync;
let dao: CampaignAudioDAO;

beforeEach(() => {
	db = new DatabaseSync(":memory:");
	// The migration has a foreign key onto campaigns; create a stand-in so the
	// real DDL can be applied verbatim.
	db.exec("CREATE TABLE campaigns (id TEXT PRIMARY KEY)");
	db.exec("INSERT INTO campaigns (id) VALUES ('campaign-1'), ('campaign-2')");
	db.exec(MIGRATION);
	dao = new CampaignAudioDAO(d1Adapter(db));
});

function createTrack(id: string, overrides: Record<string, unknown> = {}) {
	return dao.createAudio(id, {
		campaignId: "campaign-1",
		kind: "ambience",
		title: "Ambience: The Weeping Crypt",
		description: null,
		prompt: "Continuous background ambience: dripping water.",
		loopable: true,
		source: { kind: "entity", id: "entity-1", label: "The Weeping Crypt" },
		createdBy: "gm",
		...overrides,
	} as Parameters<typeof dao.createAudio>[1]);
}

describe("CampaignAudioDAO", () => {
	it("writes a new track as pending with no file attached yet", async () => {
		await createTrack("audio-1");

		const record = await dao.getAudioById("audio-1");

		expect(record?.status).toBe("pending");
		expect(record?.r2Key).toBeNull();
		expect(record?.durationSec).toBeNull();
	});

	it("round-trips loopable through SQLite's integer boolean", async () => {
		await createTrack("audio-1", { loopable: true });
		await createTrack("audio-2", { loopable: false });

		expect((await dao.getAudioById("audio-1"))?.loopable).toBe(true);
		expect((await dao.getAudioById("audio-2"))?.loopable).toBe(false);
	});

	it("preserves the source reference so a track can be shown beside its scene", async () => {
		await createTrack("audio-1");

		expect((await dao.getAudioById("audio-1"))?.source).toEqual({
			kind: "entity",
			id: "entity-1",
			label: "The Weeping Crypt",
		});
	});

	it("reports no source when the track was not tied to anything", async () => {
		await createTrack("audio-1", { source: null });

		expect((await dao.getAudioById("audio-1"))?.source).toBeNull();
	});

	it("moves a track to ready and attaches provider metadata", async () => {
		await createTrack("audio-1");

		await dao.completeAudio("audio-1", {
			r2Key: "campaigns/campaign-1/audio/audio-1.mp3",
			contentType: "audio/mpeg",
			durationSec: 20.5,
			sizeBytes: 320_000,
			provider: "ai-gateway:elevenlabs",
			model: "eleven_text_to_sound_v2",
		});

		const record = await dao.getAudioById("audio-1");
		expect(record?.status).toBe("ready");
		expect(record?.r2Key).toBe("campaigns/campaign-1/audio/audio-1.mp3");
		expect(record?.durationSec).toBe(20.5);
		expect(record?.provider).toBe("ai-gateway:elevenlabs");
	});

	it("clears a stale error when a retry succeeds", async () => {
		await createTrack("audio-1");
		await dao.failAudio("audio-1", "Provider timed out");

		await dao.completeAudio("audio-1", {
			r2Key: "k",
			contentType: "audio/mpeg",
			durationSec: 10,
			sizeBytes: 1,
			provider: "workers-ai",
			model: "@cf/deepgram/aura-1",
		});

		const record = await dao.getAudioById("audio-1");
		expect(record?.status).toBe("ready");
		// A ready track showing an old failure reason would be actively misleading.
		expect(record?.errorMessage).toBeNull();
	});

	it("records a failure reason the GM can read", async () => {
		await createTrack("audio-1");
		await dao.failAudio("audio-1", "No provider supports music yet");

		const record = await dao.getAudioById("audio-1");
		expect(record?.status).toBe("failed");
		expect(record?.errorMessage).toBe("No provider supports music yet");
	});

	it("truncates a runaway provider error rather than storing it whole", async () => {
		await createTrack("audio-1");
		await dao.failAudio("audio-1", "x".repeat(2000));

		const record = await dao.getAudioById("audio-1");
		expect(record?.errorMessage?.length).toBe(500);
	});

	it("never returns another campaign's tracks", async () => {
		await createTrack("audio-1");
		await createTrack("audio-2", { campaignId: "campaign-2" });

		const tracks = await dao.listAudioForCampaign("campaign-1");
		expect(tracks.map((t) => t.id)).toEqual(["audio-1"]);
	});

	it("filters by kind", async () => {
		await createTrack("audio-1", { kind: "ambience" });
		await createTrack("audio-2", { kind: "music" });

		const music = await dao.listAudioForCampaign("campaign-1", {
			kind: "music",
		});
		expect(music.map((t) => t.id)).toEqual(["audio-2"]);
	});

	it("filters by source, which is how the runsheet finds a scene's audio", async () => {
		await createTrack("audio-1");
		await createTrack("audio-2", {
			source: { kind: "entity", id: "entity-2", label: "Elsewhere" },
		});

		const found = await dao.listAudioForCampaign("campaign-1", {
			sourceKind: "entity",
			sourceId: "entity-1",
		});
		expect(found.map((t) => t.id)).toEqual(["audio-1"]);
	});

	it("applies partial updates without clearing untouched columns", async () => {
		await createTrack("audio-1");

		await dao.updateAudio("audio-1", { title: "Crypt bed" });

		const record = await dao.getAudioById("audio-1");
		expect(record?.title).toBe("Crypt bed");
		expect(record?.loopable).toBe(true);
		expect(record?.prompt).toContain("dripping water");
	});

	it("is a no-op when an update carries no fields", async () => {
		await createTrack("audio-1");

		await dao.updateAudio("audio-1", {});

		expect((await dao.getAudioById("audio-1"))?.title).toBe(
			"Ambience: The Weeping Crypt"
		);
	});

	it("deletes a track", async () => {
		await createTrack("audio-1");
		await dao.deleteAudio("audio-1");

		expect(await dao.getAudioById("audio-1")).toBeNull();
	});

	it("sums generated seconds, the unit audio is actually billed in", async () => {
		await createTrack("audio-1");
		await createTrack("audio-2");
		await dao.completeAudio("audio-1", {
			r2Key: "a",
			contentType: "audio/mpeg",
			durationSec: 20,
			sizeBytes: 1,
			provider: "p",
			model: "m",
		});
		await dao.completeAudio("audio-2", {
			r2Key: "b",
			contentType: "audio/mpeg",
			durationSec: 12.5,
			sizeBytes: 1,
			provider: "p",
			model: "m",
		});

		expect(await dao.getGeneratedSecondsSince("campaign-1", "1970-01-01")).toBe(
			32.5
		);
	});

	it("excludes pending and failed tracks from billed seconds", async () => {
		await createTrack("audio-1");
		await createTrack("audio-2");
		await dao.failAudio("audio-2", "nope");

		// Nothing reached `ready`, so nothing was generated and nothing is billable.
		expect(await dao.getGeneratedSecondsSince("campaign-1", "1970-01-01")).toBe(
			0
		);
	});

	it("returns null for an unknown id", async () => {
		expect(await dao.getAudioById("nope")).toBeNull();
	});
});
