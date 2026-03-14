import { cn } from "@/lib/utils";

type ToggleProps = {
	onClick: () => void;
	size?: "sm" | "base" | "lg";
	toggled: boolean;
};

export const Toggle = ({ onClick, size = "base", toggled }: ToggleProps) => {
	return (
		<button
			type="button"
			className={cn(
				"ob-focus interactive dark:bg-neutral-750 bg-neutral-250 cursor-pointer rounded-full border border-transparent p-1 transition-colors hover:bg-neutral-300 dark:hover:bg-neutral-700",
				{
					"h-[var(--size-toggle-sm-h)] w-[var(--size-toggle-sm-w)]":
						size === "sm",
					"h-[var(--size-toggle-base-h)] w-[var(--size-toggle-base-w)]":
						size === "base",
					"h-[var(--size-toggle-lg-h)] w-[var(--size-toggle-lg-w)]":
						size === "lg",
					"dark:hover:bg-neutral-450 bg-neutral-900 hover:bg-neutral-700 dark:bg-neutral-500":
						toggled,
				}
			)}
			onClick={onClick}
		>
			<div
				className={cn(
					"aspect-square h-full rounded-full bg-white transition-all",
					{
						"translate-x-full": toggled,
					}
				)}
			/>
		</button>
	);
};
