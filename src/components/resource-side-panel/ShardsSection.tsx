import { ArrowsClockwise, PuzzlePiece } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/card/Card";
import { UnifiedShardManager } from "@/components/chat/UnifiedShardManager";
import { Modal } from "@/components/modal/Modal";
import type { StagedShardGroup } from "@/types/shard";

interface ShardsSectionProps {
	shards: StagedShardGroup[];
	isLoading: boolean;
	onShardsProcessed: (shardIds: string[]) => void;
	getJwt: () => string | null;
	onRefresh?: () => void;
	isCollapsed?: boolean;
}

export function ShardsSection({
	shards,
	isLoading,
	onShardsProcessed,
	getJwt,
	onRefresh,
	isCollapsed = false,
}: ShardsSectionProps) {
	const [isOpen, setIsOpen] = useState(false);
	// See NotificationBell: portal to <body> to escape ResourceSidePanel's
	// backdrop-blur-sm containing block for `position: fixed`.
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	const totalShards = shards.reduce(
		(total, group) => total + (group.shards?.length || 0),
		0
	);
	const displayCount = isLoading ? "…" : totalShards;

	return (
		<>
			<Card className="tour-shard-review p-0 flex flex-col">
				<button
					type="button"
					onClick={() => setIsOpen(true)}
					title={isCollapsed ? "Shards" : undefined}
					aria-label={isCollapsed ? "Shards" : undefined}
					className={
						isCollapsed
							? "w-full p-1.5 flex items-center justify-center hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
							: "w-full p-2 flex items-center gap-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
					}
				>
					<span className="relative w-8 h-8 flex items-center justify-center shrink-0">
						<PuzzlePiece
							size={20}
							weight="light"
							className="text-purple-600 dark:text-purple-400"
						/>
						{isCollapsed && totalShards > 0 && (
							<span
								className="absolute top-0 right-0 w-2 h-2 rounded-full bg-red-500"
								aria-hidden
							/>
						)}
					</span>
					{!isCollapsed && (
						<>
							<span className="font-medium text-sm">Shards</span>
							{totalShards > 0 && (
								<span className="ml-auto h-5 min-w-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-medium flex items-center justify-center leading-none shrink-0">
									{displayCount}
								</span>
							)}
						</>
					)}
				</button>
			</Card>

			{mounted &&
				createPortal(
					<Modal
						isOpen={isOpen}
						onClose={() => setIsOpen(false)}
						className="modal-size-md"
						options={{ clickOutsideToClose: true }}
					>
						<div className="h-full flex flex-col">
							<div className="flex items-center justify-between gap-4 p-4 pr-12 border-b border-neutral-200 dark:border-neutral-700 flex-shrink-0">
								<h3 className="font-medium text-lg text-neutral-900 dark:text-neutral-100">
									Pending shards {totalShards > 0 && `(${totalShards} total)`}
								</h3>
								{onRefresh && (
									<button
										type="button"
										onClick={onRefresh}
										aria-label="Refresh shards"
										title="Refresh shards"
										className="p-1 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition-colors text-neutral-600 dark:text-neutral-400 shrink-0"
									>
										<ArrowsClockwise size={20} />
									</button>
								)}
							</div>

							<div className="flex-1 overflow-y-auto overscroll-behavior-contain min-h-0 p-4">
								<UnifiedShardManager
									shards={shards}
									isLoading={isLoading}
									onShardsProcessed={onShardsProcessed}
									getJwt={getJwt}
									onRefresh={onRefresh}
								/>
							</div>
						</div>
					</Modal>,
					document.body
				)}
		</>
	);
}
