import { describe, expect, it } from "vitest";
import {
	buildRecapDraft,
	renderMarkdownToHtml,
	renderRecapEmailHtml,
	renderRecapEmailText,
} from "@/lib/player-recap/recap-email-template";
import type { PlayerSafeRecap } from "@/types/player-recap";

const RECAP: PlayerSafeRecap = {
	whatHappened: ["The party broke the siege of Cairnhold"],
	notableNpcs: ["Captain Yorel"],
	placesVisited: ["Cairnhold"],
	factionDevelopments: ["The Ashen Hand retreated east"],
	unresolvedThreads: ["Who paid the Ashen Hand?"],
};

const EMPTY: PlayerSafeRecap = {
	whatHappened: [],
	notableNpcs: [],
	placesVisited: [],
	factionDevelopments: [],
	unresolvedThreads: [],
};

describe("buildRecapDraft", () => {
	it("names the campaign and session in the subject", () => {
		const draft = buildRecapDraft({
			campaignName: "Embers of the North",
			sessionNumber: 7,
			recap: RECAP,
		});

		expect(draft.subject).toBe("Embers of the North — Session 7 recap");
	});

	it("includes every populated section", () => {
		const { bodyMarkdown } = buildRecapDraft({
			campaignName: "Embers of the North",
			sessionNumber: 7,
			recap: RECAP,
		});

		expect(bodyMarkdown).toContain("## What happened");
		expect(bodyMarkdown).toContain("- The party broke the siege of Cairnhold");
		expect(bodyMarkdown).toContain("## Who you met");
		expect(bodyMarkdown).toContain("## Loose ends");
	});

	it("omits headings for empty sections rather than leaving scaffolding", () => {
		const { bodyMarkdown } = buildRecapDraft({
			campaignName: "Embers of the North",
			sessionNumber: 7,
			recap: { ...EMPTY, whatHappened: ["Something happened"] },
		});

		expect(bodyMarkdown).toContain("## What happened");
		expect(bodyMarkdown).not.toContain("## Who you met");
		expect(bodyMarkdown).not.toContain("## Loose ends");
	});

	it("adds a next session section only when a date is supplied", () => {
		const withoutDate = buildRecapDraft({
			campaignName: "C",
			sessionNumber: 1,
			recap: RECAP,
		});
		expect(withoutDate.bodyMarkdown).not.toContain("## Next session");

		const withDate = buildRecapDraft({
			campaignName: "C",
			sessionNumber: 1,
			recap: RECAP,
			nextSessionDate: "2026-08-14",
		});
		expect(withDate.bodyMarkdown).toContain("## Next session");
		expect(withDate.bodyMarkdown).toContain("August 14, 2026");
	});

	it("passes an unparseable date through instead of printing Invalid Date", () => {
		const draft = buildRecapDraft({
			campaignName: "C",
			sessionNumber: 1,
			recap: RECAP,
			nextSessionDate: "next tuesday",
		});

		expect(draft.bodyMarkdown).toContain("next tuesday");
		expect(draft.bodyMarkdown).not.toContain("Invalid Date");
	});
});

describe("renderMarkdownToHtml", () => {
	it("renders headings, bullets and paragraphs", () => {
		const html = renderMarkdownToHtml("# Title\n\nIntro\n\n- one\n- two\n");

		expect(html).toContain("<h1");
		expect(html).toContain("Intro");
		expect(html).toContain("<ul");
		expect(html).toContain("<li");
	});

	it("escapes GM-authored HTML before applying markdown", () => {
		const html = renderMarkdownToHtml("- <script>alert('x')</script> happened");

		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;script&gt;");
	});

	it("renders bold and links", () => {
		const html = renderMarkdownToHtml(
			"**bold** and [site](https://example.com)"
		);

		expect(html).toContain("<strong>bold</strong>");
		expect(html).toContain('href="https://example.com"');
	});

	it("does not linkify a javascript: url", () => {
		const html = renderMarkdownToHtml("[click](javascript:alert(1))");

		expect(html).not.toContain('href="javascript:');
	});
});

describe("renderRecapEmailHtml", () => {
	const params = {
		campaignName: "Embers of the North",
		bodyMarkdown: "## What happened\n\n- The siege broke\n",
		unsubscribeUrl: "https://loresmith.ai/recap-unsubscribe/tok123",
		appUrl: "https://loresmith.ai",
	};

	it("always includes the unsubscribe link", () => {
		expect(renderRecapEmailHtml(params)).toContain(params.unsubscribeUrl);
	});

	it("escapes the campaign name in the header", () => {
		const html = renderRecapEmailHtml({
			...params,
			campaignName: '<img src=x onerror="alert(1)">',
		});

		expect(html).not.toContain("<img src=x");
		expect(html).toContain("&lt;img");
	});
});

describe("renderRecapEmailText", () => {
	it("strips markdown syntax and keeps the unsubscribe url", () => {
		const text = renderRecapEmailText({
			campaignName: "Embers",
			bodyMarkdown: "## What happened\n\n**bold** thing\n",
			unsubscribeUrl: "https://loresmith.ai/recap-unsubscribe/tok123",
			appUrl: "https://loresmith.ai",
		});

		expect(text).toContain("What happened");
		expect(text).not.toContain("##");
		expect(text).toContain("bold thing");
		expect(text).toContain("https://loresmith.ai/recap-unsubscribe/tok123");
	});
});
