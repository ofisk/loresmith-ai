/**
 * Guards against sending empty text content blocks to the LLM provider.
 *
 * Anthropic rejects any request containing a zero-length (or whitespace-only)
 * text block with `400 messages: text content blocks must be non-empty`. The
 * AI SDK renders a message whose `content` is a string as exactly one text
 * block, so a single message with `content: ""` fails the whole call.
 *
 * That failure is not transient. The client replays the entire conversation on
 * every turn, so one empty message makes every subsequent prompt in that
 * conversation fail forever — the chat simply stops responding.
 *
 * Empty messages are normal and expected in the incoming payload: an assistant
 * turn that only made tool calls, or one interrupted mid-stream before any text
 * arrived, has no text part to flatten. Those carry nothing this string-based
 * pipeline can use, so they are dropped rather than repaired.
 */

/** Minimal shape needed to decide whether a message can be sent. */
export interface SanitizableMessage {
	role: string;
	content?: unknown;
}

/**
 * True when the message would produce a non-empty text block.
 *
 * Whitespace-only content is treated as empty: the provider trims text blocks
 * before validating them, so `" "` fails the same way `""` does.
 */
export function hasSendableContent(message: SanitizableMessage): boolean {
	const { content } = message;
	if (typeof content === "string") {
		return content.trim().length > 0;
	}
	// Non-string content (structured blocks) is passed through untouched — this
	// guard only knows how to reason about the flattened string form.
	return content != null;
}

/**
 * Drop messages that would serialize to an empty text block.
 *
 * Dropping can leave two same-role messages adjacent (e.g. a tool-only
 * assistant turn removed from between two user turns). That is safe: the
 * Anthropic provider merges consecutive same-role messages into one message
 * with multiple content blocks.
 */
export function dropEmptyContentMessages<T extends SanitizableMessage>(
	messages: T[]
): T[] {
	return messages.filter(hasSendableContent);
}
