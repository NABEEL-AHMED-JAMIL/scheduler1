/**
 * Byte counts as people read them. Three copies of this existed -- two identical, one that
 * rounded differently and returned an em dash for zero -- so the same file could be listed
 * as "1.5 KB" in the browser and "2 KB" in the converter.
 *
 * Zero is a real size and prints as "0 B"; only a missing value gets the dash, because
 * "unknown" and "empty" are different things to a reader.
 */
export function formatSize(bytes?: number | null): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
