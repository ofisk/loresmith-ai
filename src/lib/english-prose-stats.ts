/**
 * "Is this English prose?" — the one text-shape measure shared by the
 * deterministic pre-gates added under issue #761.
 *
 * Both pre-gates need it for the same reason, and it is the reason worth
 * spelling out: **the absence of a keyword only means something in a language
 * whose keywords we know.** A rule like "no character-sheet vocabulary, so not
 * a character sheet" is safe on an English document and wrong on a French one.
 * Requiring a minimum connective-word density before acting on an absence is
 * what closes that hole, so a non-English document falls through to the model
 * instead of being skipped.
 */

/**
 * Words common enough that any real English prose contains several. A run of
 * page numbers, a heading index, or text in another language contains almost
 * none.
 */
export const COMMON_WORDS = new Set([
	"the",
	"a",
	"an",
	"and",
	"or",
	"but",
	"if",
	"of",
	"to",
	"in",
	"on",
	"at",
	"for",
	"with",
	"from",
	"by",
	"as",
	"is",
	"are",
	"was",
	"were",
	"be",
	"been",
	"has",
	"have",
	"had",
	"can",
	"may",
	"will",
	"would",
	"this",
	"that",
	"they",
	"their",
	"you",
	"your",
	"it",
	"its",
	"not",
	"when",
	"which",
	"who",
	"all",
	"any",
	"each",
	"more",
	"than",
	"then",
	"into",
	"out",
	"up",
	"do",
	"does",
]);

/** Lowercased alphabetic words. Apostrophes are kept so "it's" stays one token. */
export function tokenizeWords(text: string): string[] {
	return text.toLowerCase().match(/[a-z']+/g) ?? [];
}

/** Share of words drawn from {@link COMMON_WORDS}. 0 for text with no words. */
export function commonWordRatio(words: string[]): number {
	if (words.length === 0) {
		return 0;
	}
	return words.filter((w) => COMMON_WORDS.has(w)).length / words.length;
}
