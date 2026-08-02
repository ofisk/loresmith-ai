import { useCallback, useState } from "react";
import { Button } from "@/components/button/Button";
import {
	useAdminExperiments,
	useExperimentResults,
} from "@/hooks/useAdminExperiments";
import { EXPERIMENT_CACHE_TTL_MS } from "@/services/experiment-service";
import type { Experiment, ExperimentStatus } from "@/types/experiments";
import { EXPERIMENT_STATUSES } from "@/types/experiments";

const STATUS_HELP: Record<ExperimentStatus, string> = {
	off: "Everyone gets control. Kill switch.",
	on: "Everyone gets treatment. Fully rolled out.",
	experiment: "Rollout % of users get treatment, the rest control.",
};

const PROPAGATION_NOTE = `Changes take up to ${Math.round(
	EXPERIMENT_CACHE_TTL_MS / 1000
)}s to reach every server, and a user sees them on their next page load.`;

function formatUpdated(experiment: Experiment): string {
	const who = experiment.updatedBy ?? "unknown";
	const when = experiment.updatedAt
		? new Date(`${experiment.updatedAt.replace(" ", "T")}Z`).toLocaleString()
		: "unknown";
	return `${who} · ${when}`;
}

function StatusSelect({
	value,
	onChange,
	disabled,
}: {
	value: ExperimentStatus;
	onChange: (next: ExperimentStatus) => void;
	disabled?: boolean;
}) {
	return (
		<select
			aria-label="Status"
			className="px-2 py-1 text-sm rounded-md border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900"
			value={value}
			disabled={disabled}
			onChange={(e) => onChange(e.target.value as ExperimentStatus)}
		>
			{EXPERIMENT_STATUSES.map((status) => (
				<option key={status} value={status}>
					{status}
				</option>
			))}
		</select>
	);
}

/**
 * Per-arm exposure counts. Rendered only for an expanded row so the list view
 * stays one query; `experiment_exposure` rows are written once per user per
 * session by the assignments endpoint.
 */
function ResultsRow({ experimentKey }: { experimentKey: string }) {
	const { results, loading, error } = useExperimentResults(experimentKey);

	if (loading) {
		return (
			<div className="text-sm text-neutral-500 dark:text-neutral-400">
				Loading exposures…
			</div>
		);
	}
	if (error) {
		return (
			<div className="text-sm text-red-600 dark:text-red-400">
				{error.message}
			</div>
		);
	}
	if (!results || results.exposures.length === 0) {
		return (
			<div className="text-sm text-neutral-500 dark:text-neutral-400">
				No exposures recorded yet. Only experiments with status{" "}
				<code>experiment</code> record them.
			</div>
		);
	}

	const total = results.exposures.reduce((sum, arm) => sum + arm.exposures, 0);
	return (
		<div className="flex flex-wrap gap-4 text-sm">
			{results.exposures.map((arm) => (
				<div key={arm.variant} className="min-w-24">
					<div className="text-neutral-600 dark:text-neutral-400">
						{arm.variant}
					</div>
					<div className="font-medium tabular-nums">
						{arm.exposures.toLocaleString()}
						<span className="text-neutral-500 dark:text-neutral-400 font-normal">
							{total > 0
								? ` (${Math.round((arm.exposures / total) * 100)}%)`
								: ""}
						</span>
					</div>
				</div>
			))}
		</div>
	);
}

function ExperimentRow({
	experiment,
	onUpdate,
	onDelete,
}: {
	experiment: Experiment;
	onUpdate: (
		key: string,
		patch: { status?: ExperimentStatus; rolloutPct?: number }
	) => Promise<void>;
	onDelete: (key: string) => Promise<void>;
}) {
	const [busy, setBusy] = useState(false);
	// Local slider value so dragging stays smooth; only the release writes.
	const [pct, setPct] = useState(experiment.rolloutPct);
	const [expanded, setExpanded] = useState(false);

	const run = useCallback(async (action: () => Promise<void>) => {
		setBusy(true);
		try {
			await action();
		} finally {
			setBusy(false);
		}
	}, []);

	return (
		<div className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 space-y-3">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="font-medium break-words">{experiment.key}</div>
					<div className="text-sm text-neutral-600 dark:text-neutral-400 break-words">
						{experiment.description || "No description"}
					</div>
					<div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
						Last changed by {formatUpdated(experiment)}
					</div>
				</div>
				<div className="flex items-center gap-2">
					<StatusSelect
						value={experiment.status}
						disabled={busy}
						onChange={(status) =>
							run(() => onUpdate(experiment.key, { status }))
						}
					/>
					<Button
						appearance="form"
						variant="destructive"
						size="sm"
						disabled={busy}
						onClick={() => run(() => onDelete(experiment.key))}
					>
						Delete
					</Button>
				</div>
			</div>

			<div className="text-xs text-neutral-500 dark:text-neutral-400">
				{STATUS_HELP[experiment.status]}
			</div>

			<div className="flex items-center gap-3">
				<label
					className="text-sm text-neutral-600 dark:text-neutral-400 shrink-0"
					htmlFor={`rollout-${experiment.key}`}
				>
					Rollout
				</label>
				<input
					id={`rollout-${experiment.key}`}
					type="range"
					min={0}
					max={100}
					step={1}
					value={pct}
					disabled={busy || experiment.status !== "experiment"}
					className="flex-1 min-w-32"
					onChange={(e) => setPct(Number(e.target.value))}
					onMouseUp={() =>
						run(() => onUpdate(experiment.key, { rolloutPct: pct }))
					}
					onTouchEnd={() =>
						run(() => onUpdate(experiment.key, { rolloutPct: pct }))
					}
					onKeyUp={() =>
						run(() => onUpdate(experiment.key, { rolloutPct: pct }))
					}
				/>
				<span className="text-sm font-medium tabular-nums w-12 text-right">
					{pct}%
				</span>
			</div>

			<div>
				<button
					type="button"
					className="text-sm underline text-neutral-600 dark:text-neutral-400"
					onClick={() => setExpanded((prev) => !prev)}
				>
					{expanded ? "Hide exposures" : "Show exposures"}
				</button>
				{expanded && (
					<div className="mt-2">
						<ResultsRow experimentKey={experiment.key} />
					</div>
				)}
			</div>
		</div>
	);
}

function CreateExperimentForm({
	onCreate,
}: {
	onCreate: (input: { key: string; description: string }) => Promise<void>;
}) {
	const [key, setKey] = useState("");
	const [description, setDescription] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const submit = useCallback(async () => {
		const trimmed = key.trim();
		if (!trimmed) {
			setError("Key is required");
			return;
		}
		setBusy(true);
		setError(null);
		try {
			await onCreate({ key: trimmed, description: description.trim() });
			setKey("");
			setDescription("");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create");
		} finally {
			setBusy(false);
		}
	}, [key, description, onCreate]);

	return (
		<div className="border border-dashed border-neutral-300 dark:border-neutral-600 rounded-lg p-4 space-y-3">
			<div className="font-medium">New flag</div>
			<div className="flex flex-col sm:flex-row gap-2">
				<input
					aria-label="Flag key"
					placeholder="camelCaseKey"
					className="flex-1 min-w-0 px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900"
					value={key}
					onChange={(e) => setKey(e.target.value)}
				/>
				<input
					aria-label="Description"
					placeholder="What does it change?"
					className="flex-1 min-w-0 px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900"
					value={description}
					onChange={(e) => setDescription(e.target.value)}
				/>
				<Button
					appearance="form"
					variant="primary"
					disabled={busy}
					onClick={submit}
				>
					Create
				</Button>
			</div>
			<div className="text-xs text-neutral-500 dark:text-neutral-400">
				New flags start <code>off</code>, so creating one is always safe. The
				key is what you pass to <code>useFeatureFlag()</code>.
			</div>
			{error && (
				<div className="text-sm text-red-600 dark:text-red-400">{error}</div>
			)}
		</div>
	);
}

/**
 * Admin surface for runtime flags and A/B experiments (issue #755). Lives beside
 * the telemetry dashboard in the existing admin modal rather than behind a new
 * route, because admin access is already gated there.
 */
export function ExperimentsPanel() {
	const {
		experiments,
		loading,
		error,
		createExperiment,
		updateExperiment,
		deleteExperiment,
	} = useAdminExperiments();

	return (
		<div className="space-y-4">
			<div>
				<div className="text-xl md:text-2xl font-bold">
					Feature flags & experiments
				</div>
				<div className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
					{PROPAGATION_NOTE}
				</div>
			</div>

			<CreateExperimentForm
				onCreate={(input) => createExperiment({ ...input, status: "off" })}
			/>

			{loading && (
				<div className="text-sm text-neutral-500 dark:text-neutral-400">
					Loading experiments…
				</div>
			)}
			{error && (
				<div className="text-sm text-red-600 dark:text-red-400">
					{error.message}
				</div>
			)}
			{!loading && !error && experiments.length === 0 && (
				<div className="text-sm text-neutral-500 dark:text-neutral-400">
					No flags yet. Create one above.
				</div>
			)}

			<div className="space-y-3">
				{experiments.map((experiment) => (
					<ExperimentRow
						key={experiment.key}
						experiment={experiment}
						onUpdate={updateExperiment}
						onDelete={deleteExperiment}
					/>
				))}
			</div>
		</div>
	);
}
