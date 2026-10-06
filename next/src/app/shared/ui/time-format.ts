/**
 * One way to write a date, a time, an hour and a duration across the console (MIG-295; owner
 * decision 2026-09-28: a 24-hour clock, days as "24 Sep 2026").
 *
 * Screens had grown sixteen format strings between them, plus a 12-hour "10p" on the dashboard,
 * Angular's US "Sep 24, 2026" in a few places, raw "2026-09-24" in others, and five ways to write
 * how long a run took. Templates name a format here rather than spell one out; the serverTime pipe
 * understands the names, and turns Angular's 12-hour and US presets into these, so a 12-hour clock
 * cannot come back by accident.
 *
 * @author Nabeel Ahmed
 */
export const TIME_FORMATS = {
  /** 24 Sep 2026 */
  date: 'd MMM yyyy',
  /** 24 Sep 2026, 22:06 */
  dateTime: 'd MMM yyyy, HH:mm',
  /** 24 Sep 2026, 22:06:31 -- a log line or an audit entry, where seconds order events. */
  dateTimeSec: 'd MMM yyyy, HH:mm:ss',
  /** 24 Sep, 22:06 -- a table of recent activity, where the year is this one. */
  recent: 'd MMM, HH:mm',
  /** 24 Sep, 22:06:31 */
  recentSec: 'd MMM, HH:mm:ss',
  /** 24 Sep -- a day inside a range the page has already dated. */
  day: 'd MMM',
  /** 22:06 */
  time: 'HH:mm',
  /** 22:06:31 */
  timeSec: 'HH:mm:ss',
  /** September 2026 -- a billing period. */
  month: 'MMMM yyyy',
} as const;

export type TimeFormatName = keyof typeof TIME_FORMATS;

/**
 * Angular's own presets are en-US by default: 'shortTime' is "10:06 PM" and 'mediumDate' is
 * "Sep 24, 2026". Each is mapped to the console's equivalent.
 */
const ANGULAR_PRESETS: Record<string, string> = {
  short: TIME_FORMATS.dateTime,
  medium: TIME_FORMATS.dateTimeSec,
  long: TIME_FORMATS.dateTimeSec,
  full: TIME_FORMATS.dateTimeSec,
  shortDate: TIME_FORMATS.date,
  mediumDate: TIME_FORMATS.date,
  longDate: TIME_FORMATS.date,
  fullDate: TIME_FORMATS.date,
  shortTime: TIME_FORMATS.time,
  mediumTime: TIME_FORMATS.timeSec,
  longTime: TIME_FORMATS.timeSec,
  fullTime: TIME_FORMATS.timeSec,
};

/** A format name, an Angular preset, or a format string, as the pattern to write with. */
export function resolveFormat(format: string | undefined | null): string {
  if (!format) return TIME_FORMATS.dateTime;
  if (format in TIME_FORMATS) return TIME_FORMATS[format as TimeFormatName];
  return ANGULAR_PRESETS[format] ?? format;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "24 Sep 2026" from "2026-09-24", read as a calendar day: parsed by hand, because new Date() reads
 * a bare day as UTC midnight, which is the day before anywhere west of Greenwich.
 */
export function dayLabel(iso: string | null | undefined): string {
  const text = String(iso ?? '');
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!match) return text;
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month} ${match[1]}` : text;
}

function hourOf(hour: number | string): number | null {
  const value = typeof hour === 'number' ? hour : Number(String(hour).trim());
  return Number.isInteger(value) && value >= 0 && value <= 23 && String(hour).trim() !== '' ? value : null;
}

const two = (n: number) => String(n).padStart(2, '0');

/** "22:00". Anything that is not an hour of the day comes back as it was. */
export function hourLabel(hour: number | string): string {
  const h = hourOf(hour);
  return h === null ? String(hour) : `${two(h)}:00`;
}

/** "22:00–23:00": an hour's bucket, as the heatmap and its drill-down count it. */
export function hourRange(hour: number | string): string {
  const h = hourOf(hour);
  return h === null ? String(hour) : `${two(h)}:00–${two(h + 1)}:00`;
}

/** "06": an hour on a narrow axis, where a column is about 12px wide on a phone. */
export function axisHour(hour: number | string): string {
  const h = hourOf(hour);
  return h === null ? String(hour) : two(h);
}

/**
 * How long something took, from seconds: 420ms, 25.3s, 3m 20s, 1h 5m. Rounds the total before
 * splitting it, so 119.6 s is "2m" rather than "1m 60s". Nothing measured, or a negative (the
 * reports' "did not finish" mark), is a dash.
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds === 0) return '0s';
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  if (seconds < 60) {
    const tenths = Math.round(seconds * 10) / 10;
    if (tenths < 60) return `${tenths}s`;
  }
  const total = Math.round(seconds);
  if (total < 3600) {
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  }
  const minutesTotal = Math.round(total / 60);
  const hours = Math.floor(minutesTotal / 60);
  const minutes = minutesTotal % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

/**
 * The same, short enough for a bar label: 25s, 1m, 3.4m, 2h. A run shorter than a second is "<1s",
 * never "0" -- the run chart used to plot minutes, so a 25 second run was labelled 0.
 */
export function compactDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds === 0) return '0s';
  if (seconds < 1) return '<1s';
  if (seconds < 59.5) return `${Math.round(seconds)}s`;
  const oneDecimal = (n: number) => String(Math.round(n * 10) / 10);
  if (seconds < 3600) return `${oneDecimal(seconds / 60)}m`;
  return `${oneDecimal(seconds / 3600)}h`;
}
