import { describe, expect, it } from "vitest";
import {
	isFilePipelineInFlight,
	isFileQueueableForCampaignAdd,
	isFileReadyForCampaignAdd,
	isLibraryEntityDiscoveryInFlight,
	willCampaignAddBeDeferred,
} from "@/lib/library-entity-pipeline";

describe("isFilePipelineInFlight", () => {
	it.each([
		"uploading",
		"uploaded",
		"syncing",
		"processing",
		"indexing",
	])("treats %s as in flight", (status) => {
		expect(isFilePipelineInFlight(status)).toBe(true);
	});

	it.each([
		"completed",
		"error",
		"unindexed",
	])("treats %s as settled", (status) => {
		expect(isFilePipelineInFlight(status)).toBe(false);
	});

	it("treats missing status as settled", () => {
		expect(isFilePipelineInFlight(null)).toBe(false);
		expect(isFilePipelineInFlight(undefined)).toBe(false);
	});
});

describe("isFileQueueableForCampaignAdd", () => {
	it("accepts a completed file", () => {
		expect(isFileQueueableForCampaignAdd({ status: "completed" })).toBe(true);
	});

	it("accepts a file that is still indexing", () => {
		expect(isFileQueueableForCampaignAdd({ status: "processing" })).toBe(true);
	});

	it("rejects terminal-failure states that need a retry first", () => {
		expect(isFileQueueableForCampaignAdd({ status: "error" })).toBe(false);
		expect(isFileQueueableForCampaignAdd({ status: "unindexed" })).toBe(false);
	});
});

describe("willCampaignAddBeDeferred", () => {
	it("defers while RAG indexing is still running", () => {
		expect(willCampaignAddBeDeferred({ status: "processing" })).toBe(true);
	});

	it("defers while library entity discovery is in flight", () => {
		expect(
			willCampaignAddBeDeferred({
				status: "completed",
				library_entity_discovery_status: "processing",
			})
		).toBe(true);
	});

	it("does not defer once the file is fully ready", () => {
		expect(
			willCampaignAddBeDeferred({
				status: "completed",
				library_entity_discovery_status: "complete",
			})
		).toBe(false);
	});

	it("does not defer a file that cannot be added at all", () => {
		expect(willCampaignAddBeDeferred({ status: "error" })).toBe(false);
	});

	it("stays consistent with the readiness helpers", () => {
		const inFlight = {
			status: "completed",
			library_entity_discovery_status: "pending",
		};
		expect(isLibraryEntityDiscoveryInFlight("pending")).toBe(true);
		expect(isFileReadyForCampaignAdd(inFlight)).toBe(false);
		expect(isFileQueueableForCampaignAdd(inFlight)).toBe(true);
		expect(willCampaignAddBeDeferred(inFlight)).toBe(true);
	});
});
