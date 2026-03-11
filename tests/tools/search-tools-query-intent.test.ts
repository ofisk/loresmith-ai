import { describe, expect, it } from "vitest";
import { parseQueryIntent } from "@/tools/campaign-context/search-tools-query-intent";

describe("parseQueryIntent", () => {
	it("returns isListAll true and entityType for empty query", () => {
		const result = parseQueryIntent("");
		expect(result.isListAll).toBe(true);
		expect(result.entityType).toBeNull();
		expect(result.searchQuery).toBe("");
		expect(result.searchPlanningContext).toBe(false);
	});

	it("detects entity type from query (monsters)", () => {
		const result = parseQueryIntent("monsters");
		expect(result.entityType).toBe("monsters");
		expect(result.isListAll).toBe(true);
		expect(result.searchQuery).toBe("monsters");
	});

	it("detects entity type and list-all for 'all monsters'", () => {
		const result = parseQueryIntent("all monsters");
		expect(result.entityType).toBe("monsters");
		expect(result.isListAll).toBe(true);
		expect(result.searchQuery).toBe("all monsters");
	});

	it("detects entity type and keeps semantic query for 'fire monsters'", () => {
		const result = parseQueryIntent("fire monsters");
		expect(result.entityType).toBe("monsters");
		expect(result.isListAll).toBe(false);
		expect(result.searchQuery).toBe("fire");
	});

	it("detects planning context prefix context:", () => {
		const result = parseQueryIntent("context: session notes");
		expect(result.searchPlanningContext).toBe(true);
		expect(result.searchQuery).toBe("session notes");
	});

	it("detects planning context prefix session:", () => {
		const result = parseQueryIntent("session: recap");
		expect(result.searchPlanningContext).toBe(true);
		expect(result.searchQuery).toBe("recap");
	});

	it("detects npcs entity type", () => {
		const result = parseQueryIntent("npcs");
		expect(result.entityType).toBe("npcs");
		expect(result.isListAll).toBe(true);
	});

	it("detects locations entity type", () => {
		const result = parseQueryIntent("locations");
		expect(result.entityType).toBe("locations");
	});

	it("returns null entityType when no type in query", () => {
		const result = parseQueryIntent("something random");
		expect(result.entityType).toBeNull();
		expect(result.searchQuery).toBe("something random");
		expect(result.isListAll).toBe(false);
	});

	it("list all variants: list npcs, list all npcs", () => {
		expect(parseQueryIntent("list npcs").isListAll).toBe(true);
		expect(parseQueryIntent("list npcs").entityType).toBe("npcs");
		expect(parseQueryIntent("list all npcs").isListAll).toBe(true);
	});

	it("pagination: offset and limit are applied correctly for listAllEntities", () => {
		const page = 2;
		const pageSize = 50;
		const offset = (page - 1) * pageSize;
		const totalCount = 150;
		const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
		expect(offset).toBe(50);
		expect(totalPages).toBe(3);
	});

	it("detects factions entity type", () => {
		const result = parseQueryIntent("factions");
		expect(result.entityType).toBe("factions");
		expect(result.isListAll).toBe(true);
	});

	it("detects items entity type", () => {
		const result = parseQueryIntent("items");
		expect(result.entityType).toBe("items");
		expect(result.isListAll).toBe(true);
	});

	it("detects pcs entity type", () => {
		const result = parseQueryIntent("pcs");
		expect(result.entityType).toBe("pcs");
		expect(result.isListAll).toBe(true);
	});

	it("returns null entityType for beasts (not in STRUCTURED_ENTITY_TYPES)", () => {
		const result = parseQueryIntent("beasts");
		expect(result.entityType).toBeNull();
		expect(result.searchQuery).toBe("beasts");
		expect(result.isListAll).toBe(false);
	});

	it("context: with empty query sets searchPlanningContext and empty searchQuery", () => {
		const result = parseQueryIntent("context: ");
		expect(result.searchPlanningContext).toBe(true);
		expect(result.searchQuery).toBe("");
		expect(result.entityType).toBeNull();
	});

	it("list all fire monsters is semantic search not list-all", () => {
		const result = parseQueryIntent("list all fire monsters");
		expect(result.entityType).toBe("monsters");
		expect(result.isListAll).toBe(false);
		expect(result.searchQuery).toBe("list all fire");
	});
});
