import { lazy, Suspense } from "react";

/**
 * Drop-in replacements for the audio surfaces that keep the Web Audio player and
 * its hook out of the initial bundle.
 *
 * Audio is reachable from two places a session may never open — a tab in the
 * campaign modal and a strip on an open runsheet — so most sessions should never
 * pay for this code. Splitting here rather than at the modal boundary keeps the
 * tab button itself eager, so the tab appears instantly and only its contents
 * stream in. Mirrors `LazyCytoscapeGraph`.
 */

const CampaignAudioPanel = lazy(() =>
	import("./CampaignAudioPanel").then((m) => ({
		default: m.CampaignAudioPanel,
	}))
);

const RunsheetAudioStrip = lazy(() =>
	import("./RunsheetAudioStrip").then((m) => ({
		default: m.RunsheetAudioStrip,
	}))
);

/**
 * Plain text rather than the shared `Loader`. Importing it here would pull the
 * spinner into the eagerly-loaded modal chunk, which is the exact cost this file
 * exists to avoid, and the chunk resolves too fast for a spinner to register.
 */
function AudioLoadingFallback() {
	return (
		<div className="p-4 text-sm text-neutral-600 dark:text-neutral-400">
			Loading audio…
		</div>
	);
}

export function LazyCampaignAudioPanel(props: { campaignId: string }) {
	return (
		<Suspense fallback={<AudioLoadingFallback />}>
			<CampaignAudioPanel {...props} />
		</Suspense>
	);
}

export function LazyRunsheetAudioStrip(props: { campaignId: string }) {
	return (
		<Suspense fallback={<AudioLoadingFallback />}>
			<RunsheetAudioStrip {...props} />
		</Suspense>
	);
}
