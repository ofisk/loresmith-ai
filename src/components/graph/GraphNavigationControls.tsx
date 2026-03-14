import {
	CaretDown,
	CaretLeft,
	CaretRight,
	CaretUp,
	Minus,
	Plus,
} from "@phosphor-icons/react";

interface GraphNavigationControlsProps {
	onZoomIn: () => void;
	onZoomOut: () => void;
	onPanUp: () => void;
	onPanDown: () => void;
	onPanLeft: () => void;
	onPanRight: () => void;
}

export function GraphNavigationControls({
	onZoomIn,
	onZoomOut,
	onPanUp,
	onPanDown,
	onPanLeft,
	onPanRight,
}: GraphNavigationControlsProps) {
	const buttonClass =
		"w-8 h-8 flex items-center justify-center bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors rounded";

	return (
		<div className="absolute top-4 right-4 z-10 flex flex-row gap-2">
			{/* Pan controls */}
			<div className="grid grid-cols-3 gap-1">
				<div />
				<button
					type="button"
					onClick={onPanUp}
					className={buttonClass}
					aria-label="Pan up"
				>
					<CaretUp size={16} weight="bold" aria-hidden />
				</button>
				<div />
				<button
					type="button"
					onClick={onPanLeft}
					className={buttonClass}
					aria-label="Pan left"
				>
					<CaretLeft size={16} weight="bold" aria-hidden />
				</button>
				<div />
				<button
					type="button"
					onClick={onPanRight}
					className={buttonClass}
					aria-label="Pan right"
				>
					<CaretRight size={16} weight="bold" aria-hidden />
				</button>
				<div />
				<button
					type="button"
					onClick={onPanDown}
					className={buttonClass}
					aria-label="Pan down"
				>
					<CaretDown size={16} weight="bold" aria-hidden />
				</button>
				<div />
			</div>

			{/* Zoom controls */}
			<div className="flex flex-col gap-1">
				<button
					type="button"
					onClick={onZoomIn}
					aria-label="Zoom in"
					className="w-8 h-8 flex items-center justify-center bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors rounded-full"
				>
					<Plus size={16} weight="bold" aria-hidden />
				</button>
				<button
					type="button"
					onClick={onZoomOut}
					aria-label="Zoom out"
					className="w-8 h-8 flex items-center justify-center bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors rounded-full"
				>
					<Minus size={16} weight="bold" aria-hidden />
				</button>
			</div>
		</div>
	);
}
