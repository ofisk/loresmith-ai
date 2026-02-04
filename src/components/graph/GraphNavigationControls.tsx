import {
  Plus,
  Minus,
  CaretUp,
  CaretDown,
  CaretLeft,
  CaretRight,
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
          title="Pan up"
        >
          <CaretUp size={16} weight="bold" />
        </button>
        <div />
        <button
          type="button"
          onClick={onPanLeft}
          className={buttonClass}
          title="Pan left"
        >
          <CaretLeft size={16} weight="bold" />
        </button>
        <div />
        <button
          type="button"
          onClick={onPanRight}
          className={buttonClass}
          title="Pan right"
        >
          <CaretRight size={16} weight="bold" />
        </button>
        <div />
        <button
          type="button"
          onClick={onPanDown}
          className={buttonClass}
          title="Pan down"
        >
          <CaretDown size={16} weight="bold" />
        </button>
        <div />
      </div>

      {/* Zoom controls */}
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={onZoomIn}
          className="w-8 h-8 flex items-center justify-center bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors rounded-full"
          title="Zoom in"
        >
          <Plus size={16} weight="bold" />
        </button>
        <button
          type="button"
          onClick={onZoomOut}
          className="w-8 h-8 flex items-center justify-center bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors rounded-full"
          title="Zoom out"
        >
          <Minus size={16} weight="bold" />
        </button>
      </div>
    </div>
  );
}
