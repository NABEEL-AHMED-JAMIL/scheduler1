/**
 * A calendar day as the reader's own clock has it, "yyyy-MM-dd" -- for a date field's value or a
 * default range. Not toISOString().slice(0, 10): that is the UTC date, so in a Chicago evening
 * "today" was already tomorrow, and east of UTC after midnight it was still yesterday.
 */
export function localIsoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The reader's calendar day `days` before today (0 is today). */
export function localIsoDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return localIsoDay(date);
}
