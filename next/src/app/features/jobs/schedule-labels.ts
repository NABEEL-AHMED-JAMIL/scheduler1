/**
 * How a schedule's day fields read in words, shared by the Jobs list and the job assistant so the
 * two never describe the same timetable differently.
 */

/**
 * Both vocabularies the column holds, because one of them was never meant to be there.
 *
 * The job editor shipped writing '1'..'7' where everything else writes MON..SUN, so those rows
 * matched nothing here and the list dropped the days from the schedule summary entirely -- a
 * "Weekly on Mon, Wed" job read simply as "Weekly", which is also what it had degraded into
 * running. The editor writes MON..SUN now; these rows outlive the fix, so they are still read.
 */
export function weekdayLabel(daysOfWeek?: string | null): string {
  if (!daysOfWeek) return '';
  const names: Record<string, string> = {
    MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun',
    1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun',
  };
  return daysOfWeek.split(',')
    .map(code => names[code.trim().toUpperCase()])
    .filter(Boolean)
    .join(', ');
}

/** The backend reads a day of 0 (or less) as "the last day of the month". */
export function monthDayLabel(dayOfMonth?: number | null): string {
  if (dayOfMonth === undefined || dayOfMonth === null) return '';
  if (dayOfMonth <= 0) return 'last day';
  const tens = dayOfMonth % 100;
  if (tens >= 11 && tens <= 13) return `${dayOfMonth}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[dayOfMonth % 10] ?? 'th';
  return `${dayOfMonth}${suffix}`;
}
