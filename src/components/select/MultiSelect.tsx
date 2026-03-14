import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type MultiSelectOption = {
	value: string;
	label: string;
};

export type MultiSelectProps = {
	className?: string;
	options: MultiSelectOption[];
	placeholder?: string;
	selectedValues: string[];
	onSelectionChange: (values: string[]) => void;
	size?: "sm" | "md" | "base";
	/** If true, the dropdown closes after each selection change */
	closeOnSelect?: boolean;
	/** Accessible label for screen readers */
	ariaLabel?: string;
};

export const MultiSelect = ({
	className,
	options,
	placeholder = "Select options...",
	selectedValues,
	onSelectionChange,
	size = "base",
	closeOnSelect = false,
	ariaLabel,
}: MultiSelectProps) => {
	const [isOpen, setIsOpen] = useState(false);
	const [highlightedIndex, setHighlightedIndex] = useState(0);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(event.target as Node)
			) {
				setIsOpen(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	useEffect(() => {
		if (isOpen) {
			setHighlightedIndex(0);
		}
	}, [isOpen]);

	const toggleOption = (value: string) => {
		const newSelection = selectedValues.includes(value)
			? selectedValues.filter((v) => v !== value)
			: [...selectedValues, value];
		onSelectionChange(newSelection);
		if (closeOnSelect) {
			setIsOpen(false);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (!isOpen) {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				setIsOpen(true);
			}
			return;
		}
		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				setHighlightedIndex((prev) =>
					prev < options.length - 1 ? prev + 1 : prev
				);
				break;
			case "ArrowUp":
				e.preventDefault();
				setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
				break;
			case "Enter":
			case " ":
				e.preventDefault();
				if (options[highlightedIndex]) {
					toggleOption(options[highlightedIndex].value);
				}
				break;
			case "Escape":
				e.preventDefault();
				setIsOpen(false);
				break;
		}
	};

	const selectedLabels = options
		.filter((option) => selectedValues.includes(option.value))
		.map((option) => option.label)
		.join(", ");

	return (
		<div className={cn("relative", className)} ref={dropdownRef}>
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				onKeyDown={handleKeyDown}
				aria-label={ariaLabel}
				aria-haspopup="listbox"
				aria-expanded={isOpen}
				className={cn(
					"btn btn-secondary interactive relative appearance-none truncate bg-no-repeat focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 w-full text-left",
					{
						"add-size-sm !pr-6.5": size === "sm",
						"add-size-md !pr-8": size === "md",
						"add-size-base !pr-9": size === "base",
					}
				)}
				style={{
					backgroundImage: "url(/assets/caret.svg)",
					backgroundPosition: `calc(100% - ${size === "base" ? "10px" : size === "md" ? "8px" : "6px"}) calc(100% / 2)`,
					backgroundSize:
						size === "base" ? "16px" : size === "md" ? "14px" : "12px",
				}}
			>
				{selectedValues.length > 0 ? selectedLabels : placeholder}
			</button>

			{isOpen && (
				<div
					ref={listRef}
					role="listbox"
					aria-label={ariaLabel}
					tabIndex={-1}
					className="absolute z-50 w-full mt-1 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg max-h-60 overflow-y-auto"
					onKeyDown={handleKeyDown}
				>
					{options.map((option, index) => (
						<div
							key={option.value}
							role="option"
							tabIndex={index === highlightedIndex ? 0 : -1}
							aria-selected={selectedValues.includes(option.value)}
							className={cn(
								"flex items-center px-3 py-2 cursor-pointer",
								index === highlightedIndex &&
									"bg-neutral-100 dark:bg-neutral-800",
								"hover:bg-neutral-100 dark:hover:bg-neutral-800"
							)}
							onClick={() => toggleOption(option.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									toggleOption(option.value);
								}
							}}
							onMouseEnter={() => setHighlightedIndex(index)}
						>
							<input
								type="checkbox"
								checked={selectedValues.includes(option.value)}
								readOnly
								tabIndex={-1}
								className="mr-2 pointer-events-none"
							/>
							<span className="text-sm">{option.label}</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
};
