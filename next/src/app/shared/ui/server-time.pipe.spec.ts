import { ServerTimePipe } from './server-time.pipe';

/**
 * The API hands out Chicago wall-clock readings with no offset. Formatted by Angular's own date
 * pipe they are read as the VIEWER's local time, so anyone outside Chicago saw every time on the
 * jobs, queue, run-history and log screens off by hours -- and on a single jobs row "Next" (raw)
 * and "Last" (converted) disagreed. These cases format in UTC so they hold on any machine.
 */
describe('ServerTimePipe', () => {
  const pipe = new ServerTimePipe('en-US');

  it('reads an offset-less API timestamp as Chicago time, not the viewer\'s', () => {
    // 17:02 in Chicago in September (CDT, UTC-5) is 22:02 UTC.
    expect(pipe.transform('2026-09-14T17:02:13.271', 'HH:mm', 'UTC')).toBe('22:02');
    // Standard time: 17:02 CST (UTC-6) is 23:02 UTC.
    expect(pipe.transform('2026-12-14T17:02:13', 'HH:mm', 'UTC')).toBe('23:02');
  });

  it('takes a timestamp that states its offset at its word', () => {
    expect(pipe.transform('2026-09-18T10:00:00Z', 'HH:mm', 'UTC')).toBe('10:00');
    expect(pipe.transform('2026-09-18T10:00:00+02:00', 'HH:mm', 'UTC')).toBe('08:00');
  });

  it('leaves a calendar day on its own day', () => {
    // Shifting a date with no time by an offset would move it a day for a reader west of UTC.
    expect(pipe.transform('2026-09-01', 'd MMM yyyy')).toBe('1 Sep 2026');
  });

  it('passes a value the browser made itself straight through', () => {
    const at = new Date(Date.UTC(2026, 8, 14, 12, 30));
    expect(pipe.transform(at, 'HH:mm', 'UTC')).toBe('12:30');
    expect(pipe.transform(at.getTime(), 'HH:mm', 'UTC')).toBe('12:30');
  });

  it('renders nothing for nothing', () => {
    expect(pipe.transform(null, 'HH:mm')).toBeNull();
    expect(pipe.transform(undefined, 'HH:mm')).toBeNull();
    expect(pipe.transform('', 'HH:mm')).toBeNull();
  });
});
