import { describe, expect, it } from "vitest";
import type { GraphRelationshipEdge } from "@/dao/entity-dao";
import { buildRelationshipMapFromEdges } from "@/lib/graph/graph-visualization-helpers";

describe("buildRelationshipMapFromEdges", () => {
	it("builds adjacency lists for both endpoints when both are in the entity set", () => {
		const edges: GraphRelationshipEdge[] = [
			{
				fromEntityId: "a",
				toEntityId: "b",
				relationshipType: "member_of",
			},
		];
		const entityIds = new Set(["a", "b"]);
		const map = buildRelationshipMapFromEdges(edges, entityIds);

		expect(map.get("a")).toEqual([{ toId: "b", type: "member_of" }]);
		expect(map.get("b")).toEqual([{ toId: "a", type: "member_of" }]);
	});

	it("includes an edge on one side when the other endpoint is outside the set", () => {
		const edges: GraphRelationshipEdge[] = [
			{
				fromEntityId: "a",
				toEntityId: "stub-only",
				relationshipType: "related_to",
			},
		];
		const entityIds = new Set(["a"]);
		const map = buildRelationshipMapFromEdges(edges, entityIds);

		expect(map.get("a")).toEqual([{ toId: "stub-only", type: "related_to" }]);
	});

	it("initializes empty lists for every entity id", () => {
		const map = buildRelationshipMapFromEdges([], new Set(["x", "y"]));
		expect(map.get("x")).toEqual([]);
		expect(map.get("y")).toEqual([]);
	});
});
