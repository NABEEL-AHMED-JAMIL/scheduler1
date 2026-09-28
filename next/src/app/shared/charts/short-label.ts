import { clipText } from '../ui/long-text';

/**
 * The most characters a category label is drawn with. Enough for "North America — Retail" or a
 * customer id with a name; a paragraph becomes its first few words.
 */
export const LABEL_MAX = 28;

/**
 * A category written as a chart label: whitespace folded to single spaces, and cut to `max`
 * characters with "…" at the end when anything was cut.
 *
 * Owner, 2026-09-28: a chart over a ledger's notes column wrote each category whole, 3,000 to
 * 4,400px of text under every bar, and they piled on top of each other. Every chart here draws its
 * labels through this one function, so an axis, a legend and a ring's key shorten the same value
 * the same way; the whole value (capped, see ../ui/long-text) goes in the mark's hint. A caller
 * that measures a label to decide whether it fits -- the bar chart's thinning -- measures THIS
 * string, since it is the one that is drawn.
 */
export function shortLabel(text: string | null | undefined, max = LABEL_MAX): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max || Array.from(flat).length <= max) return flat;
  // The ellipsis takes one of the characters, so the label is never longer than `max`.
  return clipText(flat, max - 1);
}
