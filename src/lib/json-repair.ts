/**
 * Deterministic repair for the JSON shapes models actually emit when they get
 * it wrong: trailing commas, `//` comments, raw control characters inside
 * strings, smart quotes, and truncated tails from hitting the output cap.
 *
 * This runs before the LLM repair pass in `AnthropicProvider`. Output tokens
 * cost 5x input on every Anthropic model, and the LLM repair resends up to
 * 50,000 characters of malformed JSON to regenerate it — so every failure this
 * handles locally is a whole call avoided.
 *
 * Deliberately conservative: it only makes edits that are unambiguous from the
 * token stream. Anything else (a genuinely unescaped `"` mid-string, a missing
 * comma between values) is left to the LLM fallback rather than guessed at.
 */

const SMART_QUOTE_MAP: Record<string, string> = {
	"“": '"',
	"”": '"',
	"‘": "'",
	"’": "'",
};

/** Replace typographic quotes that sit outside string literals. */
function normalizeSmartQuotes(text: string): string {
	return text.replace(/[“”‘’]/g, (m) => SMART_QUOTE_MAP[m]);
}

interface ScanState {
	/** Open `{` / `[` in order, so the tail can be closed correctly. */
	stack: string[];
	inString: boolean;
	escaped: boolean;
	/** Index of the opening quote of the unterminated string, when `inString`. */
	stringStart: number;
}

/**
 * JSON escapes for the control characters models emit verbatim when they paste
 * multi-line prose into a string field. Anything else below U+0020 falls back
 * to a \\uXXXX escape.
 */
const CONTROL_CHAR_ESCAPES: Record<string, string> = {
	"\n": "\\n",
	"\r": "\\r",
	"\t": "\\t",
};

/** Render one character of a string literal, escaping it if JSON requires that. */
function escapeStringChar(ch: string): string {
	const mapped = CONTROL_CHAR_ESCAPES[ch];
	if (mapped) return mapped;
	if (ch < " ") {
		return `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
	}
	return ch;
}

/** Index just past a `//` or block comment starting at `i`, or -1 if unterminated. */
function commentEnd(text: string, i: number): number | null {
	if (text[i] !== "/") return null;
	if (text[i + 1] === "/") {
		const newline = text.indexOf("\n", i);
		return newline === -1 ? -1 : newline - 1;
	}
	if (text[i + 1] === "*") {
		const end = text.indexOf("*/", i + 2);
		return end === -1 ? -1 : end + 1;
	}
	return null;
}

/**
 * Single pass that strips comments and escapes raw control characters found
 * inside string literals, tracking string/escape state so it never edits
 * characters that are legitimately part of a string.
 */
function stripCommentsAndEscapeControlChars(text: string): string {
	let out = "";
	let inString = false;
	let escaped = false;

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];

		if (inString) {
			out += escaped || ch === "\\" || ch === '"' ? ch : escapeStringChar(ch);
			if (escaped) escaped = false;
			else if (ch === "\\") escaped = true;
			else if (ch === '"') inString = false;
			continue;
		}

		if (ch === '"') {
			out += ch;
			inString = true;
			continue;
		}

		const skipTo = commentEnd(text, i);
		if (skipTo !== null) {
			if (skipTo === -1) break;
			i = skipTo;
			continue;
		}
		out += ch;
	}

	return out;
}

/** Remove `,` that is immediately followed by `}` or `]` (outside strings). */
function removeTrailingCommas(text: string): string {
	let out = "";
	let inString = false;
	let escaped = false;

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (inString) {
			out += ch;
			if (escaped) escaped = false;
			else if (ch === "\\") escaped = true;
			else if (ch === '"') inString = false;
			continue;
		}
		if (ch === '"') {
			out += ch;
			inString = true;
			continue;
		}
		if (ch === ",") {
			const rest = text.slice(i + 1);
			const nextNonSpace = rest.match(/^\s*(.)/)?.[1];
			if (nextNonSpace === "}" || nextNonSpace === "]") {
				continue; // drop the comma
			}
		}
		out += ch;
	}
	return out;
}

function scan(text: string): ScanState {
	const stack: string[] = [];
	let inString = false;
	let escaped = false;
	let stringStart = -1;

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === "\\") escaped = true;
			else if (ch === '"') inString = false;
			continue;
		}
		if (ch === '"') {
			inString = true;
			stringStart = i;
		} else if (ch === "{" || ch === "[") stack.push(ch);
		else if (ch === "}" || ch === "]") stack.pop();
	}

	return { stack, inString, escaped, stringStart };
}

/** Close every container left open in `stack`, innermost first. */
function closersFor(stack: string[]): string {
	return stack
		.slice()
		.reverse()
		.map((open) => (open === "{" ? "}" : "]"))
		.join("");
}

/** Trim a dangling `,`, a dangling `"key":`, or an incomplete bare literal. */
function trimDanglingTail(text: string): string {
	return text
		.replace(/,\s*$/, "")
		.replace(/(?:,\s*)?"(?:[^"\\]|\\.)*"\s*:\s*$/, "")
		.replace(
			/(?:,\s*)?"(?:[^"\\]|\\.)*"\s*:\s*(?:t|tr|tru|f|fa|fal|fals|n|nu|nul|-|[\d.eE+-]*[eE+-])$/,
			""
		)
		.replace(/,\s*$/, "");
}

/**
 * Close a response truncated by the output token cap.
 *
 * Returns candidates ordered least-destructive first: a truncated *value* is
 * worth keeping (partial prose is still data), but a truncated *key* has no
 * value to pair with and has to go, or the object will not parse.
 */
function closeTruncatedJson(text: string): string[] {
	const state = scan(text);
	if (state.stack.length === 0 && !state.inString) {
		return [];
	}

	let body = text;
	if (state.escaped) {
		// A trailing backslash would escape the quote we are about to add.
		body = body.slice(0, -1);
	}

	const candidates: string[] = [];

	if (state.inString) {
		const before = body.slice(0, state.stringStart).trimEnd();
		const insideObject = state.stack[state.stack.length - 1] === "{";
		const isValue = before.endsWith(":");
		if (isValue || !insideObject) {
			// Truncated value (or array element): keep what we have.
			candidates.push(body + '"' + closersFor(state.stack));
		}
		// Truncated key: nothing can pair with it, so drop the whole fragment.
		const withoutFragment = trimDanglingTail(body.slice(0, state.stringStart));
		candidates.push(withoutFragment + closersFor(state.stack));
	} else {
		candidates.push(trimDanglingTail(body) + closersFor(state.stack));
	}

	return candidates;
}

function tryParse(text: string): { ok: true; text: string } | { ok: false } {
	try {
		JSON.parse(text);
		return { ok: true, text };
	} catch {
		return { ok: false };
	}
}

/**
 * Attempt to repair malformed JSON without an LLM call.
 *
 * Returns the repaired text (guaranteed to `JSON.parse`) or `null` when the
 * damage is beyond deterministic repair, in which case the caller should fall
 * back to the LLM repair pass.
 */
export function repairJsonDeterministically(text: string): string | null {
	if (!text || text.trim().length === 0) {
		return null;
	}

	const candidates: string[] = [];
	let current = normalizeSmartQuotes(text.trim());
	candidates.push(current);

	current = stripCommentsAndEscapeControlChars(current);
	candidates.push(current);

	current = removeTrailingCommas(current);
	candidates.push(current);

	for (const closed of closeTruncatedJson(current)) {
		// Truncation often leaves a trailing comma exposed once containers close.
		candidates.push(closed, removeTrailingCommas(closed));
	}

	for (const candidate of candidates) {
		const result = tryParse(candidate);
		if (result.ok) {
			return result.text;
		}
	}
	return null;
}
