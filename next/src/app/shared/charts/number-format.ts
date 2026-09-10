/**
 * Numbers written for a place where there is no room for all the digits.
 *
 * Deliberately NOT used for table cells or KPI tiles. A run count in a table is something a
 * reader may reconcile against another screen, and "1.5K" cannot be reconciled against 1,535 --
 * compaction there trades away the one thing the number is for. It earns its place on chart
 * axes and on bar labels, where the alternative is not a longer number but no number at all.
 *
 * One decimal, and only when it says something: 1.2K, but 12K rather than 12.0K, because the
 * tenth of a thousand is noise once the leading digits carry the magnitude.
 */
export function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  const size = Math.abs(value);
  if (size < 1000) return sign + String(Math.round(size));

  const units: [number, string][] = [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [scale, suffix] of units) {
    if (size < scale) continue;
    const scaled = size / scale;
    // A tenth is worth showing below 10 and noise above it: 1.2K, 25K, 999K.
    const text = scaled < 10 ? scaled.toFixed(1).replace(/\.0$/, '') : String(Math.round(scaled));
    return sign + text + suffix;
  }
  return sign + String(Math.round(size));
}

/**
 * A figure from a result cell, shown the way a person reads a figure.
 *
 * <b>Why this exists.</b> Result cells arrive as strings, straight off the wire, and were rendered
 * verbatim. A revenue tile therefore read "103909527.57999787" -- seventeen significant figures of
 * which the last eight are an artefact of DuckDB's CSV reader typing money as DOUBLE. That is
 * unreadable, and it is unreadable in the one place a reader most needs to read: the headline
 * number on an executive report.
 *
 * <b>What it does not do.</b> It does not round anything away. The caller pairs it with the raw
 * string as a title, so the exact value is one hover from anybody who wants it -- which matters
 * because this module's whole discipline is that a screen must never quietly improve on its data.
 * Twelve decimal places of float noise is not precision, but it IS what the engine said, and a
 * reader checking a total against another system needs the unrounded figure to be reachable.
 *
 * <b>The rules, and why each.</b>
 *
 *   not a number        passed through untouched. Dimensions, dates and labels are cells too, and
 *                       "2024-03" must not become 2,024.
 *   an integer          grouped. 250000 is a number people miscount; 250,000 is not.
 *   two places or fewer kept exactly. Money that was written as 47.33 stays 47.33.
 *   more than two       shown to two, because a value carrying more than two decimal places in
 *                       this module is either a ratio -- where two is plenty on a tile -- or float
 *                       noise, where the extra places are actively misleading.
 *   very small          the exception: below 0.01 a two-place rounding would render every distinct
 *                       value as "0.00", so four places are kept. A rate of 0.0031 is a fact.
 */
export function readableCell(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;

  // Number() accepts "", " ", "Infinity" and hex; a result cell that is a figure is none of those.
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return value;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return value;

  // Branch on the value AS WRITTEN, not on the parsed number. Number.isInteger(0.00) is true, so
  // testing the number turned "0.00" into "0" and would have turned a round money value like
  // "47.00" into "47" -- dropping the cents from exactly the column that needs them.
  const decimals = (trimmed.split('.')[1] ?? '').length;
  if (decimals === 0) return parsed.toLocaleString();

  const size = Math.abs(parsed);
  if (size > 0 && size < 0.01) {
    return parsed.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  }

  if (decimals <= 2) {
    return parsed.toLocaleString(undefined,
      { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  return parsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
