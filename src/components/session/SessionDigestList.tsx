import { Eye, PencilSimple, Trash } from "@phosphor-icons/react";
import type { SessionDigestWithData } from "@/types/session-digest";

interface SessionDigestListProps {
	digests: SessionDigestWithData[];
	loading?: boolean;
	error?: string | null;
	onView?: (digest: SessionDigestWithData) => void;
	onEdit?: (digest: SessionDigestWithData) => void;
	onDelete?: (digest: SessionDigestWithData) => void;
	className?: string;
}

export function SessionDigestList({
	digests,
	loading = false,
	error = null,
	onView,
	onEdit,
	onDelete,
	className = "",
}: SessionDigestListProps) {
	if (loading) {
		return (
			<div className={`p-4 text-center ${className}`}>
				<div className="text-neutral-500 dark:text-neutral-400">
					Loading digests...
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className={`p-4 text-center ${className}`}>
				<div className="text-red-500 dark:text-red-400 mb-2">
					Error loading digests
				</div>
				<p className="text-sm text-neutral-400">{error}</p>
			</div>
		);
	}

	if (digests.length === 0) {
		return (
			<div className={`p-8 text-center ${className}`}>
				<div className="text-neutral-500 dark:text-neutral-400 mb-2">
					No session digests yet
				</div>
				<p className="text-sm text-neutral-400">
					Create your first session digest to start tracking your campaign
					sessions
				</p>
			</div>
		);
	}

	return (
		<div className={`space-y-2 ${className}`}>
			{digests.map((digest) => (
				<div
					key={digest.id}
					className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
				>
					<div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
						<div className="flex-1 min-w-0">
							<div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
								<h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
									Session {digest.sessionNumber}
								</h3>
								{digest.sessionDate && (
									<span className="text-sm text-neutral-500 dark:text-neutral-400">
										{new Date(digest.sessionDate).toLocaleDateString()}
									</span>
								)}
							</div>
							<div className="text-xs text-neutral-500 dark:text-neutral-400">
								Created {new Date(digest.createdAt).toLocaleDateString()}
								{digest.updatedAt !== digest.createdAt && (
									<span className="ml-2">
										• Updated {new Date(digest.updatedAt).toLocaleDateString()}
									</span>
								)}
							</div>
							{digest.digestData.last_session_recap.key_events.length > 0 && (
								<div className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
									<span className="font-medium">
										{digest.digestData.last_session_recap.key_events.length}
									</span>{" "}
									key event
									{digest.digestData.last_session_recap.key_events.length !== 1
										? "s"
										: ""}
								</div>
							)}
						</div>
						<div className="flex items-center gap-2 self-end sm:self-auto">
							{onView && (
								<button
									type="button"
									onClick={() => onView(digest)}
									className="p-2 text-neutral-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
									title="View digest"
								>
									<Eye size={18} />
								</button>
							)}
							{onEdit && (
								<button
									type="button"
									onClick={() => onEdit(digest)}
									className="p-2 text-neutral-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
									title="Edit digest"
								>
									<PencilSimple size={18} />
								</button>
							)}
							{onDelete && (
								<button
									type="button"
									onClick={() => onDelete(digest)}
									className="p-2 text-neutral-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
									title="Delete digest"
								>
									<Trash size={18} />
								</button>
							)}
						</div>
					</div>
				</div>
			))}
		</div>
	);
}
