import {
	cloneElement,
	isValidElement,
	type ReactElement,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { Slot } from "@/components/slot/Slot";
import { cn } from "@/lib/utils";
import { useTooltip } from "@/providers/TooltipProvider";

type TriggerProps = {
	"aria-describedby"?: string;
	onBlur?: React.FocusEventHandler;
	onFocus?: React.FocusEventHandler;
	onMouseEnter?: React.MouseEventHandler;
	onMouseLeave?: React.MouseEventHandler;
	onPointerDown?: React.PointerEventHandler;
	onPointerUp?: React.PointerEventHandler;
};

type KnownTriggerChildProps = Partial<TriggerProps> & {
	as?: React.ElementType;
};

function readTriggerChildProps(child: ReactElement): KnownTriggerChildProps {
	return child.props as KnownTriggerChildProps;
}

function isInnerButtonTrigger(child: ReactElement): boolean {
	if (typeof child.type === "string" && child.type === "button") return true;
	if (child.type === Slot && readTriggerChildProps(child).as === "button")
		return true;
	if (
		typeof child.type === "function" &&
		(child.type as { name?: string }).name === "ButtonComponent"
	)
		return true;
	return false;
}

export type TooltipProps = {
	children: React.ReactNode;
	className?: string;
	content: string;
	contentClassName?: string;
	id?: number | string;
};

export const Tooltip = ({
	children,
	className,
	content,
	contentClassName,
	id,
}: TooltipProps) => {
	const { activeTooltip, showTooltip, hideTooltip } = useTooltip();
	const [positionX, setPositionX] = useState<"center" | "left" | "right">(
		"center"
	);
	const [positionY, setPositionY] = useState<"top" | "bottom">("top");
	const [isHoverAvailable, setIsHoverAvailable] = useState(false); // if hover state exists
	const [isPointer, setIsPointer] = useState(false); // if user is using a pointer device

	const tooltipRef = useRef<HTMLElement>(null);

	useEffect(() => {
		setIsHoverAvailable(window.matchMedia("(hover: hover)").matches); // check if hover state is available
	}, []);

	const tooltipIdentifier = id ? id + content : content;
	const tooltipId = `tooltip-${id || content.replace(/\s+/g, "-")}`; // used for ARIA

	const isVisible = activeTooltip === tooltipIdentifier;

	// detect collision once the tooltip is visible
	useLayoutEffect(() => {
		const detectCollision = () => {
			const ref = tooltipRef.current;

			if (ref) {
				const tooltipRect = ref.getBoundingClientRect();
				const { top, left, bottom, right } = tooltipRect;
				const viewportWidth = window.innerWidth;
				const viewportHeight = window.innerHeight;

				if (top <= 0) setPositionY("bottom");
				if (left <= 0) setPositionX("left");
				if (bottom >= viewportHeight) setPositionY("top");
				if (right >= viewportWidth) setPositionX("right");
			}
		};

		if (!isVisible) {
			setPositionX("center");
			setPositionY("top");
		} else {
			detectCollision();
		}
	}, [isVisible]);

	// Real <button> (or Slot as="button") must stay the single interactive node — never wrap in another <button>.
	if (isValidElement(children) && isInnerButtonTrigger(children)) {
		const prior = readTriggerChildProps(children);
		const triggerProps: TriggerProps = {
			"aria-describedby": isVisible ? tooltipId : undefined,
			onMouseEnter: (e) => {
				prior.onMouseEnter?.(e);
				if (isHoverAvailable) showTooltip(tooltipIdentifier, false);
			},
			onMouseLeave: (e) => {
				prior.onMouseLeave?.(e);
				hideTooltip();
			},
			onPointerDown: (e) => {
				prior.onPointerDown?.(e);
				if (e.pointerType === "mouse") setIsPointer(true);
			},
			onPointerUp: (e) => {
				prior.onPointerUp?.(e);
				setIsPointer(false);
			},
			onFocus: (e) => {
				prior.onFocus?.(e);
				if (isHoverAvailable) {
					isPointer
						? showTooltip(tooltipIdentifier, false)
						: showTooltip(tooltipIdentifier, true);
				} else {
					hideTooltip();
				}
			},
			onBlur: (e) => {
				prior.onBlur?.(e);
				hideTooltip();
			},
		};

		return (
			<span className={cn("relative inline-block", className)}>
				{cloneElement(children, triggerProps)}
				{isVisible && (
					<span
						aria-hidden={!isVisible}
						className={cn(
							"bg-neutral-800 dark:bg-neutral-700 text-white border border-neutral-600 dark:border-neutral-500 absolute w-max rounded-md px-3 py-2 text-xs shadow-lg z-[99999]",
							{
								"left-0 translate-x-0": positionX === "left",
								"right-0 translate-x-0": positionX === "right",
								"left-1/2 -translate-x-1/2": positionX === "center",
								"top-full mt-2": positionY === "bottom",
								"bottom-full mb-2": positionY === "top",
							},
							contentClassName
						)}
						id={tooltipId}
						ref={tooltipRef}
						role="tooltip"
					>
						{content}
					</span>
				)}
			</span>
		);
	}

	// Otherwise, render as a button for accessibility
	return (
		<button
			type="button"
			aria-describedby={isVisible ? tooltipId : undefined}
			className={cn("relative inline-block", className)}
			onMouseEnter={() =>
				isHoverAvailable && showTooltip(tooltipIdentifier, false)
			}
			onMouseLeave={() => hideTooltip()}
			onPointerDown={(e: React.PointerEvent) => {
				if (e.pointerType === "mouse") {
					setIsPointer(true);
				}
			}}
			onPointerUp={() => setIsPointer(false)}
			onFocus={() => {
				// only allow tooltips when hover state is available
				if (isHoverAvailable) {
					isPointer // if user clicks with a mouse, do not auto-populate tooltip
						? showTooltip(tooltipIdentifier, false)
						: showTooltip(tooltipIdentifier, true);
				} else {
					hideTooltip();
				}
			}}
			onBlur={() => hideTooltip()}
			tabIndex={0}
		>
			{children}
			{isVisible && (
				<span
					aria-hidden={!isVisible}
					className={cn(
						"bg-neutral-800 dark:bg-neutral-700 text-white border border-neutral-600 dark:border-neutral-500 absolute w-max rounded-md px-3 py-2 text-xs shadow-lg z-[99999]",
						{
							"left-0 translate-x-0": positionX === "left",
							"right-0 translate-x-0": positionX === "right",
							"left-1/2 -translate-x-1/2": positionX === "center",
							"top-full mt-2": positionY === "bottom",
							"bottom-full mb-2": positionY === "top",
						},
						contentClassName
					)}
					id={tooltipId}
					ref={tooltipRef}
					role="tooltip"
				>
					{content}
				</span>
			)}
		</button>
	);
};
