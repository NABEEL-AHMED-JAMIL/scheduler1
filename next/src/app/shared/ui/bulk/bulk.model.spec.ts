import { describe, it, expect, vi } from 'vitest';
import { Subject, of, throwError } from 'rxjs';
import { BULK_CAP, BulkSelection, BulkSource, byGroup, byReason, countOf, reasonText, refusal } from './bulk.model';

interface Row { id: number; }
const rows = (n: number, from = 1): Row[] => Array.from({ length: n }, (_, i) => ({ id: from + i }));

function selection(matching?: BulkSource<Row>['matching']) {
  return new BulkSelection<Row>({ idOf: r => r.id, noun: ['task', 'tasks'], groupNoun: 'workflow', matching, send: vi.fn() });
}

/** Bulk review (2026-10-12): which rows are picked -- one by one, a page at once, or every row matching the filter. */
describe('BulkSelection', () => {
  it('picks and drops rows one by one, and says how much of a page is picked', () => {
    const s = selection();
    const page = rows(3);
    expect(s.pageState(page)).toBe('none');
    s.toggle(page[0]);
    expect(s.count()).toBe(1);
    expect(s.pageState(page)).toBe('some');
    s.setPage(page, true);
    expect(s.pageState(page)).toBe('all');
    expect(s.ids()).toEqual([1, 2, 3]);
    s.toggle(page[1], false);
    expect(s.ids()).toEqual([1, 3]);
    s.setPage(page, false);
    expect(s.count()).toBe(0);
    expect(s.pageState([])).toBe('none');
  });

  it('never holds more than the cap: a page of 200 picks the first 100, and one more is refused', () => {
    const s = selection();
    const page = rows(200);
    s.setPage(page, true);
    expect(s.count()).toBe(BULK_CAP);
    expect(s.full()).toBe(true);
    expect(s.toggle({ id: 999 })).toBe(false);
    expect(s.hasId(999)).toBe(false);
    expect(s.toggle(page[0])).toBe(true);
  });

  it('selects every row matching the filter, the first 100 of more, and remembers how many matched', () => {
    const s = selection(() => of({ rows: rows(140), total: 340 }));
    s.selectMatching();
    expect(s.count()).toBe(100);
    expect(s.matched()).toEqual({ total: 340, taken: 100 });
    // A row unticked after that is a selection of its own again.
    s.toggle({ id: 1 }, false);
    expect(s.matched()).toBeNull();
  });

  it('clearing stops a Select all matching still reading, so a filter changed mid-way picks nothing', () => {
    const answer = new Subject<{ rows: Row[]; total: number }>();
    const s = selection(() => answer);
    s.selectMatching();
    expect(s.matching()).toBe(true);
    s.clear();
    answer.next({ rows: rows(5), total: 5 });
    expect(s.count()).toBe(0);
    expect(s.matching()).toBe(false);
  });

  it('says why Select all matching failed', () => {
    const failing = selection(() => throwError(() => ({ status: 0 })));
    failing.selectMatching();
    expect(failing.matchError()).toContain('could not be reached');
    expect(failing.matching()).toBe(false);
  });
});

describe('bulk answers in words', () => {
  it('names each skip reason in words, in the shared order, an unknown one readable', () => {
    const groups = byReason([
      { id: 1, reason: 'not-found' }, { id: 2, reason: 'already-decided' }, { id: 3, reason: 'individual-review' },
      { id: 4, reason: 'already-decided' }, { id: 5, reason: 'some-new-reason' },
    ]);
    expect(groups.map(g => [g.label, g.items.length])).toEqual([
      ['Already decided', 2], ['The pipeline requires individual review', 1], ['Not found', 1], ['Some new reason', 1]]);
    expect(reasonText('rule-failures')).toContain('rules fail');
    expect(reasonText('bulk-off')).toBe('Bulk approve is off in this workspace');
    expect(reasonText('not-completed')).toContain('not completed');
    expect(reasonText('changed')).toBe('Changed since it was listed');
    expect(reasonText('not-yours')).toBe('Not yours to decide');
    expect(reasonText('cannot-approve')).toBe('Cannot be approved as it stands');
  });

  it('counts the items by group, largest first, the ungrouped last', () => {
    const groups = byGroup([{ id: 1, group: 'Claims' }, { id: 2, group: 'Visits' }, { id: 3, group: 'Visits' }, { id: 4 }], 'No pipeline');
    expect(groups.map(g => [g.label, g.items.length])).toEqual([['Visits', 2], ['Claims', 1], ['No pipeline', 1]]);
  });

  it('counts with the noun, and reads a refusal from the envelope first', () => {
    expect(countOf(1, ['run', 'runs'])).toBe('1 run');
    expect(countOf(1200, ['run', 'runs'])).toBe('1,200 runs');
    expect(refusal({ status: 429, error: { message: 'Too many bulk decisions in a minute; wait a moment and try again.' } }, 'x'))
      .toContain('Too many bulk decisions');
    expect(refusal({ status: 500, error: 'boom' }, 'Fallback.')).toBe('Fallback.');
  });
});
