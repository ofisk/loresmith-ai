/**
 * Shows whether a staged shard is a new entity or an update to an existing one
 * (set in entity staging metadata as `shardStagingOrigin`).
 */
export function ShardStagingOriginBadge({
	metadata,
}: {
	metadata?: Record<string, unknown> | null;
}) {
	const origin = metadata?.shardStagingOrigin;
	if (origin !== "new" && origin !== "update") {
		return null;
	}
	return (
		<span
			className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200"
			title={
				origin === "new"
					? "New entity from this extraction"
					: "Updates an existing entity in your library"
			}
		>
			{origin === "new" ? "New shard" : "Updated shard"}
		</span>
	);
}
