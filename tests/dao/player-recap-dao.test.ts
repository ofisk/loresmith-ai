import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it } from "vitest";
import { PlayerRecapDAO } from "@/dao/player-recap-dao";

/**
 * Unsubscribe is the only consent control on player recap emails: nobody opts
 * in, they opt out from a link in the mail. That makes these SQL semantics
 * load-bearing, and none of them can be exercised against a mocked D1 —
 * `ON CONFLICT DO NOTHING`, a LEFT JOIN's exclusion behaviour, and D1's
 * `meta.changes` are exactly what the mocks paper over.
 *
 * The schema comes from the real migration file so these tests fail if the
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
	join(__dirname, "../../migrations/0030_player_recap_emails.sql"),
	"utf8"
);

describe("PlayerRecapDAO", () => {
	let db: DatabaseSync;
	let dao: PlayerRecapDAO;

	beforeEach(() => {
		db = new DatabaseSync(":memory:");
		// Parent tables the migration's foreign keys reference.
		db.exec(`
			CREATE TABLE campaigns (id text primary key, username text, name text);
			CREATE TABLE users (
				id text primary key,
				username text unique,
				email text not null unique,
				email_verified_at datetime
			);
			CREATE TABLE campaign_members (
				campaign_id text not null,
				username text not null,
				role text not null,
				invited_by text not null,
				primary key (campaign_id, username)
			);
		`);
		db.exec(MIGRATION);

		db.exec(`
			INSERT INTO campaigns VALUES ('c1', 'gm', 'Embers of the North');
			INSERT INTO users VALUES ('u1', 'alice', 'alice@example.com', '2026-01-01');
			INSERT INTO users VALUES ('u2', 'bob', 'bob@example.com', NULL);
			INSERT INTO users VALUES ('u3', 'gmuser', 'gm@example.com', '2026-01-01');
			INSERT INTO campaign_members VALUES ('c1', 'alice', 'editor_player', 'gm');
			INSERT INTO campaign_members VALUES ('c1', 'bob', 'readonly_player', 'gm');
			INSERT INTO campaign_members VALUES ('c1', 'gmuser', 'editor_gm', 'gm');
		`);

		dao = new PlayerRecapDAO(d1Adapter(db));
	});

	describe("listPlayerMembers", () => {
		it("returns players only, never GM-role members", async () => {
			const members = await dao.listPlayerMembers("c1");

			expect(members.map((m) => m.username)).toEqual(["alice", "bob"]);
		});

		it("surfaces verification state so unverified players can be excluded", async () => {
			const members = await dao.listPlayerMembers("c1");

			expect(members[0].email_verified_at).toBe("2026-01-01");
			expect(members[1].email_verified_at).toBeNull();
		});
	});

	describe("unsubscribe", () => {
		it("excludes the player from later sends", async () => {
			const token = await dao.ensureUnsubscribeToken("c1", "alice", "tok-a");

			const before = await dao.listPlayerMembers("c1");
			expect(before[0].unsubscribed_at).toBeNull();

			const result = await dao.unsubscribeByToken(token);
			expect(result).toEqual({ campaignId: "c1", username: "alice" });

			const after = await dao.listPlayerMembers("c1");
			expect(after[0].unsubscribed_at).not.toBeNull();
		});

		it("is not undone by a later send", async () => {
			await dao.ensureUnsubscribeToken("c1", "alice", "tok-a");
			await dao.unsubscribeByToken("tok-a");

			// The next send calls ensureUnsubscribeToken again for every recipient.
			await dao.ensureUnsubscribeToken("c1", "alice", "tok-second-send");

			const after = await dao.listPlayerMembers("c1");
			expect(after[0].unsubscribed_at).not.toBeNull();
		});

		it("keeps the token stable so links in older emails keep working", async () => {
			const first = await dao.ensureUnsubscribeToken("c1", "alice", "tok-a");
			const second = await dao.ensureUnsubscribeToken("c1", "alice", "tok-b");

			expect(second).toBe(first);
			expect(await dao.unsubscribeByToken("tok-a")).toEqual({
				campaignId: "c1",
				username: "alice",
			});
		});

		it("is idempotent, so a repeated one-click POST is harmless", async () => {
			await dao.ensureUnsubscribeToken("c1", "alice", "tok-a");
			await dao.unsubscribeByToken("tok-a");
			const repeat = await dao.unsubscribeByToken("tok-a");

			expect(repeat).toEqual({ campaignId: "c1", username: "alice" });
			expect(
				(await dao.listPlayerMembers("c1"))[0].unsubscribed_at
			).not.toBeNull();
		});

		it("returns null for an unknown token instead of throwing", async () => {
			expect(await dao.unsubscribeByToken("nope")).toBeNull();
		});

		it("is scoped to one campaign", async () => {
			db.exec(`
				INSERT INTO campaigns VALUES ('c2', 'gm', 'Second Campaign');
				INSERT INTO campaign_members VALUES ('c2', 'alice', 'editor_player', 'gm');
			`);
			await dao.ensureUnsubscribeToken("c1", "alice", "tok-c1");
			await dao.unsubscribeByToken("tok-c1");

			const other = await dao.listPlayerMembers("c2");
			expect(other[0].unsubscribed_at).toBeNull();
		});
	});

	describe("claimForSend", () => {
		beforeEach(async () => {
			await dao.setSettings("c1", true);
			await dao.createRecap({
				id: "r1",
				campaignId: "c1",
				digestId: "d1",
				sessionNumber: 3,
				subject: "Session 3 recap",
				bodyMarkdown: "## What happened\n\n- The siege broke\n",
				nextSessionDate: null,
				createdBy: "gm",
			});
		});

		it("lets exactly one caller claim a draft", async () => {
			expect(await dao.claimForSend("r1", "gm")).toBe(true);
			expect(await dao.claimForSend("r1", "gm")).toBe(false);
		});

		it("refuses to edit a recap once it is claimed", async () => {
			await dao.claimForSend("r1", "gm");

			expect(await dao.updateDraft("r1", { subject: "edited" })).toBe(0);
			expect((await dao.getRecapById("r1"))?.subject).toBe("Session 3 recap");
		});

		it("allows a fully failed send to return to draft and be re-claimed", async () => {
			await dao.claimForSend("r1", "gm");
			await dao.markSendFailed("r1");

			expect(await dao.resetToDraft("r1")).toBe(1);
			expect(await dao.claimForSend("r1", "gm")).toBe(true);
		});

		it("will not reset a successfully sent recap back to draft", async () => {
			await dao.claimForSend("r1", "gm");

			expect(await dao.resetToDraft("r1")).toBe(0);
		});
	});

	describe("settings", () => {
		it("defaults to disabled when no row exists", async () => {
			expect(await dao.getSettings("c1")).toEqual({
				campaignId: "c1",
				enabled: false,
			});
		});

		it("round-trips an enable and a later disable", async () => {
			await dao.setSettings("c1", true);
			expect((await dao.getSettings("c1")).enabled).toBe(true);

			await dao.setSettings("c1", false);
			expect((await dao.getSettings("c1")).enabled).toBe(false);
		});
	});
});
