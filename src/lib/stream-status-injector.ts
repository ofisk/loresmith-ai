const SSE_LINE_END = "\n\n";

/**
 * Transform stream that injects SSE "status" chunks before tool-input-start events.
 * The client's createStatusInterceptingFetch extracts these for the thinking spinner
 * and filters them out before passing to the AI SDK parser.
 */
export function createStatusInjectingTransform(
	getStatusForTool: (toolName: string) => string
): TransformStream<Uint8Array, Uint8Array> {
	const encoder = new TextEncoder();
	let buffer = "";

	return new TransformStream({
		transform(chunk, controller) {
			buffer += new TextDecoder().decode(chunk);
			const events = buffer.split(SSE_LINE_END);
			buffer = events.pop() ?? "";

			for (const event of events) {
				const trimmed = event.trim();
				if (trimmed.length === 0) continue;

				const lines = trimmed.split("\n");
				for (const line of lines) {
					if (!line.trim().startsWith("data:")) continue;
					const payload = line.trim().slice(5).trim();
					if (payload === "[DONE]") continue;
					try {
						const parsed = JSON.parse(payload) as {
							type?: string;
							toolName?: string;
						};
						if (
							parsed?.type === "tool-input-start" &&
							typeof parsed.toolName === "string"
						) {
							const statusChunk = encoder.encode(
								`data: ${JSON.stringify({
									type: "status",
									message: getStatusForTool(parsed.toolName),
								})}${SSE_LINE_END}`
							);
							controller.enqueue(statusChunk);
							break;
						}
					} catch {
						// Not JSON or parse error, skip
					}
				}
				controller.enqueue(encoder.encode(trimmed + SSE_LINE_END));
			}
		},
		flush(controller) {
			if (buffer.length > 0) {
				controller.enqueue(encoder.encode(buffer));
			}
		},
	});
}
