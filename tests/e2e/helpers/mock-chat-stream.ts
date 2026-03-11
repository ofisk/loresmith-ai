const TEXT_PART_ID = "text-1";

/**
 * Build a canned SSE stream body matching the AI SDK / base-agent format.
 * Use with page.route() to mock chat responses without hitting the real API.
 */
export function createMockChatStreamBody(text = "Hello from E2E mock"): string {
	const chunks = [
		{ type: "text-start", id: TEXT_PART_ID },
		{ type: "text-delta", id: TEXT_PART_ID, delta: text },
		{ type: "text-end", id: TEXT_PART_ID },
	];
	const lines = chunks
		.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
		.concat("data: [DONE]\n\n");
	return lines.join("");
}
