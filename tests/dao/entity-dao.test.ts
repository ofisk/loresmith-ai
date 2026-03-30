import type { D1Database } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it } from "vitest";
import type { EntityRecord } from "@/dao/entity-dao";
import { EntityDAO } from "@/dao/entity-dao";
import { createMockD1, createMockStmt } from "./helpers";

describe("EntityDAO", () => {
	let dao: EntityDAO;
	let mockDB: D1Database;
	let mockStmt: ReturnType<typeof createMockStmt>;

	beforeEach(() => {
		mockStmt = createMockStmt();
		mockDB = createMockD1(mockStmt);
		dao = new EntityDAO(mockDB);
	});

	describe("createEntity", () => {
		it("calls execute with correct params", async () => {
			expect.hasAssertions();

			await dao.createEntity({
				id: "e1",
				campaignId: "c1",
				entityType: "npc",
				name: "Gandalf",
				content: { description: "A wizard" },
			});

			expect(mockDB.prepare).toHaveBeenCalled();
			expect(mockStmt.bind).toHaveBeenCalledWith(
				"e1",
				"c1",
				"npc",
				"Gandalf",
				expect.any(String),
				null,
				null,
				null,
				null,
				null,
				null
			);
			expect(mockStmt.run).toHaveBeenCalled();
		});

		it("propagates database errors when run rejects", async () => {
			expect.hasAssertions();

			mockStmt.run.mockRejectedValue(new Error("D1 constraint violated"));

			await expect(
				dao.createEntity({
					id: "e1",
					campaignId: "c1",
					entityType: "npc",
					name: "Gandalf",
				})
			).rejects.toThrow("D1 constraint violated");
		});
	});

	describe("getEntityById", () => {
		it("returns null when no row", async () => {
			expect.hasAssertions();

			mockStmt.first.mockResolvedValue(null);

			const result = await dao.getEntityById("e1");

			expect(result).toBeNull();
			expect(mockStmt.bind).toHaveBeenCalledWith("e1");
		});

		it("returns mapped entity when row exists", async () => {
			expect.hasAssertions();

			const row: EntityRecord = {
				id: "e1",
				campaign_id: "c1",
				entity_type: "npc",
				name: "Gandalf",
				content: JSON.stringify({ description: "A wizard" }),
				metadata: null,
				confidence: null,
				source_type: null,
				source_id: null,
				embedding_id: null,
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
			};
			mockStmt.first.mockResolvedValue(row);

			const result = await dao.getEntityById("e1");

			expect(result).not.toBeNull();
			expect(result?.id).toBe("e1");
			expect(result?.campaignId).toBe("c1");
			expect(result?.entityType).toBe("npc");
			expect(result?.name).toBe("Gandalf");
			expect(result?.content).toEqual({ description: "A wizard" });
		});
	});

	describe("listEntitiesByCampaign", () => {
		it("uses limit and offset", async () => {
			expect.hasAssertions();

			mockStmt.all.mockResolvedValue({ results: [] });

			await dao.listEntitiesByCampaign("c1", { limit: 10, offset: 5 });

			expect(mockDB.prepare).toHaveBeenCalledWith(
				expect.stringContaining("LIMIT ?")
			);
			expect(mockStmt.bind).toHaveBeenCalledWith("c1", 10, 5);
		});

		it("filters by entityType when provided", async () => {
			expect.hasAssertions();

			mockStmt.all.mockResolvedValue({ results: [] });

			await dao.listEntitiesByCampaign("c1", { entityType: "location" });

			expect(mockDB.prepare).toHaveBeenCalledWith(
				expect.stringContaining("entity_type")
			);
			expect(mockStmt.bind).toHaveBeenCalledWith("c1", "location");
		});

		it("supports SQL shard status and source filters", async () => {
			expect.hasAssertions();

			mockStmt.all.mockResolvedValue({ results: [] });

			await dao.listEntitiesByCampaign("c1", {
				sourceId: "resource-1",
				shardStatus: ["staging", "approved"],
				excludeShardStatuses: ["rejected"],
				limit: 25,
			});

			expect(mockDB.prepare).toHaveBeenCalledWith(
				expect.stringContaining("source_id = ?")
			);
			expect(mockDB.prepare).toHaveBeenCalledWith(
				expect.stringContaining("shard_status IN")
			);
			expect(mockDB.prepare).toHaveBeenCalledWith(
				expect.stringContaining("shard_status NOT IN")
			);
			expect(mockStmt.bind).toHaveBeenCalledWith(
				"c1",
				"resource-1",
				"staging",
				"approved",
				"rejected",
				25
			);
		});

		it("supports entityIds through json_each", async () => {
			expect.hasAssertions();

			mockStmt.all.mockResolvedValue({ results: [] });

			await dao.listEntitiesByCampaign("c1", {
				entityIds: ["e1", "e2"],
			});

			expect(mockDB.prepare).toHaveBeenCalledWith(
				expect.stringContaining("json_each")
			);
			expect(mockStmt.bind).toHaveBeenCalledWith(
				"c1",
				JSON.stringify(["e1", "e2"])
			);
		});

		it("omits json_each when entityIds is empty", async () => {
			expect.hasAssertions();

			mockStmt.all.mockResolvedValue({ results: [] });

			await dao.listEntitiesByCampaign("c1", { entityIds: [] });

			expect(mockDB.prepare).toHaveBeenCalledWith(
				expect.not.stringContaining("json_each")
			);
		});
	});

	describe("getEntitiesByIds", () => {
		it("returns empty array for empty input", async () => {
			expect.hasAssertions();

			const result = await dao.getEntitiesByIds([]);

			expect(result).toEqual([]);
			expect(mockDB.prepare).not.toHaveBeenCalled();
		});

		it("returns mapped entities for non-empty input", async () => {
			expect.hasAssertions();

			const rows: EntityRecord[] = [
				{
					id: "e1",
					campaign_id: "c1",
					entity_type: "npc",
					name: "Gandalf",
					content: null,
					metadata: null,
					confidence: null,
					source_type: null,
					source_id: null,
					embedding_id: null,
					created_at: "2024-01-01T00:00:00Z",
					updated_at: "2024-01-01T00:00:00Z",
				},
			];
			mockStmt.all.mockResolvedValue({ results: rows });

			const result = await dao.getEntitiesByIds(["e1"]);

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("e1");
			expect(result[0].name).toBe("Gandalf");
			expect(mockDB.prepare).toHaveBeenCalledWith(
				expect.stringContaining("id IN (?)")
			);
			expect(mockStmt.bind).toHaveBeenCalledWith("e1");
		});

		it("chunks id lists so each query stays under D1 bind limits", async () => {
			expect.hasAssertions();

			const mkRow = (id: string): EntityRecord => ({
				id,
				campaign_id: "c1",
				entity_type: "npc",
				name: id,
				content: null,
				metadata: null,
				confidence: null,
				source_type: null,
				source_id: null,
				embedding_id: null,
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
			});

			const ids = Array.from({ length: 95 }, (_, i) => `e-${i}`);
			let call = 0;
			mockStmt.all.mockImplementation(async () => {
				call += 1;
				if (call === 1) {
					return { results: ids.slice(0, 90).map(mkRow) };
				}
				return { results: ids.slice(90).map(mkRow) };
			});

			const result = await dao.getEntitiesByIds(ids);

			expect(mockDB.prepare).toHaveBeenCalledTimes(2);
			expect(result).toHaveLength(95);
		});
	});
});
