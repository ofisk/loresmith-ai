import {
	CaretDown,
	CaretRight,
	ThumbsDown,
	ThumbsUp,
	Warning,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Card } from "@/components/card/Card";
import { useContextAccuracyRating } from "@/hooks/useContextAccuracyRating";
import { getDisplayName } from "@/lib/display-name-utils";
import { openSourceEntity, openSourceResource } from "@/lib/source-navigation";
import { cn } from "@/lib/utils";
import type { ContextSource, Explainability } from "@/types/explainability";

interface ExplainabilitySectionProps {
	explainability: Explainability;
	/** Needed to open an entity and to attribute a context-accuracy rating. */
	campaignId?: string | null;
	collapsedByDefault?: boolean;
}

/** Sources shown per group before the "show all" toggle. */
const COLLAPSED_GROUP_SIZE = 5;

function formatEntityType(entityType?: string): string {
	if (!entityType) return "Entity";
	const formatted = entityType.replace(/_/g, " ");
	return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function formatSectionType(sectionType?: string): string {
	if (!sectionType) return "Section";
	const formatted = sectionType.replace(/_/g, " ");
	return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function formatSessionDate(sessionDate?: string): string | null {
	if (!sessionDate) return null;
	const date = new Date(sessionDate);
	if (Number.isNaN(date.getTime())) return null;
	// A bare YYYY-MM-DD parses as UTC midnight, which formats as the previous
	// day for anyone west of UTC. Session dates are calendar dates, not instants.
	const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(sessionDate);
	return date.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
		...(isDateOnly && { timeZone: "UTC" }),
	});
}

function sourceTitle(source: ContextSource): string {
	if (source.type === "file_content") {
		return getDisplayName({
			display_name: source.title,
			file_name: source.title,
			name: source.title,
		});
	}
	if (source.type === "planning_context") {
		return formatSectionType(source.sectionType);
	}
	return source.title ?? "Unknown";
}

/**
 * Secondary line: where inside the source the excerpt came from. This is what
 * lets a user say "it read the wrong chapter" instead of "the AI is wrong".
 */
function sourceLocation(source: ContextSource): string | null {
	const parts: string[] = [];
	if (source.type === "file_content" && source.chunkIndex !== undefined) {
		parts.push(`Section ${source.chunkIndex + 1}`);
	}
	if (source.type === "planning_context") {
		if (source.sessionNumber !== undefined) {
			parts.push(`Session ${source.sessionNumber}`);
		}
		const date = formatSessionDate(source.sessionDate);
		if (date) parts.push(date);
	}
	if (source.source === "graph_traversal" && source.traversalDepth) {
		parts.push(
			`${source.traversalDepth} hop${source.traversalDepth === 1 ? "" : "s"} away`
		);
	}
	return parts.length > 0 ? parts.join(" · ") : null;
}

function SourceBadge({ source }: { source: ContextSource }) {
	const label =
		source.type === "entity"
			? formatEntityType(source.entityType)
			: source.type === "planning_context"
				? `Session ${source.sessionNumber ?? "?"}`
				: "File";
	return (
		<span className="inline-flex flex-shrink-0 items-center rounded-md bg-neutral-200 px-1.5 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-600 dark:text-neutral-200">
			{label}
		</span>
	);
}

/**
 * Relevance is only shown for real semantic scores. The non-semantic paths
 * (name match, graph traversal, lexical chunk scan) assign fixed placeholder
 * values that would read as confidence if rendered as a percentage.
 */
function RelevanceMeter({ source }: { source: ContextSource }) {
	if (!source.scoreIsSemantic || source.score === undefined) return null;
	const pct = Math.round(Math.max(0, Math.min(1, source.score)) * 100);
	const isWeak = pct < 50;
	return (
		<span
			className="flex flex-shrink-0 items-center gap-1"
			title={`Relevance to your question: ${pct}%`}
		>
			<span className="h-1 w-8 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
				<span
					className={cn(
						"block h-full rounded-full",
						isWeak ? "bg-amber-500" : "bg-emerald-500"
					)}
					style={{ width: `${pct}%` }}
				/>
			</span>
			<span className="text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">
				{pct}%
			</span>
		</span>
	);
}

function SourceRow({
	source,
	campaignId,
}: {
	source: ContextSource;
	campaignId?: string | null;
}) {
	const title = sourceTitle(source);
	const location = sourceLocation(source);

	// Only entities and files have a place to navigate to today; digest sections
	// render as plain rows rather than dead links.
	const target =
		source.type === "entity" && source.id && campaignId
			? () =>
					openSourceEntity({
						campaignId,
						entityId: source.id as string,
						entityName: source.title,
					})
			: source.type === "file_content" && (source.fileKey || source.title)
				? () =>
						openSourceResource({
							fileKey: source.fileKey,
							fileName: source.title,
						})
				: null;

	const body = (
		<>
			<div className="flex items-center gap-2">
				<SourceBadge source={source} />
				<span className="min-w-0 flex-1 truncate text-neutral-700 dark:text-neutral-300">
					{title}
				</span>
				<RelevanceMeter source={source} />
			</div>
			{source.snippet && (
				<p className="mt-1 line-clamp-2 pl-1 text-xs leading-snug text-neutral-600 dark:text-neutral-400">
					“{source.snippet}”
				</p>
			)}
			{location && (
				<p className="mt-0.5 pl-1 text-[11px] text-neutral-500 dark:text-neutral-500">
					{location}
				</p>
			)}
		</>
	);

	if (!target) {
		return <li className="rounded-md px-1 py-1 text-sm">{body}</li>;
	}

	return (
		<li>
			<button
				type="button"
				onClick={target}
				className="w-full cursor-pointer rounded-md px-1 py-1 text-left text-sm transition-colors hover:bg-neutral-200/60 dark:hover:bg-neutral-700/40"
			>
				{body}
			</button>
		</li>
	);
}

function SourceGroup({
	heading,
	sources,
	campaignId,
}: {
	heading: string;
	sources: ContextSource[];
	campaignId?: string | null;
}) {
	const [showAll, setShowAll] = useState(false);
	if (sources.length === 0) return null;

	const visible = showAll ? sources : sources.slice(0, COLLAPSED_GROUP_SIZE);
	const hidden = sources.length - visible.length;

	return (
		<div>
			<h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
				{heading}
			</h4>
			<ul className="space-y-1.5">
				{visible.map((s, i) => (
					<SourceRow
						key={`${s.id ?? i}-${s.chunkIndex ?? s.sectionType ?? s.title ?? i}`}
						source={s}
						campaignId={campaignId}
					/>
				))}
			</ul>
			{hidden > 0 && (
				<button
					type="button"
					onClick={() => setShowAll(true)}
					className="mt-1 cursor-pointer text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
				>
					Show {hidden} more
				</button>
			)}
		</div>
	);
}

function GroundingChip({ explainability }: { explainability: Explainability }) {
	const { grounding, totalSourceCount, contextSources } = explainability;
	const count = totalSourceCount ?? contextSources.length;

	if (grounding === "ungrounded") {
		return (
			<span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
				<Warning size={12} weight="fill" aria-hidden />
				Not grounded
			</span>
		);
	}
	if (grounding === "weak") {
		return (
			<span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
				Weak match · {count}
			</span>
		);
	}
	return (
		<span className="inline-flex items-center rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
			{count} source{count === 1 ? "" : "s"}
		</span>
	);
}

function AccuracyRating({
	campaignId,
	queryId,
}: {
	campaignId?: string | null;
	queryId?: string;
}) {
	const { canRate, verdict, submitting, rate } = useContextAccuracyRating({
		campaignId,
		queryId,
	});
	if (!canRate) return null;

	const buttonClass = (active: boolean) =>
		cn(
			"inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition-colors",
			active
				? "bg-neutral-300 text-neutral-900 dark:bg-neutral-600 dark:text-neutral-100"
				: "text-neutral-500 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-700",
			submitting && "opacity-60"
		);

	return (
		<div className="mt-3 flex items-center gap-2 border-t border-neutral-200/60 pt-2 dark:border-neutral-700/60">
			<span className="text-xs text-neutral-500 dark:text-neutral-400">
				{verdict ? "Thanks — noted." : "Did it pull the right context?"}
			</span>
			<button
				type="button"
				aria-label="Context was accurate"
				aria-pressed={verdict === "accurate"}
				disabled={submitting}
				onClick={() => rate("accurate")}
				className={buttonClass(verdict === "accurate")}
			>
				<ThumbsUp size={13} aria-hidden />
			</button>
			<button
				type="button"
				aria-label="Context was off target"
				aria-pressed={verdict === "inaccurate"}
				disabled={submitting}
				onClick={() => rate("inaccurate")}
				className={buttonClass(verdict === "inaccurate")}
			>
				<ThumbsDown size={13} aria-hidden />
			</button>
		</div>
	);
}

/**
 * "Why this answer" — the retrieved context behind an assistant response.
 *
 * Every source shown here came from a tool result that already passed the
 * role-based sanitizers in the search tools, so a player never sees a GM-only
 * source in this list.
 */
export function ExplainabilitySection({
	explainability,
	campaignId,
	collapsedByDefault = true,
}: ExplainabilitySectionProps) {
	const [isExpanded, setIsExpanded] = useState(!collapsedByDefault);

	const { rationale, contextSources, grounding, queryId } = explainability;

	const { entities, planning, files } = useMemo(
		() => ({
			entities: contextSources.filter((s) => s.type === "entity"),
			planning: contextSources.filter((s) => s.type === "planning_context"),
			files: contextSources.filter((s) => s.type === "file_content"),
		}),
		[contextSources]
	);

	// An ungrounded answer has nothing to expand — the signal *is* the message,
	// so state it inline rather than hiding it behind a disclosure.
	if (grounding === "ungrounded" || contextSources.length === 0) {
		return (
			<div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50/70 p-2 dark:border-amber-700/50 dark:bg-amber-950/30">
				<Warning
					size={14}
					weight="fill"
					className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400"
					aria-hidden
				/>
				<p className="text-xs text-amber-900 dark:text-amber-200">
					No campaign sources — this answer isn’t grounded in your materials.
				</p>
			</div>
		);
	}

	return (
		<div className="mt-2">
			<button
				type="button"
				aria-expanded={isExpanded}
				className="w-full cursor-pointer rounded-lg border border-neutral-200/50 p-2 text-left transition-colors hover:bg-neutral-100/50 dark:border-neutral-700/50 dark:hover:bg-neutral-800/50"
				onClick={() => setIsExpanded(!isExpanded)}
			>
				<div className="flex items-center gap-2">
					{isExpanded ? (
						<CaretDown size={14} className="flex-shrink-0 text-neutral-500" />
					) : (
						<CaretRight size={14} className="flex-shrink-0 text-neutral-500" />
					)}
					<span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
						Sources
					</span>
					<GroundingChip explainability={explainability} />
				</div>
			</button>
			{isExpanded && (
				<Card className="mt-1 rounded-lg border border-neutral-200/50 bg-neutral-50/80 p-3 dark:border-neutral-700/50 dark:bg-neutral-900/50">
					<p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
						{rationale}
					</p>
					<div className="space-y-3">
						<SourceGroup
							heading="Entities"
							sources={entities}
							campaignId={campaignId}
						/>
						<SourceGroup
							heading="Session digests"
							sources={planning}
							campaignId={campaignId}
						/>
						<SourceGroup
							heading="Documents"
							sources={files}
							campaignId={campaignId}
						/>
					</div>
					<AccuracyRating campaignId={campaignId} queryId={queryId} />
				</Card>
			)}
		</div>
	);
}
