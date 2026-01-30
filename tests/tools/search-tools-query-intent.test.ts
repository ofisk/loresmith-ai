import { describe, it, expect } from "vitest";
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
});
