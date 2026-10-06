import { describe, it, expect } from 'vitest';
import { choicesOf, dueGroup, groupRows, matchesSearch, nextAfter, pastGroup, stepFrom } from './inbox-list';

/** The Task inbox's list for hundreds of rows (owner, 2026-10-06): day headers, search, filters, and moving through it. */
const TZ = 'America/Chicago';
const NOW = Date.parse('2026-10-08T17:00:00Z'); // Thursday 8 Oct, 12:00 in Chicago

describe('Day groups', () => {
  it('puts what was acted on under Today, Yesterday, Earlier this week (since Monday) or Older', () => {
    expect(pastGroup('2026-10-08T08:00:00', NOW, TZ)).toBe('Today');
    expect(pastGroup('2026-10-07T23:59:00', NOW, TZ)).toBe('Yesterday');
    expect(pastGroup('2026-10-05T00:10:00', NOW, TZ)).toBe('Earlier this week'); // Monday
    expect(pastGroup('2026-10-04T23:50:00', NOW, TZ)).toBe('Older');             // Sunday
    expect(pastGroup(null, NOW, TZ)).toBe('Older');
    // Naive times are Chicago wall clock; an offset is taken at its word.
    expect(pastGroup('2026-10-08T04:30:00+00:00', NOW, TZ)).toBe('Yesterday');
  });

  it('says Yesterday on a Monday, even though Sunday was last week', () => {
    const monday = Date.parse('2026-10-05T15:00:00Z');
    expect(pastGroup('2026-10-04T10:00:00', monday, TZ)).toBe('Yesterday');
    expect(pastGroup('2026-10-03T10:00:00', monday, TZ)).toBe('Older');
  });

  it('puts an open task under when it is due, in the soonest-first order the list keeps', () => {
    expect(dueGroup('2026-10-08T09:00:00', false, NOW, TZ)).toBe('Overdue');
    expect(dueGroup('2026-10-09T09:00:00', true, NOW, TZ)).toBe('Overdue');
    expect(dueGroup('2026-10-08T21:34:00', false, NOW, TZ)).toBe('Due today');
    expect(dueGroup('2026-10-09T09:00:00', false, NOW, TZ)).toBe('Due tomorrow');
    expect(dueGroup('2026-10-11T09:00:00', false, NOW, TZ)).toBe('Later this week'); // Sunday
    expect(dueGroup('2026-10-12T09:00:00', false, NOW, TZ)).toBe('Later');
    expect(dueGroup(null, false, NOW, TZ)).toBe('No due time');
  });

  it('keeps the list\'s order and counts each group', () => {
    const rows = [{ id: 1, group: 'Today' }, { id: 2, group: 'Today' }, { id: 3, group: 'Older' }];
    expect(groupRows(rows).map(g => [g.label, g.rows.map(r => r.id)])).toEqual([['Today', [1, 2]], ['Older', [3]]]);
  });
});

describe('Search and filters', () => {
  it('finds a row by every word of the query, in any order and case', () => {
    const hay = 'mig-277 visit check (synthetic) #1016 alex approves the visit mig-279 visit approval alex';
    expect(matchesSearch(hay, 'ALEX 1016')).toBe(true);
    expect(matchesSearch(hay, 'visit   approval')).toBe(true);
    expect(matchesSearch(hay, 'alex 1048')).toBe(false);
    expect(matchesSearch(hay, '')).toBe(true);
  });

  it('builds a filter\'s choices from the rows, with counts', () => {
    expect(choicesOf(['Approved', 'Rejected', 'Approved', ''])).toEqual([{ value: 'Approved', count: 2 }, { value: 'Rejected', count: 1 }]);
  });
});

describe('Moving through the list', () => {
  it('steps up and down, staying at the ends, from the first row when none is open', () => {
    expect(stepFrom([5, 6, 7], 6, 1)).toBe(7);
    expect(stepFrom([5, 6, 7], 7, 1)).toBe(7);
    expect(stepFrom([5, 6, 7], 5, -1)).toBe(5);
    expect(stepFrom([5, 6, 7], null, 1)).toBe(5);
    expect(stepFrom([5, 6, 7], 99, -1)).toBe(7);
    expect(stepFrom([], 1, 1)).toBeNull();
  });

  it('goes on to the next row after a decision, else the one before, else none', () => {
    expect(nextAfter([5, 6, 7], 6)).toBe(7);
    expect(nextAfter([5, 6, 7], 7)).toBe(6);
    expect(nextAfter([5], 5)).toBeNull();
  });
});
