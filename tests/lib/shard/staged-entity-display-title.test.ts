import { describe, expect, it } from "vitest";
import {
	looksLikeStagedEntityId,
	resolveStagedShardDisplayTitle,
} from "@/lib/shard/staged-entity-display-title";

describe("looksLikeStagedEntityId", () => {
	it("detects campaign-prefixed UUID entity ids", () => {
		expect(
			looksLikeStagedEntityId(
				"f2ddb51b-705c-4fa5-8921-195e95335f24_27c14093-cb93-4028-9f1a-abcdef123456"
			)
		).toBe(true);
	});

	it("returns false for human short titles", () => {
		expect(looksLikeStagedEntityId("Ritual under a red moon")).toBe(false);
		expect(looksLikeStagedEntityId("mood_ref")).toBe(false);
	});
});

describe("resolveStagedShardDisplayTitle", () => {
	it("prefers content.title when entity.name looks like an id", () => {
		const title = resolveStagedShardDisplayTitle({
			name: "f2ddb51b-705c-4fa5-8921-195e95335f24_27c14093-cb93-4028-9f1a-abcdef123456",
			entityType: "visual_inspiration",
			content: {
				text: "x",
				title: "Battle on the cliffs",
			},
			metadata: { resourceName: "ref.png" },
		});
		expect(title).toBe("Battle on the cliffs");
	});

	it("uses prettified resource filename when name is id-like and no content title", () => {
		const title = resolveStagedShardDisplayTitle({
			name: "f2ddb51b-705c-4fa5-8921-195e95335f24_uuid",
			entityType: "visual_inspiration",
			content: { text: "Visual inspiration reference\n\nNo title field." },
			metadata: { resourceName: "my_mood_board.png" },
		});
		expect(title).toBe("my_mood_board");
	});

	it("keeps a normal entity.name", () => {
		expect(
			resolveStagedShardDisplayTitle({
				name: "Baron La Croix",
				entityType: "npcs",
				content: {},
				metadata: {},
			})
		).toBe("Baron La Croix");
	});
});
