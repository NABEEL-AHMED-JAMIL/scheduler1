import { Pipe, PipeTransform } from '@angular/core';
import { SERVER_ZONE, instantOf } from '../../core/instant';

/**
 * Report Studio's times, in the WORKSPACE's zone (approved drawings, screen 6: "Times are in the workspace's time zone
 * (Chicago), not UTC"), 24-hour. The console's serverTime pipe writes the reader's own browser zone, so a reader in
 * Berlin saw every report seven hours on from the PDF it opens; this one writes the zone the report itself was made in
 * (its config.timeZone), else the workspace default, America/Chicago.
 *
 *  - date      24 Sep 2026
 *  - dateTime  24 Sep 2026, 22:06
 *  - recent    Today 22:06 · 24 Sep, 22:06 · 24 Sep 2025, 22:06 -- a table of activity (the drawings' "Today 09:15")
 *  - day       Today · 2 Oct · 2 Oct 2025 -- "Updated 2 Oct" on a card
 *  - time      22:06
 */
export type RsTimeFormat = 'date' | 'dateTime' | 'recent' | 'day' | 'time';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Wall { year: number; month: number; day: number; hour: string; minute: string }

function wallClock(at: Date, zone: string): Wall | null {
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit' });
  } catch {
    format = new Intl.DateTimeFormat('en-US', { timeZone: SERVER_ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit' });
  }
  const parts: Record<string, string> = {};
  for (const p of format.formatToParts(at)) if (p.type !== 'literal') parts[p.type] = p.value;
  if (!parts['year']) return null;
  return { year: Number(parts['year']), month: Number(parts['month']), day: Number(parts['day']),
    hour: String(Number(parts['hour']) % 24).padStart(2, '0'), minute: parts['minute'] };
}

/** A time written in a zone; `now` is for the tests. */
export function rsTime(value: string | number | Date | null | undefined, format: RsTimeFormat = 'dateTime', zone?: string | null,
                       now: Date = new Date()): string | null {
  if (value === null || value === undefined || value === '') return null;
  const at = value instanceof Date ? value : typeof value === 'number' ? new Date(value) : instantOf(value);
  if (!at || !Number.isFinite(at.getTime())) return null;
  const tz = zone || SERVER_ZONE;
  const w = wallClock(at, tz);
  if (!w) return null;
  const n = wallClock(now, tz)!;
  const time = `${w.hour}:${w.minute}`;
  const dayMonth = `${w.day} ${MONTHS[w.month - 1]}`;
  const fullDay = `${dayMonth} ${w.year}`;
  const today = w.year === n.year && w.month === n.month && w.day === n.day;
  switch (format) {
    case 'time': return time;
    case 'date': return fullDay;
    case 'day': return today ? 'Today' : w.year === n.year ? dayMonth : fullDay;
    case 'recent': return today ? `Today ${time}` : w.year === n.year ? `${dayMonth}, ${time}` : `${fullDay}, ${time}`;
    default: return `${fullDay}, ${time}`;
  }
}

/** The zone's short name for a reader ("Chicago" for America/Chicago). */
export function zoneCity(zone: string | null | undefined): string {
  const z = zone || SERVER_ZONE;
  return (z.split('/').pop() ?? z).replace(/_/g, ' ');
}

@Pipe({ name: 'rsTime' })
export class RsTimePipe implements PipeTransform {
  transform(value: string | number | Date | null | undefined, format: RsTimeFormat = 'dateTime', zone?: string | null): string | null {
    return rsTime(value, format, zone);
  }
}
