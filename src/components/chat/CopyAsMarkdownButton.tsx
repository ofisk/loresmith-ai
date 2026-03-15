import { Check, Copy } from "@phosphor-icons/react";
import { useCallback, useState } from "react";

const COPIED_DURATION_MS = 2000;

export function CopyAsMarkdownButton({ markdown }: { markdown: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(async () => {
		if (!markdown) return;
		try {
			await navigator.clipboard.writeText(markdown);
			setCopied(true);
			setTimeout(() => setCopied(false), COPIED_DURATION_MS);
		} catch {
			// No feedback on failure to avoid blocking UI
		}
	}, [markdown]);

	return (
		<button
			type="button"
			onClick={handleCopy}
			aria-label={copied ? "Copied" : "Copy as markdown"}
			title="Copy as markdown"
			className="absolute top-2 right-2 p-1.5 rounded-md text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/60 dark:hover:bg-neutral-700/60 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-neutral-100 dark:focus:ring-offset-neutral-900 transition-colors"
		>
			{copied ? (
				<Check size={18} weight="bold" aria-hidden />
			) : (
				<Copy size={18} weight="regular" aria-hidden />
			)}
		</button>
	);
}
