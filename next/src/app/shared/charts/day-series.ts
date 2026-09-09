import { Bar } from './bar-chart';

/** The longest axis worth drawing. Beyond this the answer is a narrower range, not more bars. */
export const MAX_DAYS = 366;

export interface DaySeries {
  bars: Bar[];
  /** True when the range was longer than MAX_DAYS and the oldest days are not drawn. */
  capped: boolean;
}

/**
 * A run-per-day series with the empty days present.
 *
 * Shared because two screens draw this chart from different feeds and only one of them filled
 * the gaps. The Queue's "Volume by day" plotted only the days that had rows, so two bars six
 * days apart rendered as neighbours under a caption promising the whole range -- a shape that
 * reads as steady daily traffic when the truth is two bursts a week apart.
 *
 * `from` and `to` are yyyy-mm-dd. Days are stepped in UTC so a local daylight-saving boundary
 * cannot produce a duplicated or missing bar, and the keys are compared as text for the same
 * reason.
 *
 * When the span exceeds MAX_DAYS the axis keeps the RECENT end. Walking forward from `from` and
 * stopping at a count kept the oldest days instead and silently dropped the newest, so a
 * two-year range drew 366 empty days and reported nothing while the tile beside it counted
 * fifty runs.
 */
export function daySeries(
  counts: Map<string, number>, from: string, to: string, maxDays = MAX_DAYS,
): DaySeries {
  if (!from || !to || from > to) return { bars: [], capped: false };

  const end = new Date(to + 'T00:00:00Z');
  const begin = new Date(from + 'T00:00:00Z');
  if (Number.isNaN(end.getTime()) || Number.isNaN(begin.getTime())) return { bars: [], capped: false };

  const DAY_MS = 86_400_000;
  const span = Math.floor((end.getTime() - begin.getTime()) / DAY_MS) + 1;
  const capped = span > maxDays;
  const start = capped ? new Date(end.getTime() - (maxDays - 1) * DAY_MS) : begin;

  // Once the axis crosses a year, MM-DD is ambiguous: a 366-day span can begin and end with
  // the same label.
  const crossesYear = start.getUTCFullYear() !== end.getUTCFullYear();

  const bars: Bar[] = [];
  for (const at = new Date(start); at <= end; at.setUTCDate(at.getUTCDate() + 1)) {
    const key = at.toISOString().slice(0, 10);
    bars.push({ name: crossesYear ? key : key.slice(5), value: counts.get(key) ?? 0, meta: key });
  }
  return { bars, capped };
}
