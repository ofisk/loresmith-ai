/**
 * Draft generation and email rendering for player recaps.
 *
 * The GM edits markdown, so markdown is the stored source of truth. Rendering
 * happens at send time. The renderer is intentionally a small subset (headings,
 * bullets, paragraphs, bold, italic, links) rather than a full markdown
 * dependency: the input is GM-authored and lands in an email client, so
 * escaping first and supporting little is the conservative trade.
 */

import type { PlayerSafeRecap } from "@/types/player-recap";

export interface RecapDraft {
	subject: string;
	bodyMarkdown: string;
}

export interface BuildRecapDraftParams {
	campaignName: string;
	sessionNumber: number;
	recap: PlayerSafeRecap;
	/** ISO date (YYYY-MM-DD) of the next session, if the GM has set one. */
	nextSessionDate?: string | null;
}

function bulletSection(heading: string, items: string[]): string {
	if (items.length === 0) return "";
	const bullets = items.map((item) => `- ${item}`).join("\n");
	return `## ${heading}\n\n${bullets}\n`;
}

function formatDate(iso: string): string {
	const parsed = new Date(iso);
	if (Number.isNaN(parsed.getTime())) return iso;
	return parsed.toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
		timeZone: "UTC",
	});
}

/**
 * Build the initial markdown draft the GM will review.
 *
 * Every section is optional: an empty digest field produces no heading rather
 * than an empty one, so the GM is not shown scaffolding to delete.
 */
export function buildRecapDraft(params: BuildRecapDraftParams): RecapDraft {
	const { campaignName, sessionNumber, recap, nextSessionDate } = params;

	const sections = [
		bulletSection("What happened", recap.whatHappened),
		bulletSection("Who you met", recap.notableNpcs),
		bulletSection("Where you went", recap.placesVisited),
		bulletSection("Word around the world", recap.factionDevelopments),
		bulletSection("Loose ends", recap.unresolvedThreads),
	].filter((section) => section.length > 0);

	const nextSession =
		nextSessionDate && nextSessionDate.trim().length > 0
			? `## Next session\n\n${formatDate(nextSessionDate)}\n`
			: "";

	const body = [
		`Here's what happened last time in **${campaignName}**.`,
		"",
		...sections,
		nextSession,
	]
		.filter((part) => part !== undefined)
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trimEnd();

	return {
		subject: `${campaignName} — Session ${sessionNumber} recap`,
		bodyMarkdown: `${body}\n`,
	};
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/** Inline markdown on already-escaped text: links, bold, italic, code. */
function renderInline(escaped: string): string {
	return escaped
		.replace(
			/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
			'<a href="$2" style="color:#7c5cff;">$1</a>'
		)
		.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
		.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
		.replace(/`([^`]+)`/g, "<code>$1</code>");
}

/**
 * Render the recap markdown subset to email-safe HTML.
 *
 * Input is escaped before any markdown is applied, so GM-authored angle
 * brackets or quotes cannot introduce markup.
 */
export function renderMarkdownToHtml(markdown: string): string {
	const lines = markdown.replace(/\r\n/g, "\n").split("\n");
	const out: string[] = [];
	let inList = false;

	const closeList = () => {
		if (inList) {
			out.push("</ul>");
			inList = false;
		}
	};

	for (const rawLine of lines) {
		const line = rawLine.trimEnd();
		const escaped = escapeHtml(line);

		if (line.trim().length === 0) {
			closeList();
			continue;
		}

		const heading = line.match(/^(#{1,3})\s+(.*)$/);
		if (heading) {
			closeList();
			const level = heading[1].length;
			const size = level === 1 ? 22 : level === 2 ? 17 : 15;
			out.push(
				`<h${level} style="margin:24px 0 8px;font-size:${size}px;line-height:1.3;color:#111827;">${renderInline(
					escapeHtml(heading[2])
				)}</h${level}>`
			);
			continue;
		}

		const bullet = line.match(/^\s*[-*]\s+(.*)$/);
		if (bullet) {
			if (!inList) {
				out.push(
					'<ul style="margin:0 0 12px;padding-left:20px;color:#374151;">'
				);
				inList = true;
			}
			out.push(
				`<li style="margin:0 0 6px;line-height:1.6;">${renderInline(
					escapeHtml(bullet[1])
				)}</li>`
			);
			continue;
		}

		closeList();
		out.push(
			`<p style="margin:0 0 12px;line-height:1.6;color:#374151;">${renderInline(
				escaped
			)}</p>`
		);
	}

	closeList();
	return out.join("\n");
}

export interface RenderRecapEmailParams {
	campaignName: string;
	bodyMarkdown: string;
	unsubscribeUrl: string;
	appUrl: string;
}

/**
 * Wrap the rendered body in the email shell.
 *
 * The unsubscribe link is added here rather than being part of the editable
 * body, so a GM cannot remove it while editing.
 */
export function renderRecapEmailHtml(params: RenderRecapEmailParams): string {
	const { campaignName, bodyMarkdown, unsubscribeUrl, appUrl } = params;
	const body = renderMarkdownToHtml(bodyMarkdown);

	return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:#ffffff;border-radius:12px;padding:28px;">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">Session recap</p>
      <h1 style="margin:0 0 20px;font-size:24px;line-height:1.25;color:#111827;">${escapeHtml(
				campaignName
			)}</h1>
      ${body}
    </div>
    <div style="padding:20px 8px;text-align:center;color:#9ca3af;font-size:12px;line-height:1.6;">
      <p style="margin:0 0 6px;">Sent by your GM through <a href="${escapeHtml(
				appUrl
			)}" style="color:#7c5cff;text-decoration:none;">LoreSmith</a>.</p>
      <p style="margin:0;"><a href="${escapeHtml(
				unsubscribeUrl
			)}" style="color:#9ca3af;">Unsubscribe from recaps for this campaign</a></p>
    </div>
  </div>
</body>
</html>`;
}

/** Plain-text alternative, for clients that prefer it and for deliverability. */
export function renderRecapEmailText(params: RenderRecapEmailParams): string {
	const { campaignName, bodyMarkdown, unsubscribeUrl } = params;
	const plain = bodyMarkdown
		.replace(/^#{1,3}\s+/gm, "")
		.replace(/\*\*([^*]+)\*\*/g, "$1")
		.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)")
		.trim();

	return `${campaignName} — session recap

${plain}

---
Sent by your GM through LoreSmith.
Unsubscribe from recaps for this campaign: ${unsubscribeUrl}
`;
}
