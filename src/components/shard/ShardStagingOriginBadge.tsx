/**
 * Staging origin for a pending shard (`shardStagingOrigin` in metadata).
 * User-facing copy is just “New” or “Update”; missing origin shows “New”.
 */
export function ShardStagingOriginBadge({
	metadata,
}: {
	metadata?: Record<string, unknown> | null;
}) {
	const origin = metadata?.shardStagingOrigin;

	const label = origin === "update" ? "Update" : "New";

	const title =
		origin === "update"
			? "Update to an existing shard in your library"
			: origin === "new"
				? "New shard from this extraction"
				: "New";

	return (
		<span
			className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200"
			title={title}
		>
			{label}
		</span>
	);
}
