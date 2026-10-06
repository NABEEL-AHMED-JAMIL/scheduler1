import { describe, it, expect } from 'vitest';
import { instantOf, instantMs, SERVER_ZONE } from './instant';

/**
 * Reading the timestamps this API actually sends.
 *
 * Every existing test of a timestamp built its input with `toISOString()`, which appends a Z. The
 * REST API never sends one: it serialises Java LocalDateTime, so the offset is simply absent.
 *
 * What those naive values MEAN is fixed by ModelApplication.main, which pins the application's
 * default zone to America/Chicago — so they are Chicago wall-clock readings regardless of the host
 * underneath. An earlier version of this module read them as UTC on the strength of the container
 * OS being UTC; the application overrides that at startup, and treating a 17:02 CDT stamp as 17:02
 * UTC made every run look five hours older than it was. It was enough to trip the stalled-run
 * warning on jobs that had started seconds earlier.
 */
describe('a timestamp from this API', () => {

  it('reads an offset-less timestamp in the zone the server pins, not as UTC', () => {
    // 17:02:13 Chicago in September is CDT, UTC-5.
    expect(instantOf('2026-09-14T17:02:13')!.toISOString()).toBe('2026-09-14T22:02:13.000Z');
  });

  it('follows the zone across daylight saving rather than assuming one offset', () => {
    // January is CST, UTC-6 — an hour further from UTC than the September case above.
    expect(instantOf('2026-01-15T12:00:00')!.toISOString()).toBe('2026-01-15T18:00:00.000Z');
  });

  it('keeps the fractional seconds a Java LocalDateTime carries', () => {
    expect(instantOf('2026-09-14T17:02:13.271')!.toISOString()).toBe('2026-09-14T22:02:13.271Z');
  });

  it('reads the space-separated form the same way', () => {
    // `select last_job_run from source_job` prints this shape.
    expect(instantOf('2026-09-14 17:02:13')!.toISOString()).toBe('2026-09-14T22:02:13.000Z');
  });

  it('takes a timestamp that already states its offset at its word', () => {
    // JobEventPublisher sends real instants over the socket, so these must NOT be re-interpreted.
    expect(instantOf('2026-09-14T22:02:13Z')!.toISOString()).toBe('2026-09-14T22:02:13.000Z');
    expect(instantOf('2026-09-14T17:02:13-05:00')!.toISOString()).toBe('2026-09-14T22:02:13.000Z');
    expect(instantOf('2026-09-15T00:02:13+02:00')!.toISOString()).toBe('2026-09-14T22:02:13.000Z');
  });

  it('agrees with itself: the socket form and the REST form of one moment are one instant', () => {
    // The jobs table writes event.at into the same field the REST list populates, so a disagreement
    // here would make a row jump five hours the moment a push arrived.
    expect(instantMs('2026-09-14T17:02:13')).toBe(instantMs('2026-09-14T22:02:13Z'));
  });

  it('does not shift a plain calendar date', () => {
    // A day is not an instant. Applying an offset here would move it a day for some readers.
    expect(instantOf('2026-08-24')!.getTime()).toBe(new Date('2026-08-24').getTime());
  });

  it('gives null rather than an Invalid Date, which compares false to everything', () => {
    expect(instantOf(null)).toBeNull();
    expect(instantOf(undefined)).toBeNull();
    expect(instantOf('')).toBeNull();
    expect(instantOf('   ')).toBeNull();
    expect(instantOf('not a time')).toBeNull();
    expect(instantMs('not a time')).toBeNull();
  });

  it('names the zone it is reading in, so the assumption is visible', () => {
    // Pinned in ModelApplication.main; there is no offset on the wire to detect it from.
    expect(SERVER_ZONE).toBe('America/Chicago');
  });
});
