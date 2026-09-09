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
