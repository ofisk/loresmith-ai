import { Loader } from "@/components/loader/Loader";

type ThinkingSpinnerProps = {
	className?: string;
	size?: number;
	showText?: boolean;
	/** Live status from the agent (e.g. "Searching campaign..."); when omitted, shows a neutral loading message */
	status?: string | null;
};

const DEFAULT_LOADING = {
	primary: "Preparing your response...",
	secondary: "This may take a moment...",
};

export const ThinkingSpinner = ({
	className = "",
	size = 20,
	showText = true,
	status,
}: ThinkingSpinnerProps) => {
	const primaryText =
		status && status.trim().length > 0 ? status : DEFAULT_LOADING.primary;
	const secondaryText =
		status && status.trim().length > 0
			? "This may take a moment..."
			: DEFAULT_LOADING.secondary;

	return (
		<div className={`flex items-center gap-3 p-3 ${className}`}>
			<div className="flex items-center gap-2">
				<Loader size={size} className="text-orange-500" />
				{showText && (
					<div className="flex flex-col">
						<span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
							{primaryText}
						</span>
						<span className="text-xs text-neutral-500 dark:text-neutral-400">
							{secondaryText}
						</span>
					</div>
				)}
			</div>
			<div className="flex gap-1">
				<div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
				<div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
				<div className="w-2 h-2 bg-orange-600 rounded-full animate-bounce"></div>
			</div>
		</div>
	);
};
