/**
 * Shows whether a staged shard is new vs an update (`shardStagingOrigin` in metadata).
 * If missing (e.g. legacy staging), shows “Not recorded” so the row is never ambiguous.
 */
export function ShardStagingOriginBadge({
	metadata,
}: {
	metadata?: Record<string, unknown> | null;
}) {
	const origin = metadata?.shardStagingOrigin;
	const isKnown = origin === "new" || origin === "update";

	const label = !isKnown
		? "Not recorded"
		: origin === "new"
			? "New shard"
			: "Updated shard";

	const title = !isKnown
		? "Whether this is a new entity or an update wasn’t stored for this shard (often older staging runs)."
		: origin === "new"
			? "New entity from this extraction"
			: "Updates an existing entity in your library";

	return (
		<span
			className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200"
			title={title}
		>
			{label}
		</span>
	);
}
