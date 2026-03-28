/**
 * Shows whether a staged shard is new vs an update (`shardStagingOrigin` in metadata).
 * If missing (e.g. legacy staging), shows “New entity” like known-new shards.
 */
export function ShardStagingOriginBadge({
	metadata,
}: {
	metadata?: Record<string, unknown> | null;
}) {
	const origin = metadata?.shardStagingOrigin;

	const label = origin === "update" ? "Updated shard" : "New entity";

	const title =
		origin === "update"
			? "Updates an existing entity in your library"
			: origin === "new"
				? "New entity from this extraction"
				: "New entity";

	return (
		<span
			className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200"
			title={title}
		>
			{label}
		</span>
	);
}
