// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatMessageList } from "@/components/chat/ChatMessageList";
import type { Message } from "@/types/ai-message";

// Markdown rendering is irrelevant here and pulls in a heavy parser.
vi.mock("@/components/MemoizedMarkdown", () => ({
	MemoizedMarkdown: ({ content }: { content: string }) => (
		<span>{content}</span>
	),
}));

const formatTime = (date: Date) => date.toISOString();

function message(
	id: string,
	role: string,
	text: string,
	data?: Record<string, unknown>
): Message {
	return { id, role, content: text, parts: [{ type: "text", text }], data };
}

const STOPPED_TEXT = /Stopped — this reply is incomplete/;

describe("ChatMessageList interrupted replies", () => {
	it("shows no stopped notice for a completed reply", () => {
		render(
			<ChatMessageList
				messages={[
					message("u1", "user", "hi"),
					message("a1", "assistant", "complete answer"),
				]}
				formatTime={formatTime}
			/>
		);

		expect(screen.queryByText(STOPPED_TEXT)).toBeNull();
	});

	it("marks an interrupted reply as incomplete", () => {
		render(
			<ChatMessageList
				messages={[
					message("u1", "user", "hi"),
					message("a1", "assistant", "partial", { interrupted: true }),
				]}
				formatTime={formatTime}
			/>
		);

		expect(screen.getByText(STOPPED_TEXT)).toBeInTheDocument();
		// Partial output is kept, not discarded.
		expect(screen.getByText("partial")).toBeInTheDocument();
	});

	it("offers Continue on the newest interrupted reply", () => {
		const onContinueGeneration = vi.fn();
		render(
			<ChatMessageList
				messages={[
					message("u1", "user", "hi"),
					message("a1", "assistant", "partial", { interrupted: true }),
				]}
				formatTime={formatTime}
				onContinueGeneration={onContinueGeneration}
			/>
		);

		fireEvent.click(screen.getByRole("button", { name: "Continue" }));
		expect(onContinueGeneration).toHaveBeenCalledTimes(1);
	});

	it("does not offer Continue on an older interrupted reply", () => {
		render(
			<ChatMessageList
				messages={[
					message("a1", "assistant", "partial", { interrupted: true }),
					message("u2", "user", "next question"),
					message("a2", "assistant", "complete answer"),
				]}
				formatTime={formatTime}
				onContinueGeneration={vi.fn()}
			/>
		);

		// The notice still explains the old reply was cut short...
		expect(screen.getByText(STOPPED_TEXT)).toBeInTheDocument();
		// ...but resuming it would append in the wrong place.
		expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
	});

	it("hides Continue while another turn is streaming", () => {
		render(
			<ChatMessageList
				messages={[
					message("u1", "user", "hi"),
					message("a1", "assistant", "partial", { interrupted: true }),
				]}
				formatTime={formatTime}
				onContinueGeneration={vi.fn()}
				isStreaming
			/>
		);

		expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
	});
});
