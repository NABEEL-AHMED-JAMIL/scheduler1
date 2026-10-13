import { describe, it, expect } from 'vitest';
import { RunFacets, activeCount, bucketName, explorerBody, histogramBars, toggled, windowDays, NO_FILTER } from './run-explorer';

/** UX review 2026-10-12 (B3): the Runs explorer's one set of filters, read the same way by the list and the counts. */
const TODAY = new Date(2026, 9, 13, 9, 30);

describe('Runs explorer -- the filters', () => {
  it('turns a window into whole days on the reader\'s calendar', () => {
    expect(windowDays('today', TODAY)).toEqual({ fromDate: '2026-10-13', toDate: '2026-10-13' });
    expect(windowDays('2d', TODAY)).toEqual({ fromDate: '2026-10-12', toDate: '2026-10-13' });
    expect(windowDays('7d', TODAY)).toEqual({ fromDate: '2026-10-07', toDate: '2026-10-13' });
    expect(windowDays('30d', TODAY)).toEqual({ fromDate: '2026-09-14', toDate: '2026-10-13' });
  });

  it('sends only the filters that are on', () => {
    expect(explorerBody(NO_FILTER, 200, TODAY)).toEqual({ fromDate: '2026-10-12', toDate: '2026-10-13', limit: 200 });
    expect(explorerBody({ window: '7d', statuses: ['Failed'], pipelines: [1928], triggers: ['file'] }, 200, TODAY)).toEqual({
      fromDate: '2026-10-07', toDate: '2026-10-13', limit: 200, jobStatuses: ['Failed'], taskDetailIds: [1928], triggers: ['file'],
    });
  });

  it('toggles a choice and counts what is on, the window aside', () => {
    expect(toggled(['Failed'], 'Completed')).toEqual(['Failed', 'Completed']);
    expect(toggled(['Failed', 'Completed'], 'Failed')).toEqual(['Completed']);
    expect(activeCount({ window: '30d', statuses: ['Failed'], pipelines: [1, 2], triggers: [] })).toBe(3);
  });
});

describe('Runs explorer -- the histogram', () => {
  const FACETS: RunFacets = {
    total: 5, statuses: [], pipelines: [], triggers: [],
    histogram: { bucket: 'hour', buckets: [
      { start: '2026-10-13T08:00:00', total: 3, counts: { Failed: 1, Completed: 2 } },
      { start: '2026-10-13T09:00:00', total: 0, counts: {} },
      { start: '2026-10-13T10:00:00', total: 2, counts: { Running: 1, Completed: 1, Skip: 0 } },
    ] },
  };

  it('draws a bar a bucket, stacked by status in a fixed order, zero buckets kept', () => {
    const bars = histogramBars(FACETS);
    expect(bars.map(b => [b.name, b.value, b.meta])).toEqual([
      ['08:00', 3, '2026-10-13T08:00:00'], ['09:00', 0, '2026-10-13T09:00:00'], ['10:00', 2, '2026-10-13T10:00:00'],
    ]);
    expect(bars[0].segments!.map(s => [s.label, s.value])).toEqual([['Completed', 2], ['Failed', 1]]);
    expect(bars[2].segments!.map(s => s.label)).toEqual(['Completed', 'Running']);
    expect(histogramBars(null)).toEqual([]);
  });

  it('names a day bucket by its day, without shifting it', () => {
    expect(bucketName('2026-10-01T00:00:00', false)).toBe('1 Oct');
    expect(bucketName('2026-10-12', true)).toBe('12 Oct');
    expect(bucketName('2026-10-12T23:00:00', true)).toBe('23:00');
  });
});
