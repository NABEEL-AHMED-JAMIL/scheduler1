import { describe, it, expect, beforeEach } from 'vitest';
import { compareSortValues, createSort, createTableSort, isEmptySortValue, sortRows } from './sort';

interface Row { name: string; count: number | null; when?: string }

const valueOf = (row: any, key: string) => row[key];

describe('createSort', () => {
  it('sorts ascending on the initial key and flips on a repeat toggle', () => {
    const sort = createSort<Row>('name');
    const rows: Row[] = [{ name: 'b', count: 1 }, { name: 'a', count: 2 }];

    expect(sort.apply(rows, valueOf).map(r => r.name)).toEqual(['a', 'b']);
    sort.toggle('name');
    expect(sort.direction()).toBe('desc');
    expect(sort.apply(rows, valueOf).map(r => r.name)).toEqual(['b', 'a']);
  });

  it('starts a new column ascending rather than keeping the previous direction', () => {
    const sort = createSort<Row>('name');
    sort.toggle('name');
    expect(sort.direction()).toBe('desc');
    sort.toggle('count');
    expect(sort.key()).toBe('count');
    expect(sort.direction()).toBe('asc');
  });

  it('keeps empty values last in both directions', () => {
    // A null is not "smaller" than 1 -- it is missing, and missing rows belong at the end
    // whichever way the column is sorted.
    const sort = createSort<Row>('count');
    const rows: Row[] = [
      { name: 'has-2', count: 2 },
      { name: 'empty', count: null },
      { name: 'has-1', count: 1 },
    ];

    expect(sort.apply(rows, valueOf).map(r => r.name)).toEqual(['has-1', 'has-2', 'empty']);
    sort.toggle('count');
    expect(sort.apply(rows, valueOf).map(r => r.name)).toEqual(['has-2', 'has-1', 'empty']);
  });

  it('compares numbers numerically, not as strings', () => {
    const sort = createSort<Row>('count');
    const rows: Row[] = [{ name: 'ten', count: 10 }, { name: 'nine', count: 9 }];
    expect(sort.apply(rows, valueOf).map(r => r.name)).toEqual(['nine', 'ten']);
  });

  it('does not mutate the array it is given', () => {
    const sort = createSort<Row>('name');
    const rows: Row[] = [{ name: 'b', count: 1 }, { name: 'a', count: 2 }];
    const order = rows.map(r => r.name);
    sort.apply(rows, valueOf);
    expect(rows.map(r => r.name)).toEqual(order);
  });

  it('reports which glyph a header should show', () => {
    const sort = createSort<Row>('name');
    expect(sort.iconFor('name')).toBe('arrowUp');
    expect(sort.iconFor('count')).toBe('sort');
    sort.toggle('name');
    expect(sort.iconFor('name')).toBe('arrowDown');
  });
});

/* ---------------------------------------------------------------------------------------------------------------
 * createTableSort (owner 2026-10-27, "add a sort on each table"): the one pattern every data table uses.
 * --------------------------------------------------------------------------------------------------------------- */

interface Run { id: number; name: string | null; started: string | null; rows: number | null; ok: boolean | null; status: string }

const RUNS: Run[] = [
  { id: 1, name: 'beta', started: '2026-10-27T09:00:00', rows: 10, ok: true, status: 'Completed' },
  { id: 2, name: 'Alpha', started: '2026-10-27T14:30:00+00:00', rows: 9, ok: false, status: 'Failed' },
  { id: 3, name: null, started: null, rows: null, ok: null, status: 'Running' },
  { id: 4, name: 'alpha', started: '2026-10-27T08:00:00Z', rows: 10, ok: true, status: 'Queue' },
];

const columns = {
  name: { value: (r: Run) => r.name, kind: 'text' as const },
  started: { value: (r: Run) => r.started, kind: 'date' as const },
  rows: { value: (r: Run) => r.rows, kind: 'number' as const },
  ok: { value: (r: Run) => r.ok, kind: 'bool' as const },
  status: { value: (r: Run) => r.status, kind: 'status' as const },
};
const ids = (rows: Run[]) => rows.map(r => r.id);

describe('createTableSort', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* none */ } });

  it('keeps the arrival order when the table has no sort of its own, so nothing moves on load', () => {
    const sort = createTableSort<Run>({ id: 't1', columns });
    expect(sort.key()).toBe('');
    expect(ids(sort.apply(RUNS))).toEqual([1, 2, 3, 4]);
  });

  it('starts from the table\'s own order when given one', () => {
    const sort = createTableSort<Run>({ id: 't2', columns, initial: { key: 'rows', direction: 'desc' } });
    // 10, 10 (ties keep arrival order: 1 before 4), 9, then the empty one last.
    expect(ids(sort.apply(RUNS))).toEqual([1, 4, 2, 3]);
  });

  it('sorts text locale-aware and case-insensitively, stable on ties, empty last', () => {
    const sort = createTableSort<Run>({ id: 't3', columns });
    sort.toggle('name');
    expect(sort.direction()).toBe('asc');
    expect(ids(sort.apply(RUNS))).toEqual([2, 4, 1, 3]);
    sort.toggle('name');
    expect(ids(sort.apply(RUNS))).toEqual([1, 2, 4, 3]);
  });

  it('sorts dates as instants: naive Chicago wall-clock and +00:00 / Z forms compare correctly', () => {
    // 09:00 Chicago (CDT) = 14:00Z; 14:30+00:00 = 14:30Z; 08:00Z. Ascending: 4 (08:00Z), 1 (14:00Z), 2 (14:30Z).
    const sort = createTableSort<Run>({ id: 't4', columns });
    sort.toggle('started');
    expect(sort.direction()).toBe('desc');
    expect(ids(sort.apply(RUNS))).toEqual([2, 1, 4, 3]);
    sort.toggle('started');
    expect(ids(sort.apply(RUNS))).toEqual([4, 1, 2, 3]);
  });

  it('sorts numbers numerically, largest first on the first click, empty last both ways', () => {
    const sort = createTableSort<Run>({ id: 't5', columns });
    sort.toggle('rows');
    expect(ids(sort.apply(RUNS))).toEqual([1, 4, 2, 3]);
    sort.toggle('rows');
    expect(ids(sort.apply(RUNS))).toEqual([2, 1, 4, 3]);
  });

  it('sorts yes/no with no first, and statuses by what they ask of the reader', () => {
    const sort = createTableSort<Run>({ id: 't6', columns });
    sort.toggle('ok');
    expect(ids(sort.apply(RUNS))).toEqual([2, 1, 4, 3]);
    sort.toggle('status');
    // Failed (crit), Running (brand), Queue (neutral), Completed (ok).
    expect(sort.apply(RUNS).map(r => r.status)).toEqual(['Failed', 'Running', 'Queue', 'Completed']);
  });

  it('takes a status column\'s own order when it names one', () => {
    const sort = createTableSort<Run>({ id: 't7', columns: { status: { value: r => r.status, kind: 'status', order: ['Queue', 'Running'] } } });
    sort.toggle('status');
    expect(sort.apply(RUNS).map(r => r.status)).toEqual(['Queue', 'Running', 'Failed', 'Completed']);
  });

  it('cycles first direction, the other, then back to the table\'s own order', () => {
    const sort = createTableSort<Run>({ id: 't8', columns, initial: { key: 'started', direction: 'desc' } });
    sort.toggle('name');
    expect(sort.state()).toEqual({ key: 'name', direction: 'asc' });
    sort.toggle('name');
    expect(sort.state()).toEqual({ key: 'name', direction: 'desc' });
    sort.toggle('name');
    expect(sort.state()).toEqual({ key: 'started', direction: 'desc' });
    // The table's own column just flips.
    sort.toggle('started');
    expect(sort.state()).toEqual({ key: 'started', direction: 'asc' });
    sort.toggle('started');
    expect(sort.state()).toEqual({ key: 'started', direction: 'desc' });
  });

  it('goes back to the arrival order on the third click when the table has no sort of its own', () => {
    const sort = createTableSort<Run>({ id: 't9', columns });
    sort.toggle('name'); sort.toggle('name'); sort.toggle('name');
    expect(sort.key()).toBe('');
    expect(ids(sort.apply(RUNS))).toEqual([1, 2, 3, 4]);
  });

  it('remembers the choice per viewer and per table, and forgets it when it is the table\'s own', () => {
    localStorage.setItem('etl_auth_user', JSON.stringify({ appUserId: 77 }));
    const first = createTableSort<Run>({ id: 'remember', columns });
    first.toggle('rows');
    expect(JSON.parse(localStorage.getItem('etl_table_sort:77:remember')!)).toEqual({ key: 'rows', direction: 'desc' });
    expect(createTableSort<Run>({ id: 'remember', columns }).state()).toEqual({ key: 'rows', direction: 'desc' });
    // Another viewer on the same browser does not inherit it.
    localStorage.setItem('etl_auth_user', JSON.stringify({ appUserId: 78 }));
    expect(createTableSort<Run>({ id: 'remember', columns }).key()).toBe('');
    localStorage.setItem('etl_auth_user', JSON.stringify({ appUserId: 77 }));
    first.reset();
    expect(localStorage.getItem('etl_table_sort:77:remember')).toBeNull();
  });

  it('ignores a remembered column the table no longer has, and storage that throws', () => {
    localStorage.setItem('etl_table_sort::gone', JSON.stringify({ key: 'removed', direction: 'asc' }));
    expect(createTableSort<Run>({ id: 'gone', columns, initial: { key: 'name', direction: 'asc' } }).key()).toBe('name');
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error('blocked'); };
    try {
      expect(createTableSort<Run>({ id: 'blocked', columns }).key()).toBe('');
    } finally {
      Storage.prototype.getItem = getItem;
    }
  });

  it('a server-sorted table leaves the rows alone, says what the request carries and tells the screen to read again', () => {
    const changes: unknown[] = [];
    const sort = createTableSort<Run>({
      id: 'server', server: true, onChange: s => changes.push(s),
      columns: { started: { value: r => r.started, kind: 'date', param: 'startTime' } },
    });
    expect(sort.param()).toBeNull();
    sort.toggle('started');
    expect(ids(sort.apply(RUNS))).toEqual([1, 2, 3, 4]);
    expect(sort.param()).toEqual({ sort: 'startTime', dir: 'desc' });
    expect(changes).toEqual([{ key: 'started', direction: 'desc' }]);
  });

  it('does not sort a blocked column, and says why', () => {
    const sort = createTableSort<Run>({ id: 'blocked-col', columns: { rows: { value: r => r.rows, kind: 'number', blocked: () => 'Too many files to sort by size.' } } });
    sort.toggle('rows');
    expect(sort.key()).toBe('');
    expect(sort.blockedReason('rows')).toBe('Too many files to sort by size.');
  });

  it('reports aria-sort only for the sorted column', () => {
    const sort = createTableSort<Run>({ id: 'aria', columns, initial: { key: 'name', direction: 'asc' } });
    expect(sort.ariaSort('name')).toBe('ascending');
    expect(sort.ariaSort('rows')).toBeNull();
    sort.toggle('name');
    expect(sort.ariaSort('name')).toBe('descending');
  });

  it('compare() orders two rows the same way, for a screen that sorts inside its own groups', () => {
    const sort = createTableSort<Run>({ id: 'cmp', columns, initial: { key: 'rows', direction: 'asc' } });
    expect(sort.compare(RUNS[1], RUNS[0])).toBeLessThan(0);
    expect(sort.compare(RUNS[2], RUNS[0])).toBeGreaterThan(0);
  });
});

describe('compareSortValues and sortRows', () => {
  it('treats blanks and the dash a cell draws for nothing as empty', () => {
    for (const v of [null, undefined, '', '  ', '—', '-', NaN]) expect(isEmptySortValue(v)).toBe(true);
    for (const v of [0, false, 'x', '0']) expect(isEmptySortValue(v)).toBe(false);
  });

  it('auto-types a generic grid: numbers, then timestamps, then text', () => {
    expect(compareSortValues('9', '10')).toBeLessThan(0);
    expect(compareSortValues('1,200', '950')).toBeGreaterThan(0);
    expect(compareSortValues('2026-10-27T09:00:00', '2026-10-27T08:00:00Z')).toBeGreaterThan(0);
    expect(compareSortValues('Job 9', 'job 10')).toBeLessThan(0);
  });

  it('puts words in a number column after the numbers, whichever way', () => {
    expect(sortRows(['n/a', '3', '1', ''], v => v, 'asc', 'number')).toEqual(['1', '3', 'n/a', '']);
    expect(sortRows(['n/a', '3', '1', ''], v => v, 'desc', 'number')).toEqual(['3', '1', 'n/a', '']);
  });
});

describe('createTableSort for a grid whose columns come from the data', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* none */ } });

  it('sorts any column the data has, typed per value, and none it lacks', () => {
    type Cell = Record<string, unknown>;
    const sort = createTableSort<Cell>({ id: 'grid', columns: {}, remember: false, dynamic: k => ({ value: r => r[k], kind: 'auto' }) });
    const rows: Cell[] = [{ city: 'b', n: '10' }, { city: 'A', n: '9' }, { city: null, n: '' }];
    sort.toggle('n');
    expect(sort.apply(rows).map(r => r['city'])).toEqual(['A', 'b', null]);
    sort.toggle('n');
    expect(sort.apply(rows).map(r => r['city'])).toEqual(['b', 'A', null]);
    sort.toggle('city');
    expect(sort.apply(rows).map(r => r['city'])).toEqual(['A', 'b', null]);
    expect(sort.sortable('')).toBe(false);
  });
});
