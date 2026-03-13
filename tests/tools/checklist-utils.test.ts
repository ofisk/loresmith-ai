import { describe, expect, it } from "vitest";
import { buildChecklistStatusFromRecords } from "@/tools/campaign-context/checklist-utils";

describe("checklist-utils", () => {
	describe("buildChecklistStatusFromRecords", () => {
		it("builds statusByItem from records", () => {
			const records = [
				{
					checklistItemKey: "campaign_tone",
					status: "complete",
					summary: "Dark fantasy",
				},
				{
					checklistItemKey: "factions",
					status: "partial",
					summary: "2 defined",
				},
				{ checklistItemKey: "world_name", status: "incomplete", summary: null },
			];
			const result = buildChecklistStatusFromRecords(records);
			expect(result.statusByItem.campaign_tone).toEqual({
				status: "complete",
				summary: "Dark fantasy",
			});
			expect(result.statusByItem.factions).toEqual({
				status: "partial",
				summary: "2 defined",
			});
		});

		it("categorizes items into complete, partial, incomplete", () => {
			const records = [
				{ checklistItemKey: "a", status: "complete", summary: null },
				{ checklistItemKey: "b", status: "partial", summary: "x" },
				{ checklistItemKey: "c", status: "incomplete", summary: null },
			];
			const result = buildChecklistStatusFromRecords(records);
			expect(result.completeItems).toHaveLength(1);
			expect(result.partialItems).toHaveLength(1);
			expect(result.incompleteItems).toHaveLength(1);
		});

		it("includes summary text with counts", () => {
			const records = [
				{ checklistItemKey: "a", status: "complete", summary: null },
			];
			const result = buildChecklistStatusFromRecords(records);
			expect(result.summaryText).toContain("COMPLETE (1)");
			expect(result.summaryText).toContain("Total tracked items: 1");
		});

		it("uses item name from itemNames when provided", () => {
			const records = [
				{ checklistItemKey: "custom_key", status: "complete", summary: "Done" },
			];
			const result = buildChecklistStatusFromRecords(records, {
				custom_key: "Custom Item",
			});
			expect(result.completeItems[0]).toContain("Custom Item");
		});
	});
});
