// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExplainabilitySection } from "@/components/chat/ExplainabilitySection";
import { APP_EVENT_TYPE } from "@/lib/app-events";
import type { Explainability } from "@/types/explainability";

const makeRequest = vi.fn(async () => ({ ok: true }));

vi.mock("@/hooks/useAuthenticatedRequest", () => ({
	useAuthenticatedRequest: () => ({
		makeRequest,
		makeRequestWithData: vi.fn(),
	}),
}));

function grounded(overrides: Partial<Explainability> = {}): Explainability {
	return {
		rationale: "Based on 1 entity from your campaign.",
		grounding: "grounded",
		topScore: 0.82,
		totalSourceCount: 1,
		queryId: "q-1",
		contextSources: [
			{
				type: "entity",
				source: "entity_graph",
				id: "e1",
				title: "Mara Quill",
				entityType: "npc",
				score: 0.82,
				scoreIsSemantic: true,
				snippet: "A retired smuggler running the dock tavern.",
			},
		],
		...overrides,
	};
}

describe("ExplainabilitySection", () => {
	beforeEach(() => {
		makeRequest.mockClear();
	});

	it("summarizes sources without expanding", () => {
		render(<ExplainabilitySection explainability={grounded()} />);
		expect(screen.getByText("Sources")).toBeInTheDocument();
		expect(screen.getByText("1 source")).toBeInTheDocument();
		// Snippets stay behind the disclosure.
		expect(screen.queryByText(/retired smuggler/)).toBeNull();
	});

	it("reveals snippets and relevance when expanded", () => {
		render(<ExplainabilitySection explainability={grounded()} />);
		fireEvent.click(screen.getByRole("button", { name: /Sources/ }));

		expect(screen.getByText(/retired smuggler/)).toBeInTheDocument();
		expect(screen.getByText("Mara Quill")).toBeInTheDocument();
		expect(screen.getByText("82%")).toBeInTheDocument();
	});

	it("hides relevance for placeholder scores", () => {
		render(
			<ExplainabilitySection
				explainability={grounded({
					contextSources: [
						{
							type: "entity",
							source: "graph_traversal",
							id: "e2",
							title: "Corvin",
							score: 0.6,
							scoreIsSemantic: false,
							traversalDepth: 1,
						},
					],
				})}
			/>
		);
		fireEvent.click(screen.getByRole("button", { name: /Sources/ }));

		expect(screen.queryByText("60%")).toBeNull();
		expect(screen.getByText("1 hop away")).toBeInTheDocument();
	});

	it("states plainly when an answer used no campaign context", () => {
		render(
			<ExplainabilitySection
				explainability={{
					rationale:
						"No matching campaign context was found, so this answer is not grounded in your materials.",
					grounding: "ungrounded",
					contextSources: [],
					totalSourceCount: 0,
				}}
			/>
		);
		expect(
			screen.getByText(/isn’t grounded in your materials/)
		).toBeInTheDocument();
		// Nothing to expand, so no disclosure is offered.
		expect(screen.queryByRole("button", { name: /Sources/ })).toBeNull();
	});

	it("renders a session date as the calendar date, not shifted by timezone", () => {
		render(
			<ExplainabilitySection
				explainability={grounded({
					contextSources: [
						{
							type: "planning_context",
							source: "session_digest",
							id: "d1",
							sessionNumber: 7,
							sessionDate: "2026-05-14",
							sectionType: "key_events",
						},
					],
				})}
			/>
		);
		fireEvent.click(screen.getByRole("button", { name: /Sources/ }));
		expect(screen.getByText(/May 14, 2026/)).toBeInTheDocument();
	});

	it("flags a weak match rather than presenting it as grounded", () => {
		render(
			<ExplainabilitySection
				explainability={grounded({ grounding: "weak", topScore: 0.31 })}
			/>
		);
		expect(screen.getByText(/Weak match/)).toBeInTheDocument();
	});

	it("opens the cited entity when its row is clicked", () => {
		const listener = vi.fn();
		window.addEventListener(APP_EVENT_TYPE.OPEN_SOURCE_ENTITY, listener);

		render(
			<ExplainabilitySection explainability={grounded()} campaignId="camp-1" />
		);
		fireEvent.click(screen.getByRole("button", { name: /Sources/ }));
		fireEvent.click(screen.getByRole("button", { name: /Mara Quill/ }));

		expect(listener).toHaveBeenCalledTimes(1);
		const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
		expect(detail).toMatchObject({ campaignId: "camp-1", entityId: "e1" });

		window.removeEventListener(APP_EVENT_TYPE.OPEN_SOURCE_ENTITY, listener);
	});

	it("opens the cited file when its row is clicked", () => {
		const listener = vi.fn();
		window.addEventListener(APP_EVENT_TYPE.OPEN_SOURCE_RESOURCE, listener);

		render(
			<ExplainabilitySection
				explainability={grounded({
					contextSources: [
						{
							type: "file_content",
							source: "original_file",
							id: "f1",
							fileKey: "f1",
							title: "Dungeon Guide.pdf",
							chunkIndex: 3,
						},
					],
				})}
				campaignId="camp-1"
			/>
		);
		fireEvent.click(screen.getByRole("button", { name: /Sources/ }));
		expect(screen.getByText("Section 4")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: /Dungeon Guide/ }));

		const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
		expect(detail).toMatchObject({ fileKey: "f1" });

		window.removeEventListener(APP_EVENT_TYPE.OPEN_SOURCE_RESOURCE, listener);
	});

	it("records a context-accuracy rating against the query id", async () => {
		render(
			<ExplainabilitySection explainability={grounded()} campaignId="camp-1" />
		);
		fireEvent.click(screen.getByRole("button", { name: /Sources/ }));
		fireEvent.click(
			screen.getByRole("button", { name: "Context was off target" })
		);

		expect(makeRequest).toHaveBeenCalledTimes(1);
		const [, init] = makeRequest.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(JSON.parse(init.body as string)).toEqual({
			campaignId: "camp-1",
			queryId: "q-1",
			accuracy: 0,
		});
	});

	it("omits the rating control when there is nothing to attribute it to", () => {
		render(
			<ExplainabilitySection
				explainability={grounded({ queryId: undefined })}
				campaignId="camp-1"
			/>
		);
		fireEvent.click(screen.getByRole("button", { name: /Sources/ }));
		expect(screen.queryByText(/Did it pull the right context/)).toBeNull();
	});
});
