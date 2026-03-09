import { CaretDown, CaretRight, X } from "@phosphor-icons/react";
import { useState } from "react";
import { useActionQueue } from "@/contexts/ActionQueueContext";

export function ActionQueueUI() {
	const queue = useActionQueue();
	const [isOpen, setIsOpen] = useState(false);

	if (!queue || queue.queuedCount === 0) return null;

	return (
		<div className="border-t border-neutral-200 dark:border-neutral-700">
			<button
				type="button"
				onClick={() => setIsOpen((o) => !o)}
				className="w-full px-2 py-1.5 flex items-center justify-between text-left text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors"
			>
				<div className="flex items-center gap-2 min-w-0">
					{isOpen ? (
						<CaretDown size={14} className="shrink-0" />
					) : (
						<CaretRight size={14} className="shrink-0" />
					)}
					<span>
						{queue.queuedCount} action
						{queue.queuedCount === 1 ? "" : "s"} queued
						{queue.isRetrying
							? " – retrying..."
							: " – will retry when capacity available"}
					</span>
				</div>
			</button>
			{isOpen && (
				<div className="px-2 py-1.5 space-y-1.5 max-h-40 overflow-y-auto">
					{queue.queue.map((item) => (
						<div
							key={item.id}
							className="flex items-center justify-between gap-2 py-1 pr-1 rounded bg-neutral-100 dark:bg-neutral-800/50"
						>
							<div className="min-w-0 flex-1 text-xs">
								<div className="font-medium text-neutral-800 dark:text-neutral-200 truncate">
									{item.label}
								</div>
							</div>
							<button
								type="button"
								onClick={() => queue.removeFromQueue(item.id)}
								className="shrink-0 p-1 rounded text-neutral-500 hover:text-neutral-700 hover:bg-neutral-200 dark:hover:text-neutral-300 dark:hover:bg-neutral-700 transition-colors"
								title="Cancel"
								aria-label="Cancel queued action"
							>
								<X size={14} />
							</button>
						</div>
					))}
					<button
						type="button"
						onClick={() => queue.clearQueue()}
						className="w-full text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-400 py-1"
					>
						Clear all
					</button>
				</div>
			)}
		</div>
	);
}
