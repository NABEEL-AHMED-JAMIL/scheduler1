import { describe, it, expect } from 'vitest';
import { daySeries, MAX_DAYS } from './day-series';

const counts = (entries: [string, number][]) => new Map(entries);

describe('daySeries', () => {
  it('fills the days with no runs rather than closing the gap', () => {
    const { bars } = daySeries(counts([['2026-09-01', 3], ['2026-09-05', 2]]),
      '2026-09-01', '2026-09-05');
    expect(bars.map(b => b.value)).toEqual([3, 0, 0, 0, 2]);
  });

  it('covers the whole selected range, not just the days that have runs', () => {
    const { bars } = daySeries(counts([['2026-09-08', 49]]), '2026-08-09', '2026-09-08');
    expect(bars).toHaveLength(31);
    expect(bars[0].meta).toBe('2026-08-09');
    expect(bars[30].meta).toBe('2026-09-08');
    expect(bars.filter(b => b.value > 0)).toHaveLength(1);
  });

  /**
   * The critical one: the cap used to be a counter on a loop that began at the OLD end, so a
   * range longer than the cap kept the oldest days and dropped the newest -- the card showed
   * 366 empty days from two years ago and reported nothing while the page said 50 runs.
   */
  it('keeps the recent end when the range is longer than the cap', () => {
    const { bars, capped } = daySeries(counts([['2026-09-08', 50]]), '2024-09-08', '2026-09-08');
    expect(capped).toBe(true);
    expect(bars).toHaveLength(MAX_DAYS);
    expect(bars[bars.length - 1].meta).toBe('2026-09-08');
    expect(bars[bars.length - 1].value).toBe(50);
  });

  it('writes the year into the label once the axis crosses one', () => {
    const { bars } = daySeries(counts([]), '2025-12-30', '2026-01-02');
    expect(bars.map(b => b.name)).toEqual(['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02']);
  });

  it('keeps the short label when the axis stays inside one year', () => {
    const { bars } = daySeries(counts([]), '2026-09-01', '2026-09-03');
    expect(bars.map(b => b.name)).toEqual(['09-01', '09-02', '09-03']);
  });

  it('steps in UTC, so a daylight-saving boundary neither duplicates nor drops a day', () => {
    // US DST begins 2026-03-08; a local-time walk repeats or skips a day across it.
    const { bars } = daySeries(counts([]), '2026-03-06', '2026-03-10');
    expect(bars.map(b => b.meta)).toEqual([
      '2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10',
    ]);
  });

  it('returns nothing for a reversed or empty range instead of looping', () => {
    expect(daySeries(counts([]), '2026-09-08', '2026-09-01').bars).toEqual([]);
    expect(daySeries(counts([]), '', '2026-09-01').bars).toEqual([]);
  });
});
