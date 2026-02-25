const SSE_LINE_END = "\n\n";

/**
 * Parse a single SSE data line (e.g. "data: {...}").
 * Returns the parsed object or null if not a status chunk.
 */
function parseSSEDataLine(
	line: string
): { type: string; message?: string } | null {
	const trimmed = line.trim();
	if (!trimmed.startsWith("data:")) return null;
	const payload = trimmed.slice(5).trim();
	if (payload === "[DONE]") return null;
	try {
		const parsed = JSON.parse(payload) as {
			type?: string;
			message?: string;
		};
		return parsed && typeof parsed.type === "string"
			? ({ type: parsed.type, message: parsed.message } as {
					type: string;
					message?: string;
				})
			: null;
	} catch {
		return null;
	}
}

/**
 * Transform stream that intercepts SSE "status" chunks, calls onStatus,
 * and omits them from the output so the AI SDK only receives standard chunks.
 */
function createStatusFilteringTransform(
	onStatus: (message: string) => void
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
				const lines = event.split("\n");
				let isStatus = false;
				for (const line of lines) {
					const parsed = parseSSEDataLine(line);
					if (parsed?.type === "status" && typeof parsed.message === "string") {
						onStatus(parsed.message);
						isStatus = true;
						break;
					}
				}
				if (!isStatus) {
					controller.enqueue(encoder.encode(trimmed + SSE_LINE_END));
				}
			}
		},
		flush(controller) {
			if (buffer.length > 0) {
				controller.enqueue(encoder.encode(buffer));
			}
		},
	});
}

/**
 * Create a fetch wrapper that intercepts SSE status chunks from the response
 * and calls onStatus for each, while forwarding the transformed stream to the caller.
 */
export function createStatusInterceptingFetch(
	originalFetch: typeof fetch,
	onStatus: (message: string) => void
): typeof fetch {
	return async (
		input: RequestInfo | URL,
		init?: RequestInit
	): Promise<Response> => {
		const response = await originalFetch(input, init);
		const contentType = response.headers.get("content-type") ?? "";
		if (!contentType.includes("text/event-stream") || !response.body) {
			return response;
		}
		const transformed = response.body.pipeThrough(
			createStatusFilteringTransform(onStatus)
		);
		return new Response(transformed, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
		});
	};
}
