import { describe, expect, it, vi } from "vitest";
import { RebuildTriggerService } from "@/services/graph/rebuild-trigger-service";

describe("RebuildTriggerService decideAndEnqueueRebuild", () => {
	it("skips enqueue when dirty set is empty", async () => {
		const service = new RebuildTriggerService(
			{} as any,
			{} as any,
			{} as any,
			{
				getDirtySnapshot: vi
					.fn()
					.mockResolvedValue({ entityIds: [], relationships: [] }),
			} as any
		);

		const result = await service.decideAndEnqueueRebuild({
			campaignId: "c1",
			triggeredBy: "system",
			queueService: { enqueueRebuild: vi.fn() } as any,
		});

		expect(result.enqueued).toBe(false);
		expect(result.reason).toContain("No dirty");
	});

	it("enqueues incremental rebuild with dedupe token", async () => {
		const queueService = {
			enqueueRebuild: vi.fn().mockResolvedValue(undefined),
		};
		const rebuildStatusDAO = {
			getActiveRebuildForCampaign: vi.fn().mockResolvedValue(null),
			createRebuild: vi.fn().mockResolvedValue(undefined),
		};
		const dirtyDAO = {
			getDirtySnapshot: vi.fn().mockResolvedValue({
				entityIds: ["e1", "e2"],
				relationships: [],
			}),
			getTwoHopNeighborhood: vi.fn().mockResolvedValue({
				entityIds: ["e1", "e2", "e3"],
				edgeCount: 2,
			}),
			getExistingDedupeJob: vi.fn().mockResolvedValue(null),
			upsertDedupeJob: vi.fn().mockResolvedValue(undefined),
		};
		const service = new RebuildTriggerService(
			{} as any,
			{
				getEntityCountByCampaign: vi.fn().mockResolvedValue(100),
			} as any,
			rebuildStatusDAO as any,
			dirtyDAO as any
		);

		const result = await service.decideAndEnqueueRebuild({
			campaignId: "c1",
			triggeredBy: "system",
			requestedRadius: 2,
			queueService: queueService as any,
		});

		expect(result.enqueued).toBe(true);
		expect(result.mode).toBe("incremental");
		expect(result.rebuildType).toBe("partial");
		expect(result.idempotencyToken).toBeDefined();
		expect(queueService.enqueueRebuild).toHaveBeenCalledTimes(1);
		expect(rebuildStatusDAO.createRebuild).toHaveBeenCalledTimes(1);
	});

	it("prevents duplicate enqueue when active job exists", async () => {
		const service = new RebuildTriggerService(
			{} as any,
			{
				getEntityCountByCampaign: vi.fn().mockResolvedValue(100),
			} as any,
			{
				getActiveRebuildForCampaign: vi
					.fn()
					.mockResolvedValue({ id: "existing-rebuild" }),
			} as any,
			{
				getDirtySnapshot: vi
					.fn()
					.mockResolvedValue({ entityIds: ["e1"], relationships: [] }),
			} as any
		);

		const result = await service.decideAndEnqueueRebuild({
			campaignId: "c1",
			triggeredBy: "system",
			queueService: { enqueueRebuild: vi.fn() } as any,
		});

		expect(result.enqueued).toBe(false);
		expect(result.reason).toContain("Active rebuild");
	});
});
