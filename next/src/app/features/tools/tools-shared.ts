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
