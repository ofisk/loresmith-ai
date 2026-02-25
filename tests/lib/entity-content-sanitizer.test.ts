import { describe, expect, it } from "vitest";
import { sanitizeEntityContentForPlayer } from "@/lib/entity-content-sanitizer";

describe("sanitizeEntityContentForPlayer", () => {
	it("strips npc secrets", () => {
		const content = { name: "Gandalf", secrets: "He is a maiar" };
		const result = sanitizeEntityContentForPlayer(content, "npc");
		expect(result).toEqual({ name: "Gandalf" });
		expect(result).not.toHaveProperty("secrets");
	});

	it("strips puzzle solution and bypass_methods", () => {
		const content = {
			name: "Riddle door",
			solution: "Speak friend",
			bypass_methods: ["knock"],
		};
		const result = sanitizeEntityContentForPlayer(content, "puzzle");
		expect(result).toEqual({ name: "Riddle door" });
	});

	it("preserves non-spoiler fields for quest", () => {
		const content = {
			name: "Find the artifact",
			summary: "A quest",
			resolutions: ["Success path", "Failure path"],
		};
		const result = sanitizeEntityContentForPlayer(content, "quest");
		expect(result).toEqual({ name: "Find the artifact", summary: "A quest" });
	});

	it("returns copy for unknown entity type", () => {
		const content = { name: "Thing", foo: "bar" };
		const result = sanitizeEntityContentForPlayer(content, "unknown");
		expect(result).toEqual({ name: "Thing", foo: "bar" });
	});

	it("handles empty content", () => {
		expect(sanitizeEntityContentForPlayer({}, "npc")).toEqual({});
	});

	it("strips map keyed when no player_version", () => {
		const content = { name: "Dungeon", keyed: { "Room 1": "secret" } };
		const result = sanitizeEntityContentForPlayer(content, "map");
		expect(result).not.toHaveProperty("keyed");
		expect(result).toHaveProperty("name", "Dungeon");
	});
});
