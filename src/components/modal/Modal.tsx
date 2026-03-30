import { X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/card/Card";
import useClickOutside from "@/hooks/useClickOutside";
import { useDismissibleLayer } from "@/hooks/useDismissibleLayer";
import { cn } from "@/lib/utils";

export type ModalOptions = {
	/** Close modal when clicking outside */
	clickOutsideToClose?: boolean;
	/** Show X button in top-right */
	showCloseButton?: boolean;
	/** Allow Escape key to close */
	allowEscape?: boolean;
	/** Use animated gradient/particle background */
	animatedBackground?: boolean;
	/** Use full-screen layout on mobile */
	fullScreenOnMobile?: boolean;
};

const DEFAULT_OPTIONS: Required<ModalOptions> = {
	clickOutsideToClose: false,
	showCloseButton: true,
	allowEscape: true,
	animatedBackground: false,
	fullScreenOnMobile: false,
};

type ModalProps = {
	className?: string;
	children: React.ReactNode;
	isOpen: boolean;
	onClose: () => void;
	cardStyle?: React.CSSProperties;
	/** Modal behavior options; defaults applied for omitted values */
	options?: ModalOptions;
	/** ID of element that labels the dialog (e.g. modal heading) */
	ariaLabelledBy?: string;
	/** ID of element that describes the dialog */
	ariaDescribedBy?: string;
};

// Generate random particles
const generateRandomParticles = (
	count: number,
	sizeRange: [number, number],
	opacityRange: [number, number]
) => {
	return Array.from({ length: count }, (_, i) => {
		const size = Math.random() * (sizeRange[1] - sizeRange[0]) + sizeRange[0];
		const opacity =
			Math.random() * (opacityRange[1] - opacityRange[0]) + opacityRange[0];
		const top = Math.random() * 100;
		const left = Math.random() * 100;
		const animationDelay = Math.random() * 5; // Random delay up to 5 seconds

		return {
			id: i,
			size: Math.round(size),
			opacity: Math.round(opacity * 100) / 100,
			top: Math.round(top * 100) / 100,
			left: Math.round(left * 100) / 100,
			animationDelay,
		};
	});
};

export const Modal = ({
	className,
	children,
	isOpen,
	onClose,
	cardStyle,
	options: optionsProp,
	ariaLabelledBy,
	ariaDescribedBy,
}: ModalProps) => {
	const options = { ...DEFAULT_OPTIONS, ...optionsProp };
	const {
		clickOutsideToClose,
		showCloseButton,
		allowEscape,
		animatedBackground,
		fullScreenOnMobile,
	} = options;

	const clickOutsideRef = useClickOutside(onClose);
	const defaultRef = useRef<HTMLDivElement>(null);
	const modalRef = clickOutsideToClose ? clickOutsideRef : defaultRef;

	// Generate random particles when modal opens
	const [particles, setParticles] = useState(() => ({
		large: generateRandomParticles(8, [8, 16], [0.25, 0.4]),
		medium: generateRandomParticles(20, [5, 7], [0.4, 0.6]),
		small: generateRandomParticles(40, [2, 3], [0.5, 0.9]),
	}));

	// Regenerate particles when modal opens
	useEffect(() => {
		if (isOpen && animatedBackground) {
			setParticles({
				large: generateRandomParticles(8, [8, 16], [0.25, 0.4]),
				medium: generateRandomParticles(20, [5, 7], [0.4, 0.6]),
				small: generateRandomParticles(40, [2, 3], [0.5, 0.9]),
			});
		}
	}, [isOpen, animatedBackground]);

	// Stop site overflow when modal is open
	useEffect(() => {
		if (isOpen) {
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = "";
		}

		return () => {
			document.body.style.overflow = "";
		};
	}, [isOpen]);

	useDismissibleLayer({
		open: isOpen,
		onClose,
		enabled: allowEscape,
	});

	// Tab focus
	// biome-ignore lint/correctness/useExhaustiveDependencies: modalRef.current is intentionally excluded - ref identity is stable, including it would not help and can cause unnecessary effect runs
	useEffect(() => {
		if (!isOpen || !modalRef.current) return;

		const modalElement = modalRef.current;
		const focusableElements = modalElement.querySelectorAll(
			'a, button, input, textarea, select, details, [tabindex]:not([tabindex="-1"])'
		) as NodeListOf<HTMLElement>;

		const firstElement = focusableElements[0];
		const lastElement = focusableElements[focusableElements.length - 1];

		// Only focus the first element when modal initially opens
		// Don't refocus if user is already interacting with an input
		const activeElement = document.activeElement as HTMLElement;
		const isInputActive =
			activeElement &&
			(activeElement.tagName === "INPUT" ||
				activeElement.tagName === "TEXTAREA" ||
				activeElement.isContentEditable);

		if (firstElement && !isInputActive) {
			firstElement.focus();
		}

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Tab") {
				if (e.shiftKey) {
					// Shift + Tab moves focus backward
					if (document.activeElement === firstElement) {
						e.preventDefault();
						lastElement.focus();
					}
				} else {
					// Tab moves focus forward
					if (document.activeElement === lastElement) {
						e.preventDefault();
						firstElement.focus();
					}
				}
			}
		};

		// Capture phase so Tab trapping still runs when the dialog wrapper uses
		// onKeyDown stopPropagation (same issue as Escape + useDismissibleLayer).
		document.addEventListener("keydown", handleKeyDown, { capture: true });
		return () => {
			document.removeEventListener("keydown", handleKeyDown, { capture: true });
		};
	}, [isOpen]);

	if (!isOpen) return null;

	return (
		<div
			className={cn(
				"fixed top-0 left-0 flex h-dvh w-full justify-center bg-transparent overflow-y-auto overscroll-behavior-contain",
				"[z-index:var(--z-modal)]",
				fullScreenOnMobile
					? "items-stretch md:items-center p-0 md:p-6"
					: "items-start md:items-center p-2 md:p-6"
			)}
		>
			{/* Modal overlay - clickable background */}
			{animatedBackground ? (
				<div
					className="absolute inset-0 overflow-hidden"
					onClick={onClose}
					aria-hidden="true"
				>
					{/* Base dark background */}
					<div className="absolute inset-0 bg-black" />

					{/* Animated gradient overlay */}
					<div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-black to-purple-800/20 animate-pulse motion-reduce:animate-none" />

					{/* Floating particles */}
					<div className="absolute inset-0">
						{/* Large floating orbs - randomly positioned */}
						{particles.large.map((particle) => (
							<div
								key={`large-${particle.id}`}
								className="absolute rounded-full bg-purple-500/30 blur-lg animate-float-slow motion-reduce:animate-none"
								style={{
									width: `${particle.size}px`,
									height: `${particle.size}px`,
									top: `${particle.top}%`,
									left: `${particle.left}%`,
									opacity: particle.opacity,
									animationDelay: `${particle.animationDelay}s`,
								}}
							/>
						))}

						{/* Medium particles - randomly positioned */}
						{particles.medium.map((particle) => (
							<div
								key={`medium-${particle.id}`}
								className="absolute rounded-full bg-purple-400/60 blur-sm animate-float-medium motion-reduce:animate-none"
								style={{
									width: `${particle.size}px`,
									height: `${particle.size}px`,
									top: `${particle.top}%`,
									left: `${particle.left}%`,
									opacity: particle.opacity,
									animationDelay: `${particle.animationDelay}s`,
								}}
							/>
						))}

						{/* Small sparkles - randomly positioned */}
						{particles.small.map((particle) => (
							<div
								key={`small-${particle.id}`}
								className="absolute rounded-full bg-purple-300/70 animate-twinkle motion-reduce:animate-none"
								style={{
									width: `${particle.size}px`,
									height: `${particle.size}px`,
									top: `${particle.top}%`,
									left: `${particle.left}%`,
									opacity: particle.opacity,
									animationDelay: `${particle.animationDelay}s`,
								}}
							/>
						))}
					</div>

					{/* Subtle wave pattern */}
					<div className="absolute inset-0 opacity-10">
						<div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-purple-500/20 to-transparent animate-wave motion-reduce:animate-none" />
					</div>
				</div>
			) : (
				<div
					className="absolute inset-0 bg-black/70"
					onClick={onClose}
					aria-hidden="true"
				/>
			)}

			{/* Modal content container */}
			<div
				className={cn(
					"relative z-10 bg-white dark:bg-neutral-900 shadow-lg overflow-y-auto overscroll-behavior-contain",
					fullScreenOnMobile
						? "w-full h-dvh max-h-dvh rounded-none md:w-auto md:h-auto md:max-h-[var(--height-modal-max-desktop)] md:rounded-lg"
						: "rounded-lg max-h-[var(--height-modal-max)] md:max-h-[var(--height-modal-max-desktop)]"
				)}
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby={ariaLabelledBy}
				aria-describedby={ariaDescribedBy}
				tabIndex={-1}
			>
				<Card
					className={cn(
						"relative z-50 animate-modal-enter motion-reduce:animate-none",
						className
					)}
					style={cardStyle}
					ref={modalRef}
					tabIndex={-1}
				>
					{children}

					{showCloseButton && (
						<button
							type="button"
							aria-label="Close modal"
							className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-600 dark:text-neutral-300 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-900"
							onClick={onClose}
						>
							<X size={18} aria-hidden />
						</button>
					)}
				</Card>
			</div>
		</div>
	);
};
