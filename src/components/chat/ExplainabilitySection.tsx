import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { useState } from "react";
import { Card } from "@/components/card/Card";
import { getDisplayName } from "@/lib/display-name-utils";
import type { ContextSource, Explainability } from "@/types/explainability";

interface ExplainabilitySectionProps {
	explainability: Explainability;
	collapsedByDefault?: boolean;
}

function formatEntityType(entityType?: string): string {
	if (!entityType) return "Entity";
	const formatted = entityType.replace(/_/g, " ");
	return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function SourceBadge({ source }: { source: ContextSource }) {
	const label =
		source.type === "entity"
			? formatEntityType(source.entityType)
			: source.type === "planning_context"
				? `Session ${source.sessionNumber ?? "?"}`
				: "File";
	return (
		<span className="inline-flex items-center rounded-md bg-neutral-200 px-1.5 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-600 dark:text-neutral-200">
			{label}
		</span>
	);
}

export function ExplainabilitySection({
	explainability,
	collapsedByDefault = true,
}: ExplainabilitySectionProps) {
	const [isExpanded, setIsExpanded] = useState(!collapsedByDefault);

	const { rationale, contextSources } = explainability;
	const hasSources = contextSources.length > 0;

	const entities = contextSources.filter((s) => s.type === "entity");
	const planning = contextSources.filter((s) => s.type === "planning_context");
	const files = contextSources.filter((s) => s.type === "file_content");

	return (
		<div className="mt-2">
			<button
				type="button"
				className="w-full text-left border border-neutral-200/50 dark:border-neutral-700/50 rounded-lg p-2 hover:bg-neutral-100/50 dark:hover:bg-neutral-800/50 transition-colors cursor-pointer"
				onClick={() => setIsExpanded(!isExpanded)}
			>
				<div className="flex items-center gap-2">
					{isExpanded ? (
						<CaretDown size={14} className="text-neutral-500 flex-shrink-0" />
					) : (
						<CaretRight size={14} className="text-neutral-500 flex-shrink-0" />
					)}
					<span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
						How this was generated
					</span>
				</div>
			</button>
			{isExpanded && (
				<Card className="mt-1 p-3 rounded-lg border border-neutral-200/50 dark:border-neutral-700/50 bg-neutral-50/80 dark:bg-neutral-900/50">
					<p className="text-sm text-neutral-600 dark:text-neutral-400 mb-3">
						{rationale}
					</p>
					{hasSources && (
						<div className="space-y-3">
							{entities.length > 0 && (
								<div>
									<h4 className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
										Entities
									</h4>
									<ul className="space-y-1">
										{entities.slice(0, 10).map((s, i) => (
											<li
												key={`${s.id ?? i}-${s.title ?? ""}`}
												className="flex items-center gap-2 text-sm"
											>
												<SourceBadge source={s} />
												<span className="text-neutral-700 dark:text-neutral-300 truncate">
													{s.title ?? "Unknown"}
												</span>
											</li>
										))}
										{entities.length > 10 && (
											<li className="text-xs text-muted-foreground">
												+{entities.length - 10} more
											</li>
										)}
									</ul>
								</div>
							)}
							{planning.length > 0 && (
								<div>
									<h4 className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
										Session digests
									</h4>
									<ul className="space-y-1">
										{planning.slice(0, 5).map((s, i) => (
											<li
												key={`${s.id ?? i}-${s.sessionNumber ?? ""}`}
												className="flex items-center gap-2 text-sm"
											>
												<SourceBadge source={s} />
												<span className="text-neutral-700 dark:text-neutral-300 truncate">
													{s.sectionType ?? `Session ${s.sessionNumber}`}
												</span>
											</li>
										))}
										{planning.length > 5 && (
											<li className="text-xs text-muted-foreground">
												+{planning.length - 5} more
											</li>
										)}
									</ul>
								</div>
							)}
							{files.length > 0 && (
								<div>
									<h4 className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
										Files
									</h4>
									<ul className="space-y-1">
										{files.slice(0, 5).map((s, i) => (
											<li
												key={`${s.id ?? i}-${s.title ?? ""}`}
												className="flex items-center gap-2 text-sm"
											>
												<SourceBadge source={s} />
												<span className="text-neutral-700 dark:text-neutral-300 truncate">
													{getDisplayName({
														display_name: s.title,
														file_name: s.title,
														name: s.title,
													})}
												</span>
											</li>
										))}
										{files.length > 5 && (
											<li className="text-xs text-muted-foreground">
												+{files.length - 5} more
											</li>
										)}
									</ul>
								</div>
							)}
						</div>
					)}
				</Card>
			)}
		</div>
	);
}
