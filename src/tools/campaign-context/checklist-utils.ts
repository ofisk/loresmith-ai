/**
 * Pure helpers for checklist status formatting.
 * No env, DAO, or I/O – safe to unit test.
 */

import { CHECKLIST_ITEM_NAMES } from "@/constants/checklist-items";

export interface ChecklistStatusRecord {
	checklistItemKey: string;
	status: string;
	summary: string | null;
}

export interface ChecklistStatusResult {
	statusByItem: Record<string, { status: string; summary: string | null }>;
	completeItems: string[];
	partialItems: string[];
	incompleteItems: string[];
	summaryText: string;
}

/**
 * Build structured checklist status from raw records.
 * Used by both API and DB paths in getChecklistStatusTool.
 */
export function buildChecklistStatusFromRecords(
	records: ChecklistStatusRecord[],
	itemNames: Record<string, string> = CHECKLIST_ITEM_NAMES
): ChecklistStatusResult {
	const statusByItem: Record<
		string,
		{ status: string; summary: string | null }
	> = {};
	const completeItems: string[] = [];
	const partialItems: string[] = [];
	const incompleteItems: string[] = [];

	for (const record of records) {
		statusByItem[record.checklistItemKey] = {
			status: record.status,
			summary: record.summary,
		};
	}

	for (const record of records) {
		const itemName =
			itemNames[record.checklistItemKey] || record.checklistItemKey;
		const itemInfo = `${itemName}${record.summary ? `: ${record.summary}` : ""}`;

		if (record.status === "complete") {
			completeItems.push(itemInfo);
		} else if (record.status === "partial") {
			partialItems.push(itemInfo);
		} else {
			incompleteItems.push(itemInfo);
		}
	}

	const summaryText = `Checklist Status for Campaign:

COMPLETE (${completeItems.length}):
${completeItems.length > 0 ? completeItems.map((i) => `- ${i}`).join("\n") : "None"}

PARTIAL (${partialItems.length}):
${partialItems.length > 0 ? partialItems.map((i) => `- ${i}`).join("\n") : "None"}

INCOMPLETE (${incompleteItems.length}):
${incompleteItems.length > 0 ? incompleteItems.map((i) => `- ${i}`).join("\n") : "None"}

Total tracked items: ${records.length}`;

	return {
		statusByItem,
		completeItems,
		partialItems,
		incompleteItems,
		summaryText,
	};
}
