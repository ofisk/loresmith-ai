import {
	ArrowClockwise,
	FloppyDisk,
	Printer,
	Trash,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/button/Button";
import { LazyRunsheetAudioStrip } from "@/components/campaign-audio/LazyCampaignAudioPanel";
import { useAuthenticatedRequest } from "@/hooks/useAuthenticatedRequest";
import { API_CONFIG } from "@/shared-config";
import type { RunsheetSummary, RunsheetWithData } from "@/types/runsheet";

interface RunsheetPanelProps {
	campaignId: string;
	/** GM roles can generate, edit and delete; read-only GMs can only view/print. */
	canEdit: boolean;
}

interface RunsheetListResponse {
	runsheets: RunsheetSummary[];
	nextSessionNumber: number;
}

function formatTimestamp(value: string): string {
	const parsed = new Date(value.includes("T") ? value : `${value}Z`);
	if (Number.isNaN(parsed.getTime())) return value;
	return parsed.toLocaleString();
}

/** Renders a list section, or an explicit "nothing here" line so gaps are legible. */
function Section({
	title,
	children,
	isEmpty,
	emptyMessage,
}: {
	title: string;
	children?: React.ReactNode;
	isEmpty: boolean;
	emptyMessage: string;
}) {
	return (
		<section className="mb-4">
			<h4 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700 pb-1 mb-2">
				{title}
			</h4>
			{isEmpty ? (
				<p className="text-xs italic text-neutral-500 dark:text-neutral-400">
					{emptyMessage}
				</p>
			) : (
				children
			)}
		</section>
	);
}

function BulletList({ items }: { items: string[] }) {
	if (items.length === 0) return null;
	return (
		<ul className="list-disc pl-5 space-y-0.5 text-xs text-neutral-700 dark:text-neutral-300">
			{items.map((item) => (
				<li key={item}>{item}</li>
			))}
		</ul>
	);
}

export function RunsheetPanel({ campaignId, canEdit }: RunsheetPanelProps) {
	const { makeRequest, makeRequestWithData } = useAuthenticatedRequest();

	const [runsheets, setRunsheets] = useState<RunsheetSummary[]>([]);
	const [nextSessionNumber, setNextSessionNumber] = useState<number | null>(
		null
	);
	const [selected, setSelected] = useState<RunsheetWithData | null>(null);
	const [notesDraft, setNotesDraft] = useState("");
	const [loading, setLoading] = useState(false);
	const [busyAction, setBusyAction] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const loadRunsheets = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const data = await makeRequestWithData<RunsheetListResponse>(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.CAMPAIGNS.RUNSHEETS.BASE(campaignId)
				)
			);
			setRunsheets(data.runsheets ?? []);
			setNextSessionNumber(data.nextSessionNumber ?? null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load runsheets");
		} finally {
			setLoading(false);
		}
	}, [campaignId, makeRequestWithData]);

	useEffect(() => {
		void loadRunsheets();
	}, [loadRunsheets]);

	const openRunsheet = async (runsheetId: string) => {
		setBusyAction(`open:${runsheetId}`);
		setError(null);
		try {
			const data = await makeRequestWithData<{ runsheet: RunsheetWithData }>(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.CAMPAIGNS.RUNSHEETS.DETAILS(
						campaignId,
						runsheetId
					)
				)
			);
			setSelected(data.runsheet);
			setNotesDraft(data.runsheet.runsheetData.notes ?? "");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to open runsheet");
		} finally {
			setBusyAction(null);
		}
	};

	const handleGenerate = async () => {
		setBusyAction("generate");
		setError(null);
		try {
			const data = await makeRequestWithData<{ runsheet: RunsheetWithData }>(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.CAMPAIGNS.RUNSHEETS.BASE(campaignId)
				),
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(
						nextSessionNumber != null
							? { sessionNumber: nextSessionNumber }
							: {}
					),
				}
			);
			setSelected(data.runsheet);
			setNotesDraft(data.runsheet.runsheetData.notes ?? "");
			await loadRunsheets();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to generate runsheet"
			);
		} finally {
			setBusyAction(null);
		}
	};

	const handleSaveNotes = async () => {
		if (!selected) return;
		setBusyAction("save");
		setError(null);
		try {
			const data = await makeRequestWithData<{ runsheet: RunsheetWithData }>(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.CAMPAIGNS.RUNSHEETS.DETAILS(
						campaignId,
						selected.id
					)
				),
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						runsheetData: { ...selected.runsheetData, notes: notesDraft },
					}),
				}
			);
			setSelected(data.runsheet);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save notes");
		} finally {
			setBusyAction(null);
		}
	};

	const handleDelete = async (runsheetId: string) => {
		setBusyAction(`delete:${runsheetId}`);
		setError(null);
		try {
			await makeRequest(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.CAMPAIGNS.RUNSHEETS.DETAILS(
						campaignId,
						runsheetId
					)
				),
				{ method: "DELETE" }
			);
			if (selected?.id === runsheetId) setSelected(null);
			await loadRunsheets();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to delete runsheet"
			);
		} finally {
			setBusyAction(null);
		}
	};

	/**
	 * Fetch the export with our bearer token and hand it to a popup to print.
	 *
	 * We deliberately do not navigate to the export URL: it is bearer-authenticated
	 * (navigation would 401), and a token-in-URL variant would create exactly the
	 * shareable, spoiler-bearing link a GM-only document must never have.
	 */
	const handlePrint = async () => {
		if (!selected) return;
		setBusyAction("print");
		setError(null);
		try {
			const response = await makeRequest(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.CAMPAIGNS.RUNSHEETS.EXPORT_HTML(
						campaignId,
						selected.id
					)
				)
			);
			if (!response.ok) {
				throw new Error("Failed to export runsheet");
			}
			const html = await response.text();
			const printWindow = window.open("", "_blank", "noopener,noreferrer");
			if (!printWindow) {
				throw new Error(
					"Your browser blocked the print window. Allow pop-ups for this site and try again."
				);
			}
			printWindow.document.open();
			printWindow.document.write(html);
			printWindow.document.close();
			printWindow.focus();
			printWindow.print();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to print runsheet");
		} finally {
			setBusyAction(null);
		}
	};

	const data = selected?.runsheetData;

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div>
					<p className="text-sm text-neutral-600 dark:text-neutral-400">
						One page to run the session from — recap, plan, cast, encounters,
						loot, house rules and open threads, assembled from what your
						campaign already has.
					</p>
					<p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-500">
						GM only — contains spoilers. Never shown to players.
					</p>
				</div>
				{canEdit && (
					<Button
						appearance="form"
						onClick={handleGenerate}
						loading={busyAction === "generate"}
						disabled={busyAction !== null}
						icon={<ArrowClockwise size={16} />}
						data-testid="runsheet-generate"
					>
						{nextSessionNumber != null
							? `Generate for session ${nextSessionNumber}`
							: "Generate runsheet"}
					</Button>
				)}
			</div>

			{error && (
				<p className="text-xs text-red-600 dark:text-red-400" role="alert">
					{error}
				</p>
			)}

			<div className="rounded-lg border border-neutral-200/60 dark:border-neutral-700/60 p-3">
				<h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100 mb-2">
					Snapshots
				</h3>
				{loading ? (
					<p className="text-xs text-neutral-500">Loading…</p>
				) : runsheets.length === 0 ? (
					<p className="text-xs text-neutral-500 dark:text-neutral-400">
						No runsheets yet. Generate one when your prep for the next session
						is ready.
					</p>
				) : (
					<ul className="space-y-1">
						{runsheets.map((runsheet) => (
							<li
								key={runsheet.id}
								className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs ${
									selected?.id === runsheet.id
										? "bg-purple-50 dark:bg-purple-950/40"
										: "bg-neutral-50/60 dark:bg-neutral-900/70"
								}`}
							>
								<button
									type="button"
									className="flex-1 min-w-0 text-left"
									onClick={() => openRunsheet(runsheet.id)}
									disabled={busyAction !== null}
								>
									<span className="font-medium text-neutral-800 dark:text-neutral-100">
										{runsheet.title}
									</span>
									<span className="block text-[11px] text-neutral-500 dark:text-neutral-400">
										Generated {formatTimestamp(runsheet.generatedAt)}
									</span>
								</button>
								{canEdit && (
									<button
										type="button"
										onClick={() => handleDelete(runsheet.id)}
										disabled={busyAction !== null}
										className="p-1.5 text-neutral-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
										title="Delete runsheet"
									>
										<Trash size={14} />
									</button>
								)}
							</li>
						))}
					</ul>
				)}
			</div>

			{selected && data && (
				<div className="rounded-lg border border-neutral-200/60 dark:border-neutral-700/60 p-4">
					<div className="flex flex-wrap items-center justify-between gap-2 mb-3">
						<div>
							<h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
								{selected.title}
							</h3>
							<p className="text-[11px] text-neutral-500 dark:text-neutral-400">
								Frozen snapshot — regenerate to pick up newer campaign data.
							</p>
						</div>
						<Button
							appearance="form"
							onClick={handlePrint}
							loading={busyAction === "print"}
							disabled={busyAction !== null}
							icon={<Printer size={16} />}
							data-testid="runsheet-print"
						>
							Print / Save as PDF
						</Button>
					</div>

					<Section
						title={
							data.recap.fromSessionNumber != null
								? `Recap (session ${data.recap.fromSessionNumber})`
								: "Recap"
						}
						isEmpty={data.emptySections.includes("recap")}
						emptyMessage="No recap recorded. Add a session digest for the previous session."
					>
						<BulletList items={data.recap.keyEvents} />
					</Section>

					<Section
						title="This session's plan"
						isEmpty={data.emptySections.includes("plan")}
						emptyMessage="No plan recorded. Add beats to the previous digest, or planning tasks for this session."
					>
						<BulletList items={data.plan.beats} />
						<BulletList items={data.plan.objectives} />
						{data.plan.openTasks.length > 0 && (
							<ul className="mt-1 list-disc pl-5 space-y-0.5 text-xs text-neutral-700 dark:text-neutral-300">
								{data.plan.openTasks.map((task) => (
									<li key={task.source.id ?? task.title}>{task.title}</li>
								))}
							</ul>
						)}
					</Section>

					<Section
						title="Cast"
						isEmpty={data.emptySections.includes("cast")}
						emptyMessage="No NPCs listed for this session."
					>
						<ul className="space-y-1 text-xs">
							{data.cast.map((member) => (
								<li key={`${member.name}-${member.source.id ?? ""}`}>
									<span className="font-medium text-neutral-800 dark:text-neutral-100">
										{member.name}
									</span>
									{member.hook && (
										<span className="text-neutral-600 dark:text-neutral-400">
											{" "}
											— {member.hook}
										</span>
									)}
								</li>
							))}
						</ul>
					</Section>

					<Section
						title="Encounters"
						isEmpty={data.emptySections.includes("encounters")}
						emptyMessage="No encounters prepared for this session."
					>
						<ul className="space-y-1 text-xs">
							{data.encounters.map((encounter) => (
								<li key={encounter.name}>
									<span className="font-medium text-neutral-800 dark:text-neutral-100">
										{encounter.name}
									</span>
									{Object.keys(encounter.statblock).length > 0 && (
										<span className="ml-2 font-mono text-[10px] text-neutral-500 dark:text-neutral-400">
											{Object.entries(encounter.statblock)
												.map(([label, value]) => `${label} ${value}`)
												.join(" · ")}
										</span>
									)}
								</li>
							))}
						</ul>
					</Section>

					<Section
						title="Loot"
						isEmpty={data.emptySections.includes("loot")}
						emptyMessage="No rewards prepared for this session."
					>
						<BulletList items={data.loot.map((item) => item.name)} />
					</Section>

					<Section
						title="Rules to remember"
						isEmpty={data.emptySections.includes("rules")}
						emptyMessage="No active house rules recorded for this campaign."
					>
						<ul className="space-y-1 text-xs">
							{data.rules.map((rule) => (
								<li key={rule.name}>
									<span className="font-medium text-neutral-800 dark:text-neutral-100">
										{rule.name}
									</span>
									<span className="text-neutral-600 dark:text-neutral-400">
										{" "}
										— {rule.text}
									</span>
								</li>
							))}
						</ul>
					</Section>

					<Section
						title="Open threads"
						isEmpty={data.emptySections.includes("openThreads")}
						emptyMessage="No open threads recorded."
					>
						<BulletList items={data.openThreads.map((thread) => thread.text)} />
					</Section>

					<LazyRunsheetAudioStrip campaignId={campaignId} />

					<section>
						<h4 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700 pb-1 mb-2">
							Notes
						</h4>
						<textarea
							value={notesDraft}
							onChange={(event) => setNotesDraft(event.target.value)}
							disabled={!canEdit}
							rows={4}
							placeholder="Anything else you want on the page at the table…"
							className="w-full rounded-md border border-neutral-200/60 bg-white px-2 py-1.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus-visible:outline-none focus-visible:border-blue-500 focus-visible:ring-1 focus-visible:ring-blue-500 disabled:opacity-60 dark:border-neutral-700/70 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500"
						/>
						{canEdit && (
							<div className="mt-2 flex justify-end">
								<Button
									appearance="form"
									onClick={handleSaveNotes}
									loading={busyAction === "save"}
									disabled={
										busyAction !== null || notesDraft === (data.notes ?? "")
									}
									icon={<FloppyDisk size={16} />}
								>
									Save notes
								</Button>
							</div>
						)}
					</section>
				</div>
			)}
		</div>
	);
}
