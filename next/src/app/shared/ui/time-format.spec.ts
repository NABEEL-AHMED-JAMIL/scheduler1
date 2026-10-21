import { describe, it, expect } from 'vitest';
import { TIME_FORMATS, resolveFormat, dayLabel, hourLabel, hourRange, axisHour, formatDuration, compactDuration, elapsedDuration } from './time-format';
import { ServerTimePipe } from './server-time.pipe';

/**
 * MIG-295 (owner 2026-09-28): one way to write a date, a time, an hour and a duration, on a
 * 24-hour clock, across the console. Screens had sixteen format strings, a 12-hour "10p", US
 * "Sep 24, 2026", raw "2026-09-24" and five ways to write how long a run took.
 */
describe('named formats', () => {
  it('writes days "24 Sep 2026" and times on a 24-hour clock', () => {
    expect(TIME_FORMATS.date).toBe('d MMM yyyy');
    expect(TIME_FORMATS.dateTime).toBe('d MMM yyyy, HH:mm');
    expect(TIME_FORMATS.recent).toBe('d MMM, HH:mm');
    expect(TIME_FORMATS.time).toBe('HH:mm');
    for (const format of Object.values(TIME_FORMATS)) {
      expect(format, format).not.toMatch(/\bh\b|\bhh\b|a$| a\b/);
    }
  });

  it('turns a name, or one of Angular\'s 12-hour and US presets, into a 24-hour format', () => {
    expect(resolveFormat('dateTime')).toBe('d MMM yyyy, HH:mm');
    expect(resolveFormat('shortTime')).toBe('HH:mm');
    expect(resolveFormat('mediumDate')).toBe('d MMM yyyy');
    expect(resolveFormat('short')).toBe('d MMM yyyy, HH:mm');
    expect(resolveFormat(undefined)).toBe('d MMM yyyy, HH:mm');
    expect(resolveFormat('d MMM, HH:mm:ss')).toBe('d MMM, HH:mm:ss');
  });

  it('is what the serverTime pipe writes', () => {
    const pipe = new ServerTimePipe('en-US');
    expect(pipe.transform('2026-09-24', 'date')).toBe('24 Sep 2026');
    expect(pipe.transform(new Date(2026, 8, 24, 22, 6), 'shortTime')).toBe('22:06');
    expect(pipe.transform(new Date(2026, 8, 24, 22, 6))).toBe('24 Sep 2026, 22:06');
  });
});

describe('days and hours', () => {
  it('writes a calendar day without letting a time zone move it', () => {
    expect(dayLabel('2026-09-24')).toBe('24 Sep 2026');
    expect(dayLabel('2026-01-01')).toBe('1 Jan 2026');
    expect(dayLabel('not a day')).toBe('not a day');
  });

  it('writes hours on a 24-hour clock', () => {
    expect(hourLabel(22)).toBe('22:00');
    expect(hourLabel(0)).toBe('00:00');
    expect(hourRange(22)).toBe('22:00–23:00');
    expect(hourRange('23')).toBe('23:00–24:00');
    expect(axisHour(6)).toBe('06');
    expect(hourLabel('x')).toBe('x');
  });
});

describe('durations', () => {
  it('writes one way at every size, with the unit spelled out', () => {
    expect(formatDuration(0.42)).toBe('420 ms');
    expect(formatDuration(0)).toBe('0 sec');
    expect(formatDuration(1.4)).toBe('1.4 sec');
    expect(formatDuration(25.25)).toBe('25 sec');
    expect(formatDuration(60.3)).toBe('1 min');
    expect(formatDuration(200)).toBe('3 min 20 sec');
    expect(formatDuration(180)).toBe('3 min');
    expect(formatDuration(3900)).toBe('1 h 5 min');
    expect(formatDuration(7200)).toBe('2 h');
    expect(formatDuration(2 * 86400 + 3 * 3600)).toBe('2 d 3 h');
    expect(formatDuration(2 * 86400)).toBe('2 d');
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(undefined)).toBe('—');
    expect(formatDuration(NaN)).toBe('—');
    expect(formatDuration(-1)).toBe('—');
  });

  it('crosses each boundary where it should', () => {
    expect(formatDuration(0.999)).toBe('999 ms');
    expect(formatDuration(0.9996)).toBe('1 sec');
    expect(formatDuration(1)).toBe('1 sec');
    expect(formatDuration(9.94)).toBe('9.9 sec');
    expect(formatDuration(9.95)).toBe('10 sec');
    expect(formatDuration(10)).toBe('10 sec');
    expect(formatDuration(14.9)).toBe('15 sec');
    expect(formatDuration(59.4)).toBe('59 sec');
    expect(formatDuration(59.6)).toBe('1 min');
    expect(formatDuration(119.6)).toBe('2 min');
    expect(formatDuration(3599.4)).toBe('59 min 59 sec');
    expect(formatDuration(3599.6)).toBe('1 h');
    expect(formatDuration(3600)).toBe('1 h');
    expect(formatDuration(24 * 3600 - 20)).toBe('1 d');
    expect(formatDuration(25 * 3600)).toBe('1 d 1 h');
  });

  it('keeps bar labels short, and a 25 second run never reads 0', () => {
    expect(compactDuration(25.4)).toBe('25 sec');
    expect(compactDuration(0.3)).toBe('<1 sec');
    expect(compactDuration(0)).toBe('0 sec');
    expect(compactDuration(60)).toBe('1 min');
    expect(compactDuration(204)).toBe('3.4 min');
    expect(compactDuration(7200)).toBe('2 h');
    expect(compactDuration(null)).toBe('—');
  });

  it('ticks a live counter at a steady width', () => {
    expect(elapsedDuration(0)).toBe('0 sec');
    expect(elapsedDuration(45)).toBe('45 sec');
    expect(elapsedDuration(125)).toBe('2 min 05 sec');
    expect(elapsedDuration(3720)).toBe('1 h 02 min');
    expect(elapsedDuration(null)).toBe('—');
  });
});
