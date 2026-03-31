import type { ButtonHTMLAttributes, ElementType, ReactNode } from "react";
import { Loader } from "@/components/loader/Loader";
import { Slot } from "@/components/slot/Slot";
import { Tooltip } from "@/components/tooltip/Tooltip";
import { cn } from "@/lib/utils";

type SolidVariant =
	| "primary"
	| "secondary"
	| "ghost"
	| "destructive"
	| "tertiary";
type FormVariant = "primary" | "secondary" | "destructive";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	as?: ElementType;
	children?: ReactNode;
	className?: string;
	/**
	 * `solid`: bordered / filled `.btn` styles (default).
	 * `form`: text-style actions (modal footers, inline form actions); supports `icon` + `loading` with children visible.
	 */
	appearance?: "solid" | "form";
	displayContent?: "items-first" | "items-last";
	external?: boolean;
	href?: string;
	loading?: boolean;
	shape?: "base" | "square" | "circular";
	size?: "sm" | "md" | "lg" | "base";
	title?: string | ReactNode;
	toggled?: boolean;
	tooltip?: string;
	variant?: SolidVariant | FormVariant;
	/** When `appearance="form"`, shown before children; replaced by the loader while `loading`. */
	icon?: ReactNode;
};

const formBaseClass =
	"inline-flex max-w-full shrink-0 items-center gap-2 rounded-md border-0 bg-transparent px-1.5 py-1 font-semibold text-sm shadow-none transition-colors select-none " +
	"disabled:cursor-not-allowed disabled:opacity-50 " +
	"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 " +
	"focus-visible:ring-offset-white dark:focus-visible:ring-neutral-500 dark:focus-visible:ring-offset-neutral-900";

const formVariantClass: Record<FormVariant, string> = {
	primary:
		"text-[color:var(--color-link)] hover:text-[color:var(--color-link-hover)]",
	secondary:
		"text-neutral-600 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300",
	destructive:
		"text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300",
};

function resolveFormVariant(variant: SolidVariant | FormVariant): FormVariant {
	if (variant === "destructive") return "destructive";
	if (variant === "secondary") return "secondary";
	return "primary";
}

const ButtonComponent = ({
	as,
	appearance = "solid",
	children,
	className,
	disabled,
	displayContent = "items-last",
	external,
	href,
	icon,
	loading,
	shape = "base",
	size = "base",
	title,
	toggled,
	tooltip: _tooltip,
	variant,
	...props
}: ButtonProps & { variant: SolidVariant | FormVariant }) => {
	if (appearance === "form") {
		const fv = resolveFormVariant(variant);
		return (
			<Slot
				as={as ?? "button"}
				className={cn(
					formBaseClass,
					"interactive w-max",
					formVariantClass[fv],
					className
				)}
				disabled={disabled || loading}
				href={href}
				rel={external ? "noopener noreferrer" : undefined}
				target={external ? "_blank" : undefined}
				{...props}
			>
				{loading ? (
					<span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
						<Loader size={16} title="Loading…" />
					</span>
				) : (
					icon && <span className="inline-flex shrink-0">{icon}</span>
				)}
				{children}
			</Slot>
		);
	}

	return (
		<Slot
			as={as ?? "button"}
			className={cn(
				"btn add-focus group interactive flex w-max shrink-0 items-center justify-center font-medium select-none",

				{
					"btn-primary": variant === "primary",
					"btn-secondary": variant === "secondary",
					"btn-tertiary": variant === "tertiary",
					"btn-ghost": variant === "ghost",
					"btn-destructive": variant === "destructive",

					"add-size-sm gap-1": size === "sm",
					"add-size-md gap-1.5": size === "md",
					"add-size-base gap-2": size === "base",

					square: shape === "square",
					circular: shape === "circular",

					"flex-row-reverse": displayContent === "items-first",

					"add-disable": disabled,

					toggle: toggled,
				},
				className
			)}
			disabled={disabled}
			href={href}
			rel={external ? "noopener noreferrer" : undefined}
			target={external ? "_blank" : undefined}
			{...props}
		>
			{title}

			{loading ? (
				<span
					className={cn("inline-flex shrink-0 items-center justify-center", {
						"h-3 w-3": size === "sm",
						"h-3.5 w-3.5": size === "md",
						"h-4 w-4": size === "base",
						"ease-bounce transition-[width] duration-300 starting:w-0":
							!children,
					})}
				>
					<Loader size={size === "sm" ? 12 : size === "md" ? 14 : 16} />
				</span>
			) : (
				children
			)}
		</Slot>
	);
};

export const Button = ({
	appearance = "solid",
	variant: variantProp,
	...props
}: ButtonProps) => {
	const variant =
		variantProp ?? (appearance === "form" ? "primary" : "secondary");
	const fullProps = {
		...props,
		appearance,
		variant,
	} as ButtonProps & { variant: SolidVariant | FormVariant };

	if (props.tooltip && props.disabled) {
		return (
			<Tooltip
				content={props.tooltip}
				className={props.className}
				id={props.id}
			>
				<span className="inline-flex">
					<ButtonComponent
						{...fullProps}
						className={props.className}
						style={{ pointerEvents: "none" }}
					/>
				</span>
			</Tooltip>
		);
	}

	return props.tooltip ? (
		<Tooltip content={props.tooltip} className={props.className} id={props.id}>
			<ButtonComponent {...fullProps} className={undefined} />
		</Tooltip>
	) : (
		<ButtonComponent {...fullProps} />
	);
};
