import { lazy, Suspense } from "react";
import { Loader } from "@/components/loader/Loader";
import type { CytoscapeGraphProps } from "./CytoscapeGraph";

/**
 * Drop-in replacement for {@link CytoscapeGraph} that keeps `cytoscape`
 * (~400KB) out of the initial bundle.
 *
 * The graph is only ever rendered inside the graph modal / community view, so
 * the vast majority of sessions never need it. Splitting here rather than at
 * the modal boundary keeps the modal's lightweight chrome (controls, entity
 * detail panel) eager, so opening the modal is still instant — only the canvas
 * itself streams in.
 */
const CytoscapeGraph = lazy(() =>
	import("./CytoscapeGraph").then((m) => ({ default: m.CytoscapeGraph }))
);

function GraphLoadingFallback({ className }: { className?: string }) {
	return (
		<div
			className={`flex items-center justify-center ${className ?? ""}`}
			// Mirrors the height the graph itself will occupy so the surrounding
			// layout does not jump when the chunk resolves.
			style={{ minHeight: "100%" }}
		>
			<div className="flex flex-col items-center gap-2 text-neutral-600 dark:text-neutral-400">
				<Loader size={28} title="Loading graph…" />
				<span className="text-sm">Loading graph…</span>
			</div>
		</div>
	);
}

export function LazyCytoscapeGraph(props: CytoscapeGraphProps) {
	return (
		<Suspense fallback={<GraphLoadingFallback className={props.className} />}>
			<CytoscapeGraph {...props} />
		</Suspense>
	);
}
