import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { Card } from "@/components/card/Card";
import { cn } from "@/lib/utils";

export interface CollapsibleCardProps {
	/** Content for the toggle button (e.g. icon + title) */
	header: React.ReactNode;
	/** Optional content to show in header after main content (e.g. badge) */
	headerSupplement?: React.ReactNode;
	isOpen: boolean;
	onToggle: () => void;
	children: React.ReactNode;
	className?: string;
	/** Data attribute for tour targeting */
	tourClassName?: string;
}

/**
 * Reusable collapsible card with toggle button.
 * Composes header + expandable content. Use for CampaignsSection, LibrarySection, etc.
 */
export function CollapsibleCard({
	header,
	headerSupplement,
	isOpen,
	onToggle,
	children,
	className,
	tourClassName,
}: CollapsibleCardProps) {
	const contentId = `collapsible-content-${tourClassName ?? "default"}`;
	return (
		<Card className={cn("p-0 flex flex-col", tourClassName, className)}>
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={isOpen}
				aria-controls={contentId}
				className="w-full p-2 flex items-center justify-between text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
			>
				<div className="flex items-center gap-2">
					{header}
					{headerSupplement}
				</div>
				{isOpen ? (
					<CaretDown size={16} aria-hidden="true" />
				) : (
					<CaretRight size={16} aria-hidden="true" />
				)}
			</button>

			{isOpen && (
				<div
					id={contentId}
					className="border-t border-neutral-200 dark:border-neutral-700"
				>
					{children}
				</div>
			)}
		</Card>
	);
}
