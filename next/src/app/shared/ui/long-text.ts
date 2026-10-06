/**
 * How long a value from a customer's file may be where it is written somewhere small.
 *
 * Owner, 2026-09-28: a ledger's notes column runs from 900 to 20,000 characters a row, and every
 * place that printed one whole -- a tooltip, a chart label, a statistic -- became as wide as the
 * note. These are the two lengths the console holds such a value to: a tooltip gets the first few
 * hundred characters and the rest is behind "Show all" (shared/ui/data-text.ts), and a chart label
 * gets a few words (shared/charts/short-label.ts).
 */

/** A tooltip holds this many characters of a value. Browsers draw a 20,000-character one screen-high. */
export const TITLE_MAX = 300;

/**
 * The first `max` characters of a value, with "…" when anything was cut.
 *
 * Counted in characters a person sees, not UTF-16 code units: slicing by `.length` can cut an
 * emoji or a non-Latin character in half and print a replacement glyph at the end of the label.
 * The fast path skips the split for the ordinary short value.
 */
export function clipText(text: string | null | undefined, max: number): string {
  const value = text ?? '';
  if (value.length <= max) return value;
  const characters = Array.from(value);
  if (characters.length <= max) return value;
  return characters.slice(0, max).join('').trimEnd() + '…';
}

/** A value made fit for a `title` attribute. A null is no tooltip at all, not the word "null". */
export function capTitle(text: string | null | undefined, max = TITLE_MAX): string {
  return clipText(text, max);
}
