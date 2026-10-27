import { describe, it, expect } from 'vitest';
import { rsTime, zoneCity } from './rs-time.pipe';
import { paperName } from './pdf-pages';
import { problemTitle } from './problem-list';

/** Report Studio's times are the workspace's (approved drawing 6): Chicago, 24-hour, whatever the reader's browser zone. */
describe('rsTime', () => {
  const now = new Date('2026-10-20T03:50:00Z'); // 19 Oct 22:50 in Chicago

  it('writes an instant in the workspace zone, not the browser\'s', () => {
    expect(rsTime('2026-10-20T03:43:46Z', 'dateTime', null, now)).toBe('19 Oct 2026, 22:43');
    expect(rsTime('2026-10-20T03:43:46Z', 'time', 'Europe/Berlin', now)).toBe('05:43');
  });

  it('says Today for today and leaves out this year, as the drawings do', () => {
    expect(rsTime('2026-10-20T03:43:46Z', 'recent', null, now)).toBe('Today 22:43');
    expect(rsTime('2026-10-02T15:10:00Z', 'recent', null, now)).toBe('2 Oct, 10:10');
    expect(rsTime('2025-10-02T15:10:00Z', 'recent', null, now)).toBe('2 Oct 2025, 10:10');
    expect(rsTime('2026-10-20T03:43:46Z', 'day', null, now)).toBe('Today');
    expect(rsTime('2026-10-01T15:00:00Z', 'day', null, now)).toBe('1 Oct');
  });

  it('reads the server\'s offset-less wall clock as Chicago time', () => {
    expect(rsTime('2026-10-19T22:43:00', 'time', null, now)).toBe('22:43');
  });

  it('writes nothing for nothing, and names a zone by its city', () => {
    expect(rsTime(null)).toBeNull();
    expect(rsTime('')).toBeNull();
    expect(zoneCity('America/Chicago')).toBe('Chicago');
    expect(zoneCity('America/New_York')).toBe('New York');
    expect(zoneCity(null)).toBe('Chicago');
  });
});

describe('Report Studio words', () => {
  it('names a page size', () => {
    expect(paperName(210, 297)).toBe('A4 portrait');
    expect(paperName(297, 210)).toBe('A4 landscape');
    expect(paperName(100, 100)).toBe('');
  });

  it('heads a problem with its title and field', () => {
    expect(problemTitle({ severity: 'ERROR', stage: 'DATA_CONTRACT', code: 'REQUIRED_FIELD_MISSING', message: 'x', path: 'quality.target' }))
      .toBe('Required field missing: quality.target');
    expect(problemTitle({ severity: 'WARNING', stage: 'X', code: 'SOMETHING_NEW', message: 'x' })).toBe('Something new');
  });
});
