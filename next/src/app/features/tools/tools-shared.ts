/** Helpers both tools share (Document Converter, Audio Transcript). */

/** Saves bytes the API sent as a file named `name`, through a link the browser follows once. */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "1st", "2nd", "3rd", "11th", "22nd": a place in a queue. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** A length of time in plain words: "about 50 seconds", "about 3 minutes", "about 1 h 10 min". */
export function aboutTime(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return 'a moment';
  if (seconds < 60) return `about ${Math.max(5, Math.round(seconds / 5) * 5)} seconds`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  return `about ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** The short form of a time left: "about 4 s left", "about 3 min left". */
export function timeLeft(seconds: number | null | undefined): string {
  if (seconds == null || !isFinite(seconds) || seconds < 0) return '';
  if (seconds < 60) return `about ${Math.max(1, Math.round(seconds))} s left`;
  return `about ${Math.round(seconds / 60)} min left`;
}

/** How far back a tools list reads: 7, 30 or 90 days, or all time (0). */
export type ToolDays = '7' | '30' | '90' | '0';

/** The lists' window, one control (tools Option A): 30 days unless the reader asks for more. */
export const DAY_OPTIONS: { id: ToolDays; label: string }[] = [
  { id: '7', label: '7 days' }, { id: '30', label: '30 days' }, { id: '90', label: '90 days' }, { id: '0', label: 'All time' },
];

/** "English" for "en", "Unknown" for unknown; the code itself when the browser cannot name it. */
export function languageName(code: string | null | undefined): string {
  if (!code || code === 'unknown') return 'Unknown';
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** "1–25 of 214": the rows a page shows. */
export function rangeText(page: number, size: number, total: number): string {
  if (!total) return '0 of 0';
  const first = (page - 1) * size + 1;
  return `${first}–${Math.min(page * size, total)} of ${total}`;
}
