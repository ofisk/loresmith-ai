import { describe, expect, it } from "vitest";
import {
	buildLibraryContentFingerprint,
	buildLibraryEntityMergeKey,
	extractionIdSuffix,
	getLibrarySyntheticCampaignId,
} from "@/lib/library-entity-id";

describe("getLibrarySyntheticCampaignId", () => {
	it("returns stable id without underscore in prefix", () => {
		const a = getLibrarySyntheticCampaignId("library/u1/doc.pdf");
		const b = getLibrarySyntheticCampaignId("library/u1/doc.pdf");
		expect(a).toBe(b);
		expect(a.startsWith("libfp")).toBe(true);
		expect(a.includes("_")).toBe(false);
	});

	it("differs for different file keys", () => {
		expect(getLibrarySyntheticCampaignId("a")).not.toBe(
			getLibrarySyntheticCampaignId("b")
		);
	});
});

describe("extractionIdSuffix", () => {
	it("returns substring after first underscore", () => {
		expect(extractionIdSuffix("libfp0123456789abcdef_uuid-here")).toBe(
			"uuid-here"
		);
	});
});

describe("buildLibraryEntityMergeKey", () => {
	it("normalizes type and name", () => {
		expect(buildLibraryEntityMergeKey("NPCs", "  Jane Doe  ")).toBe(
			"npcs|jane doe"
		);
	});
});

describe("buildLibraryContentFingerprint", () => {
	it("joins size and updated timestamp", () => {
		expect(buildLibraryContentFingerprint(1024, "2025-01-01")).toBe(
			"1024|2025-01-01"
		);
	});
});
