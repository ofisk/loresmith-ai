import { describe, expect, it } from "vitest";
import {
	escapeHtml,
	RunsheetHtmlService,
} from "@/services/campaign/runsheet-html-service";
import type { RunsheetData, RunsheetWithData } from "@/types/runsheet";

function runsheetData(overrides: Partial<RunsheetData> = {}): RunsheetData {
	return {
		recap: {
			fromSessionNumber: 2,
			keyEvents: [],
			stateChanges: { factions: [], locations: [], npcs: [] },
			source: null,
		},
		plan: {
			objectives: [],
			probablePlayerGoals: [],
			beats: [],
			ifThenBranches: [],
			openTasks: [],
			todoChecklist: [],
			source: null,
		},
		cast: [],
		encounters: [],
		loot: [],
		rules: [],
		openThreads: [],
		notes: "",
		emptySections: [],
		...overrides,
	};
}

function runsheet(data: RunsheetData): RunsheetWithData {
	return {
		id: "runsheet-1",
		campaignId: "campaign-1",
		sessionNumber: 3,
		title: "Session 3 runsheet",
		runsheetData: data,
		generatedAt: "2026-07-01 12:00:00",
		createdAt: "2026-07-01 12:00:00",
		updatedAt: "2026-07-01 12:00:00",
	};
}

function render(data: RunsheetData, campaignName = "Ashen Coast"): string {
	return RunsheetHtmlService.render(runsheet(data), { campaignName });
}

describe("escapeHtml", () => {
	it("escapes every character that could break out of markup", () => {
		expect.hasAssertions();

		expect(escapeHtml(`<script>"x" & 'y'</script>`)).toBe(
			"&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;"
		);
	});

	it("escapes ampersands before the entities it introduces", () => {
		expect.hasAssertions();

		expect(escapeHtml("&lt;")).toBe("&amp;lt;");
	});
});

describe("RunsheetHtmlService.render", () => {
	it("produces a standalone document with no external resources", () => {
		expect.hasAssertions();

		const html = render(runsheetData());

		expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
		expect(html).toContain("<style>");
		// A runsheet that needs wifi at the table defeats the point of printing it.
		expect(html).not.toMatch(/<script/i);
		expect(html).not.toMatch(/<link[^>]+href/i);
		expect(html).not.toMatch(/https?:\/\//);
	});

	it("carries a print stylesheet that keeps sections off page folds", () => {
		expect.hasAssertions();

		const html = render(runsheetData());

		expect(html).toContain("@media print");
		expect(html).toContain("@page");
		expect(html).toContain("page-break-inside: avoid");
	});

	it("warns on the page itself that the document is GM-only", () => {
		expect.hasAssertions();

		const html = render(runsheetData());

		expect(html).toContain("GM only — contains spoilers");
	});

	it("renders every section heading", () => {
		expect.hasAssertions();

		const html = render(runsheetData());

		for (const heading of [
			"Recap",
			"This session's plan",
			"Cast",
			"Encounters",
			"Loot",
			"Rules to remember",
			"Open threads",
			"Notes",
		]) {
			expect(html).toContain(heading);
		}
	});

	// Every field on a runsheet is user-authored prose.
	it("escapes campaign and runsheet content rather than emitting it raw", () => {
		expect.hasAssertions();

		const html = RunsheetHtmlService.render(
			runsheet(
				runsheetData({
					cast: [
						{
							name: `<img src=x onerror="alert(1)">`,
							hook: "wants <b>everything</b>",
							role: null,
							secrets: null,
							source: { kind: "entity", id: "e1", label: null },
						},
					],
					notes: `</style><script>alert(2)</script>`,
				})
			),
			{ campaignName: `<svg onload="alert(3)">` }
		);

		expect(html).not.toContain("<img src=x");
		expect(html).not.toContain("<svg onload");
		expect(html).not.toContain("<script>alert(2)</script>");
		expect(html).toContain("&lt;img src=x");
		expect(html).toContain("&lt;svg onload");
	});

	it("renders cast hooks, statblocks, rules and threads", () => {
		expect.hasAssertions();

		const html = render(
			runsheetData({
				cast: [
					{
						name: "Vex Ashford",
						hook: "Buy back the debt",
						role: "Harbormaster",
						secrets: "Already sold the ledger",
						source: { kind: "entity", id: "e1", label: null },
					},
				],
				encounters: [
					{
						name: "A Bone Naga guards the stair",
						summary: "Serpentine undead.",
						statblock: { CR: "4", AC: "15" },
						source: { kind: "entity", id: "m1", label: null },
					},
				],
				rules: [
					{
						name: "Flanking",
						category: "combat",
						text: "Flanking grants advantage.",
						source: { kind: "house_rule", id: "r1", label: null },
					},
				],
				openThreads: [
					{
						text: "Who paid the assassin?",
						source: { kind: "session_digest", id: "d1", label: null },
					},
				],
			})
		);

		expect(html).toContain("Vex Ashford");
		expect(html).toContain("Harbormaster");
		expect(html).toContain("Already sold the ledger");
		expect(html).toContain("CR 4");
		expect(html).toContain("AC 15");
		expect(html).toContain("Flanking grants advantage.");
		expect(html).toContain("Who paid the assassin?");
	});

	it("renders prep and checklist items as printable checkboxes", () => {
		expect.hasAssertions();

		const html = render(
			runsheetData({
				plan: {
					objectives: [],
					probablePlayerGoals: [],
					beats: [],
					ifThenBranches: [],
					openTasks: [
						{
							title: "Statblock the naga",
							detail: "CR 4",
							source: { kind: "planning_task", id: "t1", label: null },
						},
					],
					todoChecklist: ["Print the map"],
					source: null,
				},
			})
		);

		expect(html).toContain('class="checklist"');
		expect(html).toContain("Statblock the naga — CR 4");
		expect(html).toContain("Print the map");
	});

	// A silently omitted section reads as "nothing to prepare" rather than
	// "nothing recorded yet".
	it("explains empty sections instead of omitting them", () => {
		expect.hasAssertions();

		const html = render(runsheetData());

		expect(html).toContain("No active house rules recorded for this campaign.");
		expect(html).toContain("No NPCs listed for this session.");
		expect(html).toContain("No encounters prepared for this session.");
		expect(html).toContain("No open threads recorded.");
	});

	it("titles the document with the campaign and runsheet name", () => {
		expect.hasAssertions();

		const html = render(runsheetData());

		expect(html).toContain("<title>Ashen Coast — Session 3 runsheet</title>");
	});

	it("labels the recap with the session it came from", () => {
		expect.hasAssertions();

		const html = render(
			runsheetData({
				recap: {
					fromSessionNumber: 2,
					keyEvents: ["The bridge fell"],
					stateChanges: { factions: [], locations: [], npcs: [] },
					source: null,
				},
			})
		);

		expect(html).toContain("Recap — where we left off (session 2)");
		expect(html).toContain("The bridge fell");
	});
});
