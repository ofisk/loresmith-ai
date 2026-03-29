import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Entity } from "@/dao/entity-dao";
import { SemanticDuplicateDetectionService } from "@/services/vectorize/semantic-duplicate-detection-service";

const mockFindDuplicateByName = vi.fn();
const mockFindCustomLexicalDuplicateByName = vi.fn();
const mockGetEntityById = vi.fn();

vi.mock("@/dao/dao-factory", () => ({
	getDAOFactory: () => ({
		entityDAO: {
			findDuplicateByName: (...args: unknown[]) =>
				mockFindDuplicateByName(...args),
			findCustomLexicalDuplicateByName: (...args: unknown[]) =>
				mockFindCustomLexicalDuplicateByName(...args),
			getEntityById: (...args: unknown[]) => mockGetEntityById(...args),
		},
	}),
}));

describe("SemanticDuplicateDetectionService.findDuplicateEntity", () => {
	const baseEnv = {
		DB: {} as D1Database,
	} as any;

	beforeEach(() => {
		mockFindDuplicateByName.mockReset();
		mockFindCustomLexicalDuplicateByName.mockReset();
		mockGetEntityById.mockReset();
	});

	it("falls back to custom-only lexical when typed match misses and type is custom", async () => {
		const existing: Entity = {
			id: "c_existing",
			campaignId: "camp1",
			entityType: "custom",
			name: "Elder Spirit",
			createdAt: "",
			updatedAt: "",
		};
		mockFindDuplicateByName.mockResolvedValue(null);
		mockFindCustomLexicalDuplicateByName.mockResolvedValue(existing);

		const result = await SemanticDuplicateDetectionService.findDuplicateEntity({
			content: "Elder Spirit — ancestral guide",
			campaignId: "camp1",
			name: "Elder Spirit",
			entityType: "custom",
			env: baseEnv,
		});

		expect(result).toEqual(existing);
		expect(mockFindDuplicateByName).toHaveBeenCalledWith(
			"camp1",
			"Elder Spirit",
			"custom",
			undefined
		);
		expect(mockFindCustomLexicalDuplicateByName).toHaveBeenCalledWith(
			"camp1",
			"Elder Spirit",
			undefined
		);
	});

	it("does not use custom-only lexical when type is not custom", async () => {
		mockFindDuplicateByName.mockResolvedValue(null);

		const result = await SemanticDuplicateDetectionService.findDuplicateEntity({
			content: "Some location",
			campaignId: "camp1",
			name: "Ruined Tower",
			entityType: "locations",
			env: baseEnv,
		});

		expect(result).toBeNull();
		expect(mockFindCustomLexicalDuplicateByName).not.toHaveBeenCalled();
	});
});
