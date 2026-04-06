import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EventHandler } from "react-joyride";

const TOUR_STEPS_COUNT = 12;
const TOUR_STORAGE_KEYS = {
	completed: "loresmith-tour-completed",
	step: "loresmith-tour-step",
} as const;

export interface TourStep {
	target: string;
	content: ReactNode;
	placement?: "center" | "top" | "bottom" | "left" | "right";
	skipBeacon?: boolean;
	locale?: { next?: string };
}

export interface UseTourStateOptions {
	authState: { isAuthenticated: boolean; getStoredJwt: () => string | null };
}

export function useTourState(options: UseTourStateOptions) {
	const { authState } = options;

	const [runTour, setRunTour] = useState(false);
	const [stepIndex, setStepIndex] = useState(0);

	const tourCompleted =
		typeof window !== "undefined" &&
		localStorage.getItem(TOUR_STORAGE_KEYS.completed) === "true";

	const handleJoyrideCallback = useCallback<EventHandler>((data, _controls) => {
		const {
			action = "",
			index = 0,
			status = "",
			type = "",
			lifecycle = "",
		} = data;

		if (type === "step:after" || type === "step:before") {
			localStorage.setItem(TOUR_STORAGE_KEYS.step, String(index));
		}

		if (
			action === "close" ||
			action === "skip" ||
			status === "finished" ||
			status === "skipped"
		) {
			setRunTour(false);
			localStorage.setItem(TOUR_STORAGE_KEYS.completed, "true");
			localStorage.removeItem(TOUR_STORAGE_KEYS.step);
			return;
		}

		if (lifecycle === "tooltip" && type === "error:target_not_found") {
			if (index + 1 >= TOUR_STEPS_COUNT) {
				setRunTour(false);
				localStorage.setItem(TOUR_STORAGE_KEYS.completed, "true");
			} else {
				setStepIndex(index + 1);
			}
			return;
		}

		if (type === "step:after") {
			setStepIndex(index + (action === "prev" ? -1 : 1));
		}
	}, []);

	const runTourRef = useRef(runTour);
	useEffect(() => {
		runTourRef.current = runTour;
	}, [runTour]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (!runTourRef.current) return;

			if (e.key === "ArrowRight") {
				e.preventDefault();
				const nextButton = document.querySelector(
					'[data-action="primary"]'
				) as HTMLButtonElement;
				if (nextButton) nextButton.click();
			} else if (e.key === "ArrowLeft") {
				e.preventDefault();
				const backButton = document.querySelector(
					'[data-action="back"]'
				) as HTMLButtonElement;
				if (backButton) backButton.click();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	useEffect(() => {
		if (authState.isAuthenticated && !tourCompleted) {
			const savedStep = localStorage.getItem(TOUR_STORAGE_KEYS.step);
			const resumeStep = savedStep ? parseInt(savedStep, 10) : 0;

			const timer = setTimeout(() => {
				setStepIndex(resumeStep);
				setRunTour(true);
			}, 300);
			return () => clearTimeout(timer);
		}
	}, [authState.isAuthenticated, tourCompleted]);

	useEffect(() => {
		(window as Window & { startTour?: () => void }).startTour = () => {
			localStorage.removeItem(TOUR_STORAGE_KEYS.completed);
			localStorage.removeItem(TOUR_STORAGE_KEYS.step);
			setStepIndex(0);
			setRunTour(true);
		};
	}, []);

	const steps = useMemo(
		(): Array<TourStep> => [
			{
				target: "body",
				content:
					"Welcome to LoreSmith. This short tour will show you how to forge, explore, and refine your lore.",
				placement: "center",
				skipBeacon: true,
				locale: { next: "Start tour" },
			},
			{
				target: ".tour-user-menu",
				content:
					"Your account menu: switch accounts or update your API key from here.",
				locale: { next: "Next" },
			},
			{
				target: ".tour-sidebar",
				content: "Sidebar: this contains your campaigns and resource library.",
				placement: "right",
			},
			{
				target: ".tour-campaigns-section",
				content:
					"Campaigns: your campaigns live here. Each campaign is a persistent game world, tracking lore, documents, and state over time.",
			},
			{
				target: ".tour-library-section",
				content: (
					<>
						<p>
							Resource library: source materials you link to a campaign (notes,
							documents, references).
						</p>
						<br />
						<p>
							LoreSmith extracts shards from them (discrete pieces of lore like
							characters, places, and items), which you'll review before they're
							added to your campaign.
						</p>
					</>
				),
			},
			{
				target: ".tour-shard-review",
				content: (
					<div>
						<p>
							After linking a resource to a campaign, you'll review and approve
							shards here before they're added to your campaign.
						</p>
						<p className="mt-3 font-bold">What are shards?</p>
						<p className="mt-2">
							Shards are fragments of lore you approve into your campaign.
							LoreSmith links related shards so it can internalize your world
							and help you plan and grow your campaign more accurately.
						</p>
					</div>
				),
			},
			{
				target: ".chat-input-area",
				content: "Chat: where you and LoreSmith shape your tale.",
				placement: "left",
			},
			{
				target: ".tour-campaign-selector",
				content: (
					<>
						<p>
							Campaign selector: this sets which campaign you're working on.
						</p>
						<br />
						<p>
							LoreSmith uses it to choose which resources, sessions, and world
							state to use in replies.
						</p>
					</>
				),
			},
			{
				target: ".tour-session-recap",
				content: (
					<>
						<p>Session recap: record what happened in a session.</p>
						<br />
						<p>
							LoreSmith turns your notes into a digest and updates your campaign
							world state.
						</p>
					</>
				),
			},
			{
				target: ".tour-next-steps",
				content:
					"Next steps: this prompts LoreSmith to provide an assessment of your campaign and prioritized suggestions for what to do next.",
			},
			{
				target: ".tour-help-button",
				content:
					"Help: starts a chat with LoreSmith about app functionality—what it can help with, example questions you can ask, and best practices based on the docs.",
			},
			{
				target: ".tour-admin-dashboard",
				content: "Admin dashboard: shows telemetry and system metrics.",
			},
			{
				target: ".tour-notifications",
				content:
					"Notifications: shows real-time updates (e.g. when shards are ready to review) on file processing and other campaign activity.",
				skipBeacon: true,
			},
		],
		[]
	);

	return {
		runTour,
		stepIndex,
		handleJoyrideCallback,
		steps,
	};
}
