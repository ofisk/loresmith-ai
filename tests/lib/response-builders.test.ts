import { describe, expect, it } from "vitest";
import {
	buildBulkDeletionResponse,
	buildCampaignCreationResponse,
	buildCampaignDeletionResponse,
	buildCampaignUpdateResponse,
	buildErrorResponse,
	buildResourceAdditionResponse,
	buildResourceRemovalResponse,
	buildShardGenerationResponse,
	buildSuccessResponse,
} from "@/lib/api/response-builders";

describe("response-builders", () => {
	describe("buildSuccessResponse", () => {
		it("returns success with data", () => {
			const { response, status } = buildSuccessResponse({ id: "1" });
			expect(response.success).toBe(true);
			expect(response.data).toEqual({ id: "1" });
			expect(status).toBe(200);
		});

		it("includes message when provided", () => {
			const { response } = buildSuccessResponse(
				{ id: "1" },
				"Created successfully"
			);
			expect(response.message).toBe("Created successfully");
		});

		it("uses custom status code", () => {
			const { status } = buildSuccessResponse({}, undefined, 201);
			expect(status).toBe(201);
		});
	});

	describe("buildErrorResponse", () => {
		it("returns error with message", () => {
			const { response, status } = buildErrorResponse("Not found");
			expect(response.success).toBe(false);
			expect(response.error).toBe("Not found");
			expect(status).toBe(500);
		});

		it("uses custom status code", () => {
			const { status } = buildErrorResponse("Bad request", 400);
			expect(status).toBe(400);
		});
	});

	describe("buildShardGenerationResponse", () => {
		it("returns response with resource and shard count", () => {
			const resource = { id: "r1", file_name: "doc.pdf" };
			const result = buildShardGenerationResponse(resource, 5, "campaign-1");

			expect(result.success).toBe(true);
			expect(result.message).toContain("5 shards");
			expect(result.resource).toEqual({
				id: "r1",
				name: "doc.pdf",
				type: "file",
			});
		});

		it("includes shards and ui_hint when serverGroups provided", () => {
			const resource = { id: "r1", file_name: "doc.pdf" };
			const groups = [{ id: "g1" }];
			const result = buildShardGenerationResponse(
				resource,
				2,
				"campaign-1",
				groups
			);

			expect(result.shards).toBeDefined();
			expect(result.shards?.count).toBe(2);
			expect(result.shards?.groups).toEqual(groups);
			expect(result.ui_hint?.type).toBe("shards_ready");
		});

		it("uses resource id when file_name missing", () => {
			const resource = { id: "r1" };
			const result = buildShardGenerationResponse(resource, 0, "c1");

			expect(result.resource?.name).toBe("r1");
		});
	});

	describe("buildResourceAdditionResponse", () => {
		it("returns success with resource", () => {
			const result = buildResourceAdditionResponse({
				id: "r1",
				file_name: "doc.pdf",
			});
			expect(result.success).toBe(true);
			expect(result.resource).toEqual({
				id: "r1",
				name: "doc.pdf",
				type: "file",
			});
		});

		it("uses custom message", () => {
			const result = buildResourceAdditionResponse(
				{ id: "r1" },
				"Custom message"
			);
			expect(result.message).toBe("Custom message");
		});
	});

	describe("buildCampaignCreationResponse", () => {
		it("returns success with campaign", () => {
			const campaign = { id: "c1", name: "Test" };
			const result = buildCampaignCreationResponse(campaign);
			expect(result.success).toBe(true);
			expect(result.campaign).toEqual(campaign);
		});
	});

	describe("buildCampaignUpdateResponse", () => {
		it("returns success with campaign", () => {
			const campaign = { id: "c1", name: "Updated" };
			const result = buildCampaignUpdateResponse(campaign);
			expect(result.success).toBe(true);
			expect(result.message).toContain("updated");
			expect(result.campaign).toEqual(campaign);
		});
	});

	describe("buildCampaignDeletionResponse", () => {
		it("returns success with deleted campaign", () => {
			const deleted = { id: "c1", name: "Deleted" };
			const result = buildCampaignDeletionResponse(deleted);
			expect(result.success).toBe(true);
			expect(result.deletedCampaign).toEqual(deleted);
		});
	});

	describe("buildBulkDeletionResponse", () => {
		it("returns message when no campaigns deleted", () => {
			const result = buildBulkDeletionResponse([]);
			expect(result.success).toBe(true);
			expect(result.deletedCount).toBe(0);
			expect(result.message).toContain("No campaigns");
		});

		it("returns deleted campaigns when some deleted", () => {
			const campaigns = [{ id: "c1" }, { id: "c2" }];
			const result = buildBulkDeletionResponse(campaigns);
			expect(result.deletedCount).toBe(2);
			expect(result.deletedCampaigns).toEqual(campaigns);
		});
	});

	describe("buildResourceRemovalResponse", () => {
		it("returns success with removed resource", () => {
			const removed = { id: "r1" };
			const result = buildResourceRemovalResponse(removed);
			expect(result.success).toBe(true);
			expect(result.removedResource).toEqual(removed);
		});
	});
});
