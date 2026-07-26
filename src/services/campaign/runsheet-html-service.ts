import type {
	RunsheetCastMember,
	RunsheetData,
	RunsheetEncounter,
	RunsheetLootItem,
	RunsheetRule,
	RunsheetThread,
	RunsheetWithData,
} from "@/types/runsheet";

/**
 * Escape every value interpolated into the exported document.
 *
 * Runsheet content is entirely user-authored (digest prose, entity names, GM
 * notes), so this is the single chokepoint all interpolation goes through.
 */
export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * Print stylesheet. Inlined deliberately: a runsheet that needs a CDN at the
 * table defeats the point of printing it (issue #742 — "no battery, no wifi").
 */
const RUNSHEET_STYLES = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 2rem 1.5rem 4rem;
  background: #fff;
  color: #111;
  font-family: Georgia, "Iowan Old Style", "Times New Roman", serif;
  font-size: 11.5pt;
  line-height: 1.45;
  max-width: 46rem;
  margin-inline: auto;
}
header.runsheet-header { border-bottom: 3px double #111; padding-bottom: 0.75rem; margin-bottom: 1.5rem; }
h1 { font-size: 1.6rem; margin: 0 0 0.25rem; letter-spacing: 0.01em; }
.runsheet-campaign { font-size: 0.95rem; color: #444; margin: 0; }
.runsheet-meta { font-size: 0.8rem; color: #555; margin: 0.4rem 0 0; }
.spoiler-warning {
  margin: 0.75rem 0 0;
  padding: 0.4rem 0.6rem;
  border: 1px solid #111;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}
section.runsheet-section { break-inside: avoid; page-break-inside: avoid; margin-bottom: 1.5rem; }
h2 {
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  border-bottom: 1px solid #999;
  padding-bottom: 0.2rem;
  margin: 0 0 0.6rem;
}
h3 { font-size: 0.95rem; margin: 0.9rem 0 0.3rem; }
h3:first-child { margin-top: 0; }
ul, ol { margin: 0.3rem 0 0.6rem; padding-left: 1.25rem; }
li { margin-bottom: 0.2rem; }
ul.checklist { list-style: none; padding-left: 0.2rem; }
ul.checklist li::before { content: "\\2610"; margin-right: 0.5rem; }
p { margin: 0.3rem 0; }
.entry { margin-bottom: 0.7rem; break-inside: avoid; page-break-inside: avoid; }
.entry-name { font-weight: 700; }
.entry-detail { display: block; }
.muted { color: #555; }
.small { font-size: 0.82rem; }
.statblock {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.78rem;
  letter-spacing: 0.02em;
  border: 1px solid #bbb;
  padding: 0.15rem 0.4rem;
  display: inline-block;
  margin-top: 0.15rem;
}
.statblock span + span::before { content: " \\00b7 "; color: #888; }
.rule-category {
  display: block;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #555;
}
.empty-note { font-style: italic; color: #666; font-size: 0.85rem; }
.notes-area { border: 1px solid #bbb; min-height: 7rem; padding: 0.5rem; white-space: pre-wrap; }
footer.runsheet-footer { border-top: 1px solid #ccc; margin-top: 2rem; padding-top: 0.5rem; font-size: 0.72rem; color: #666; }

@media print {
  @page { margin: 1.6cm; }
  body { padding: 0; max-width: none; font-size: 10.5pt; }
  .no-print { display: none !important; }
  a { text-decoration: none; color: inherit; }
}
`;

function renderList(items: string[], className = ""): string {
	if (items.length === 0) return "";
	const attr = className ? ` class="${className}"` : "";
	const entries = items
		.map((item) => `<li>${escapeHtml(item)}</li>`)
		.join("\n      ");
	return `<ul${attr}>\n      ${entries}\n    </ul>`;
}

function renderSubsection(title: string, items: string[]): string {
	if (items.length === 0) return "";
	return `<h3>${escapeHtml(title)}</h3>\n    ${renderList(items)}`;
}

function emptyNote(message: string): string {
	return `<p class="empty-note">${escapeHtml(message)}</p>`;
}

function renderRecap(data: RunsheetData): string {
	const { recap } = data;
	const heading =
		recap.fromSessionNumber != null
			? `Recap — where we left off (session ${recap.fromSessionNumber})`
			: "Recap — where we left off";

	const body = [
		renderSubsection("Key events", recap.keyEvents),
		renderSubsection("Factions changed", recap.stateChanges.factions),
		renderSubsection("Locations changed", recap.stateChanges.locations),
		renderSubsection("NPCs changed", recap.stateChanges.npcs),
	]
		.filter(Boolean)
		.join("\n    ");

	return `<section class="runsheet-section">
    <h2>${escapeHtml(heading)}</h2>
    ${body || emptyNote("No recap recorded. Add a session digest for the previous session.")}
  </section>`;
}

function renderPlan(data: RunsheetData): string {
	const { plan } = data;

	const taskItems = plan.openTasks.map((task) =>
		task.detail ? `${task.title} — ${task.detail}` : task.title
	);

	const body = [
		renderSubsection("Beats", plan.beats),
		renderSubsection("Your objectives", plan.objectives),
		renderSubsection("Probable player goals", plan.probablePlayerGoals),
		renderSubsection("If / then", plan.ifThenBranches),
		taskItems.length > 0
			? `<h3>Open prep</h3>\n    ${renderList(taskItems, "checklist")}`
			: "",
		plan.todoChecklist.length > 0
			? `<h3>Checklist</h3>\n    ${renderList(plan.todoChecklist, "checklist")}`
			: "",
	]
		.filter(Boolean)
		.join("\n    ");

	return `<section class="runsheet-section">
    <h2>This session's plan</h2>
    ${body || emptyNote("No plan recorded. Add beats to the previous session's digest, or planning tasks for this session.")}
  </section>`;
}

function renderCast(cast: RunsheetCastMember[]): string {
	const body =
		cast.length === 0
			? emptyNote("No NPCs listed for this session.")
			: cast
					.map((member) => {
						const roleSuffix = member.role
							? ` <span class="muted small">(${escapeHtml(member.role)})</span>`
							: "";
						const hook = member.hook
							? `<span class="entry-detail">${escapeHtml(member.hook)}</span>`
							: "";
						const secrets = member.secrets
							? `<span class="entry-detail small muted">Secret: ${escapeHtml(member.secrets)}</span>`
							: "";
						return `<div class="entry">
      <span class="entry-name">${escapeHtml(member.name)}</span>${roleSuffix}
      ${hook}
      ${secrets}
    </div>`;
					})
					.join("\n    ");

	return `<section class="runsheet-section">
    <h2>Cast</h2>
    ${body}
  </section>`;
}

function renderStatblock(statblock: Record<string, string>): string {
	const entries = Object.entries(statblock);
	if (entries.length === 0) return "";
	const spans = entries
		.map(
			([label, value]) =>
				`<span>${escapeHtml(label)} ${escapeHtml(value)}</span>`
		)
		.join("");
	return `<span class="entry-detail"><span class="statblock">${spans}</span></span>`;
}

function renderEncounters(encounters: RunsheetEncounter[]): string {
	const body =
		encounters.length === 0
			? emptyNote("No encounters prepared for this session.")
			: encounters
					.map((encounter) => {
						const summary = encounter.summary
							? `<span class="entry-detail">${escapeHtml(encounter.summary)}</span>`
							: "";
						return `<div class="entry">
      <span class="entry-name">${escapeHtml(encounter.name)}</span>
      ${summary}
      ${renderStatblock(encounter.statblock)}
    </div>`;
					})
					.join("\n    ");

	return `<section class="runsheet-section">
    <h2>Encounters</h2>
    ${body}
  </section>`;
}

function renderLoot(loot: RunsheetLootItem[]): string {
	const body =
		loot.length === 0
			? emptyNote("No rewards prepared for this session.")
			: loot
					.map((item) => {
						const detail = item.detail
							? `<span class="entry-detail small">${escapeHtml(item.detail)}</span>`
							: "";
						return `<div class="entry">
      <span class="entry-name">${escapeHtml(item.name)}</span>
      ${detail}
    </div>`;
					})
					.join("\n    ");

	return `<section class="runsheet-section">
    <h2>Loot</h2>
    ${body}
  </section>`;
}

function renderRules(rules: RunsheetRule[]): string {
	const body =
		rules.length === 0
			? emptyNote("No active house rules recorded for this campaign.")
			: rules
					.map(
						(rule) => `<div class="entry">
      <span class="entry-name">${escapeHtml(rule.name)}</span>
      <span class="rule-category">${escapeHtml(rule.category)}</span>
      <span class="entry-detail">${escapeHtml(rule.text)}</span>
    </div>`
					)
					.join("\n    ");

	return `<section class="runsheet-section">
    <h2>Rules to remember</h2>
    ${body}
  </section>`;
}

function renderOpenThreads(threads: RunsheetThread[]): string {
	const body =
		threads.length === 0
			? emptyNote("No open threads recorded.")
			: renderList(threads.map((thread) => thread.text));

	return `<section class="runsheet-section">
    <h2>Open threads</h2>
    ${body}
  </section>`;
}

function renderNotes(notes: string): string {
	return `<section class="runsheet-section">
    <h2>Notes</h2>
    <div class="notes-area">${escapeHtml(notes)}</div>
  </section>`;
}

export interface RenderRunsheetOptions {
	/** Campaign display name, shown above the runsheet title. */
	campaignName: string;
}

/**
 * Render a runsheet as a standalone, print-friendly HTML document.
 *
 * PDF export is deliberately the browser's own "Print → Save as PDF": Workers
 * have no headless browser binding, and a print stylesheet gets the GM the same
 * artifact without shipping a PDF engine into the request path.
 */
export class RunsheetHtmlService {
	static render(
		runsheet: RunsheetWithData,
		options: RenderRunsheetOptions
	): string {
		const { runsheetData: data } = runsheet;
		const title = `${options.campaignName} — ${runsheet.title}`;

		const sections = [
			renderRecap(data),
			renderPlan(data),
			renderCast(data.cast),
			renderEncounters(data.encounters),
			renderLoot(data.loot),
			renderRules(data.rules),
			renderOpenThreads(data.openThreads),
			renderNotes(data.notes),
		].join("\n  ");

		return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${escapeHtml(title)}</title>
  <style>${RUNSHEET_STYLES}</style>
</head>
<body>
  <header class="runsheet-header">
    <p class="runsheet-campaign">${escapeHtml(options.campaignName)}</p>
    <h1>${escapeHtml(runsheet.title)}</h1>
    <p class="runsheet-meta">Snapshot generated ${escapeHtml(runsheet.generatedAt)}</p>
    <p class="spoiler-warning">GM only — contains spoilers. Do not share with players.</p>
  </header>
  ${sections}
  <footer class="runsheet-footer">
    Generated by LoreSmith from your campaign's session digest, planning tasks, entity graph, and house rules.
  </footer>
</body>
</html>`;
	}
}
