import { describe, expect, it, vi } from "vitest";
import { CommunityDAO } from "@/dao/community-dao";

describe("CommunityDAO", () => {
	it("batches large entity-id lookups to avoid D1 parameter limits", async () => {
		const dao = new CommunityDAO({} as any);
		const queryAllMock = vi
			.spyOn(dao as any, "queryAll")
			.mockImplementation(async (sql: string, params: unknown[]) => {
				if (sql.includes("FROM communities c")) {
					expect(params.length).toBeLessThanOrEqual(91);
					return [
						{
							id: "comm-1",
							campaign_id: "campaign-1",
							level: 1,
							parent_community_id: null,
							entity_ids: "[]",
							metadata: null,
							created_at: "2026-03-02T00:00:00.000Z",
						},
						{
							id: "comm-2",
							campaign_id: "campaign-1",
							level: 2,
							parent_community_id: null,
							entity_ids: "[]",
							metadata: null,
							created_at: "2026-03-01T00:00:00.000Z",
						},
					];
				}

				if (sql.includes("FROM community_entities")) {
					expect(params.length).toBeLessThanOrEqual(90);
					return [
						{ community_id: "comm-1", entity_id: "ent-1" },
						{ community_id: "comm-2", entity_id: "ent-2" },
					];
				}

				return [];
			});

		const largeEntitySet = Array.from(
			{ length: 248 },
			(_, index) => `ent-${index}`
		);
		const communities = await dao.findCommunitiesContainingEntities(
			"campaign-1",
			largeEntitySet
		);

		const communityQueryCalls = queryAllMock.mock.calls.filter(([sql]) =>
			String(sql).includes("FROM communities c")
		);
		expect(communityQueryCalls.length).toBeGreaterThan(1);
		expect(communities).toHaveLength(2);
		expect(communities[0].id).toBe("comm-1");
		expect(communities[1].id).toBe("comm-2");
	});
});
