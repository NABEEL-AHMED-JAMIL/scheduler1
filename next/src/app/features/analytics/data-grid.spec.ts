import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
  DataGrid, GRID_OPERATORS, GridColumn, GridCopy, GridSort, GridWidth, MAX_COLUMN_WIDTH,
} from './data-grid';
import { FilterClause } from './analytics.service';
import { FILTER_OPERATORS } from './filter-builder';
import { useMemoryStorage } from '../../shared/testing/memory-storage';

/**
 * The dataset grid.
 *
 * ONE PROPERTY IS PINNED HARDER THAN EVERYTHING ELSE HERE, and it is the one that decides whether
 * this screen tells the truth: THE GRID NEVER REORDERS ITS OWN ROWS. A grid holding one page out
 * of four hundred that sorts the array it happens to have produces the most convincing wrong
 * answer available anywhere on this screen -- the column looks sorted, the arrow agrees, and the
 * reader concludes they are looking at the largest values in a 250,000-row file when they are
 * looking at the largest values in the hundred rows that happened to be on screen. Several cases
 * below exist only to make that regression impossible to introduce quietly: a header click emits
 * an intent and changes nothing on screen, and aria-sort follows the INPUT rather than the click,
 * so a grid that started sorting locally would have to fail these to do it.
 *
 * The second theme is the count. Once a filter is on, `totalRows` counts matches, and a match
 * count printed by itself reads as the size of the file. Three cases fix the three phrasings.
 *
 * The third is that the reader's own two conveniences -- width and visibility -- are held here
 * and in localStorage, and that storage throwing (which is what a private window does: the
 * accessor throws, it does not return null) leaves a working grid rather than a blank one.
 */

const COLUMNS: GridColumn[] = [
  { name: 'region', type: 'VARCHAR' },
  { name: 'amount', type: 'DECIMAL(18,3)' },
  { name: 'booked_on', type: 'DATE' },
];

/**
 * Deliberately not in any order. `amount` reads 980, 1200, null down the page, so a grid that
 * sorted its own page would visibly move row 2 to the top and the assertions would catch it.
 */
const ROWS: (string | null)[][] = [
  ['west', '980', '2024-01-02'],
  ['east', '1200', '2024-01-03'],
  ['north', null, '2024-01-04'],
];

interface GridOptions {
  columns?: GridColumn[];
  rows?: (string | null)[][];
  sort?: GridSort | null;
  search?: string;
  loading?: boolean;
  totalRows?: number;
  filtered?: boolean;
  datasetRows?: number | null;
  storageKey?: string;
}

function gridWith(options: GridOptions = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(DataGrid);
  const inputs: Record<string, unknown> = {
    columns: options.columns ?? COLUMNS,
    rows: options.rows ?? ROWS,
    sort: options.sort ?? null,
    search: options.search ?? '',
    loading: options.loading ?? false,
    totalRows: options.totalRows ?? ROWS.length,
    filtered: options.filtered ?? false,
    datasetRows: options.datasetRows ?? null,
    storageKey: options.storageKey ?? '',
  };
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);

  const sorts: (GridSort | null)[] = [];
  const searches: string[] = [];
  const filters: FilterClause[][] = [];
  const visibility: string[][] = [];
  const widths: GridWidth[] = [];
  const copies: GridCopy[] = [];
  const grid = fixture.componentInstance;
  grid.sortChange.subscribe(value => sorts.push(value));
  grid.searchChange.subscribe(value => searches.push(value));
  grid.filtersChange.subscribe(value => filters.push(value));
  grid.visibilityChange.subscribe(value => visibility.push(value));
  grid.widthChange.subscribe(value => widths.push(value));
  grid.copyCell.subscribe(value => copies.push(value));

  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;

  return {
    fixture, grid, element, sorts, searches, filters, visibility, widths, copies,
    set(name: string, value: unknown) {
      fixture.componentRef.setInput(name, value);
      fixture.detectChanges();
    },
    render() { fixture.detectChanges(); },
    text: () => (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
    headers: () =>
      Array.from(element.querySelectorAll<HTMLElement>('thead tr:first-child th')),
    sortButtons: () => Array.from(element.querySelectorAll<HTMLButtonElement>('button.th-sort')),
    handles: () => Array.from(element.querySelectorAll<HTMLElement>('[role="separator"]')),
    bodyRows: () => Array.from(element.querySelectorAll<HTMLElement>('tbody tr')),
    /** The visible text of one rendered row, which is the only claim worth making about order. */
    rowText: (row: number) =>
      Array.from(element.querySelectorAll(`tbody tr:nth-child(${row + 1}) td`))
        .map(cell => (cell.textContent ?? '').trim()),
    cell: (row: number, column: number) =>
      element.querySelector<HTMLElement>(`[data-cell="${row}-${column}"]`)!,
    button(label: string) {
      const match = Array.from(element.querySelectorAll<HTMLButtonElement>('button'))
        .find(candidate => (candidate.textContent ?? '').trim().startsWith(label));
      if (!match) throw new Error(`no button starting "${label}"`);
      return match;
    },
    searchBox: () => element.querySelector<HTMLInputElement>('input[type="search"]')!,
    openFilters() {
      this.button('Filters').click();
      fixture.detectChanges();
    },
    /** The operator picker and the value box for one column of the filter row. */
    filterCell(column: number) {
      const cells = Array.from(element.querySelectorAll('thead tr:nth-child(2) th'));
      const cell = cells[column] as HTMLElement;
      return {
        operator: cell.querySelector<HTMLSelectElement>('select')!,
        value: cell.querySelector<HTMLInputElement>('input'),
      };
    },
    openColumns() {
      this.button('Columns').click();
      fixture.detectChanges();
    },
    checkboxes: () =>
      Array.from(element.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')),
  };
}

function key(target: HTMLElement, name: string, modifiers: Partial<KeyboardEventInit> = {}): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, ...modifiers }));
}

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Two microtask turns: copyText awaits the clipboard, then copyAt continues past it. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

// The clipboard. jsdom ships neither navigator.clipboard nor a working execCommand, so without
// this every copy would legitimately report failure and the interesting assertions would be
// about the environment rather than about the grid.
const written: string[] = [];
let clipboardAccepts = true;

beforeEach(() => {
  written.length = 0;
  clipboardAccepts = true;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: (text: string) => {
        if (!clipboardAccepts) return Promise.reject(new Error('denied'));
        written.push(text);
        return Promise.resolve();
      },
    },
  });
});

useMemoryStorage();

// ---------------------------------------------------------------------------------------------

describe('sorting, which is server-side or it is a lie', () => {
  it('emits the intent and does not touch the rows on screen', () => {
    // THE case. amount reads 980, 1200, null down the page; a grid sorting its own array would
    // put 1200 first the instant the header was clicked, and would look completely correct.
    const grid = gridWith();

    grid.sortButtons()[1].click();
    grid.render();

    expect(grid.sorts).toEqual([{ column: 'amount', direction: 'ASC' }]);
    expect(grid.rowText(0)).toEqual(['west', '980', '2024-01-02']);
    expect(grid.rowText(1)).toEqual(['east', '1200', '2024-01-03']);
    expect(grid.rowText(2)).toEqual(['north', 'null', '2024-01-04']);
  });

  it('leaves aria-sort saying "none" until the server actually sorted', () => {
    // The header reports the state of the DATASET, not the state of the click. A grid that
    // marked the column sorted on click would tell a screen reader the data had been reordered
    // while the request was still in flight -- and would keep saying so if it failed.
    const grid = gridWith();

    grid.sortButtons()[0].click();
    grid.render();
    expect(grid.headers()[0].getAttribute('aria-sort')).toBe('none');

    grid.set('sort', { column: 'region', direction: 'ASC' });
    expect(grid.headers()[0].getAttribute('aria-sort')).toBe('ascending');
  });

  it('renders whatever order comes back, without checking it', () => {
    const grid = gridWith({ sort: { column: 'amount', direction: 'DESC' } });
    grid.set('rows', [['east', '1200', '2024-01-03'], ['west', '980', '2024-01-02']]);

    expect(grid.rowText(0)).toEqual(['east', '1200', '2024-01-03']);
    expect(grid.bodyRows()).toHaveLength(2);
  });

  it('cycles ascending, descending, then no sort at all', () => {
    // The third state is not padding. A file in object storage has no order of its own, so
    // "unsorted" is a real answer, and a two-state toggle would make it unreachable forever
    // after the first click.
    const grid = gridWith();

    grid.sortButtons()[0].click();
    expect(grid.sorts[0]).toEqual({ column: 'region', direction: 'ASC' });

    grid.set('sort', { column: 'region', direction: 'ASC' });
    grid.sortButtons()[0].click();
    expect(grid.sorts[1]).toEqual({ column: 'region', direction: 'DESC' });

    grid.set('sort', { column: 'region', direction: 'DESC' });
    grid.sortButtons()[0].click();
    expect(grid.sorts[2]).toBeNull();
  });

  it('starts a different column ascending rather than inheriting the last direction', () => {
    const grid = gridWith({ sort: { column: 'region', direction: 'DESC' } });

    grid.sortButtons()[1].click();

    expect(grid.sorts[0]).toEqual({ column: 'amount', direction: 'ASC' });
  });

  it('sorts from a real button, so the header is reachable and pressable by keyboard', () => {
    const grid = gridWith();
    const buttons = grid.sortButtons();

    expect(buttons).toHaveLength(3);
    expect(buttons.every(button => button.tagName === 'BUTTON')).toBe(true);
    // The accessible name says what pressing it will DO, which is the question a reader who
    // cannot see the arrow is actually asking.
    expect(buttons[0].getAttribute('aria-label')).toContain('Sort by region');
  });

  it('says the sort is the server\'s and covers the whole dataset', () => {
    const grid = gridWith({ sort: { column: 'amount', direction: 'DESC' }, totalRows: 250000 });

    expect(grid.text()).toContain('on the server');
    expect(grid.text()).toContain('not just this page');
  });

  it('names what it is waiting for while the request is out', () => {
    const grid = gridWith();

    grid.sortButtons()[0].click();
    grid.set('loading', true);

    expect(grid.text()).toContain('Sorting on the server');
  });

  it('says pages are read-order when nothing is sorted', () => {
    expect(gridWith().text()).toContain('pages follow the order the file is read in');
  });
});

describe('the count, which must never read as the size of the file', () => {
  it('prints the plain total when nothing is narrowing it', () => {
    const grid = gridWith({ totalRows: 250000, filtered: false });

    expect(grid.text()).toContain(`${(250000).toLocaleString()} rows`);
    expect(grid.text()).not.toContain('matching');
  });

  it('prints "1,204 of 250,000 rows" once a filter is on and the file size is known', () => {
    const grid = gridWith({ totalRows: 1204, filtered: true, datasetRows: 250000 });

    expect(grid.text())
      .toContain(`${(1204).toLocaleString()} of ${(250000).toLocaleString()} rows`);
  });

  it('says "matching" and "filtered" when the file size is not known', () => {
    // The endpoint returns the filtered total and a flag, and from those two the second number
    // cannot be written at all. Saying it in words beats inventing it.
    const grid = gridWith({ totalRows: 1204, filtered: true, datasetRows: null });

    expect(grid.text()).toContain(`${(1204).toLocaleString()} matching rows`);
    expect(grid.text()).toContain('filtered');
  });

  it('keeps the page count separate from both, since it is a third number', () => {
    const grid = gridWith({ totalRows: 1204, filtered: true, datasetRows: 250000 });

    expect(grid.text()).toContain('3 on this page');
  });
});

describe('search', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
  afterEach(() => vi.useRealTimers());

  it('sends one request for a typed word rather than one per keystroke', () => {
    // Every search is a scan of the whole dataset on the server. Seven of them for "revenue"
    // would be seven full scans to answer one question.
    const grid = gridWith();
    const box = grid.searchBox();

    type(box, 'r');
    type(box, 're');
    type(box, 'rev');
    expect(grid.searches).toEqual([]);

    vi.advanceTimersByTime(400);
    expect(grid.searches).toEqual(['rev']);
  });

  it('goes immediately on Enter, without waiting out the timer', () => {
    const grid = gridWith();
    const box = grid.searchBox();

    type(box, 'rev');
    key(box, 'Enter');

    expect(grid.searches).toEqual(['rev']);
    vi.advanceTimersByTime(400);
    expect(grid.searches).toEqual(['rev']);
  });

  it('does not ask again for a term the server already has', () => {
    const grid = gridWith();
    const box = grid.searchBox();

    type(box, 'rev');
    vi.advanceTimersByTime(400);
    type(box, 'rev');
    vi.advanceTimersByTime(400);

    expect(grid.searches).toEqual(['rev']);
  });

  it('does not reset the box when the caller hands back what this grid just emitted', () => {
    // The feedback loop: typing emits, the screen stores it, and the value comes straight back
    // as an input. Adopting it blindly would wipe out whatever had been typed since.
    const grid = gridWith();
    const box = grid.searchBox();

    type(box, 'rev');
    vi.advanceTimersByTime(400);
    type(box, 'reve');
    grid.set('search', 'rev');

    expect(grid.searchBox().value).toBe('reve');
  });

  it('does adopt a value that came from somewhere else', () => {
    const grid = gridWith();

    grid.set('search', 'north');

    expect(grid.searchBox().value).toBe('north');
  });
});

describe('filtering, in the vocabulary the Canvas already uses', () => {
  it('offers the eight operators a single header cell can ask for honestly', () => {
    // Ranges take two bounds and IN takes a list; a 90px cell cannot ask for either without
    // leaving half of it unwritten, and a half-written range is a predicate nobody wrote.
    expect(GRID_OPERATORS.map(operator => operator.id)).toEqual([
      'EQ', 'NEQ', 'CONTAINS', 'STARTS_WITH', 'GT', 'LT', 'IS_NULL', 'IS_NOT_NULL',
    ]);
  });

  it('takes them from FILTER_OPERATORS rather than inventing a second language', () => {
    // A fifteenth operator spelled here is a request the server has no branch for, refused at
    // the far end of a round trip instead of at the picker.
    for (const operator of GRID_OPERATORS) {
      expect(FILTER_OPERATORS).toContainEqual(operator);
    }
  });

  it('emits a clause when a value is typed against a column', () => {
    const grid = gridWith();
    grid.openFilters();
    const value = grid.filterCell(0).value!;

    value.value = 'west';
    value.dispatchEvent(new Event('change', { bubbles: true }));
    grid.render();

    expect(grid.filters.at(-1)).toEqual([
      { field: 'region', operator: 'CONTAINS', value: 'west' },
    ]);
  });

  it('sends nothing for an operator that wants a value and has not been given one', () => {
    const grid = gridWith();
    grid.openFilters();
    const operator = grid.filterCell(1).operator;

    operator.value = 'GT';
    operator.dispatchEvent(new Event('change', { bubbles: true }));

    expect(grid.filters.at(-1)).toEqual([]);
  });

  it('treats an operator that takes no value as complete on its own', () => {
    const grid = gridWith();
    grid.openFilters();
    const operator = grid.filterCell(1).operator;

    operator.value = 'IS_NULL';
    operator.dispatchEvent(new Event('change', { bubbles: true }));
    grid.render();

    // No `value` key at all, rather than an empty one: a server reading presence as intent
    // would see a blank operand as an operand of blank.
    expect(grid.filters.at(-1)).toEqual([{ field: 'amount', operator: 'IS_NULL' }]);
    expect(grid.filterCell(1).value).toBeNull();
  });

  it('defaults text to contains and a number to equals', () => {
    const grid = gridWith();
    grid.openFilters();

    expect(grid.filterCell(0).operator.value).toBe('CONTAINS');
    expect(grid.filterCell(1).operator.value).toBe('EQ');
    expect(grid.filterCell(2).operator.value).toBe('EQ');
  });

  it('shows every active clause as a chip, so what is sent is what is on screen', () => {
    const grid = gridWith();
    grid.openFilters();
    const value = grid.filterCell(0).value!;
    value.value = 'west';
    value.dispatchEvent(new Event('change', { bubbles: true }));
    grid.render();

    expect(grid.text()).toContain('region contains "west"');
  });

  it('drops one filter and re-sends the rest', () => {
    const grid = gridWith();
    grid.openFilters();
    for (const column of [0, 2]) {
      const value = grid.filterCell(column).value!;
      value.value = 'x';
      value.dispatchEvent(new Event('change', { bubbles: true }));
      grid.render();
    }
    expect(grid.filters.at(-1)).toHaveLength(2);

    grid.button('Clear').click();
    grid.render();

    expect(grid.filters.at(-1)).toEqual([]);
    expect(grid.searches.at(-1)).toBeUndefined();
  });

  it('offers to clear the narrowing when a filter has emptied the page', () => {
    const grid = gridWith({ rows: [], filtered: true, totalRows: 0, datasetRows: 250000 });

    expect(grid.text()).toContain('No rows match');
    expect(grid.text()).toContain('this is the filter, not the file');
  });

  it('says a dataset is empty differently from a filter matching nothing', () => {
    const grid = gridWith({ rows: [], filtered: false, totalRows: 0 });

    expect(grid.text()).toContain('This dataset has no rows.');
    expect(grid.text()).not.toContain('No rows match');
  });
});

describe('column visibility', () => {
  it('stops rendering a hidden column and says which ones are hidden', () => {
    const grid = gridWith();
    grid.openColumns();

    grid.checkboxes()[1].dispatchEvent(new Event('change', { bubbles: true }));
    grid.render();

    expect(grid.visibility.at(-1)).toEqual(['amount']);
    expect(grid.sortButtons().map(button => button.textContent!.trim()))
      .toEqual(['region', 'booked_on']);
    // The cells follow the columns: row 0 keeps west and the date, and drops the amount between
    // them. A grid indexing cells by position rather than by column would show the date under
    // "region" here and look entirely plausible doing it.
    expect(grid.rowText(0)).toEqual(['west', '2024-01-02']);
  });

  it('refuses to hide the last visible column', () => {
    // A grid with no columns is a blank box, which reads as a failure to load.
    const grid = gridWith();
    grid.openColumns();
    for (const index of [1, 2]) {
      grid.checkboxes()[index].dispatchEvent(new Event('change', { bubbles: true }));
      grid.render();
    }

    expect(grid.checkboxes()[0].disabled).toBe(true);
    grid.checkboxes()[0].dispatchEvent(new Event('change', { bubbles: true }));
    grid.render();

    expect(grid.sortButtons()).toHaveLength(1);
    expect(grid.text()).toContain('The last visible column cannot be hidden');
  });

  it('brings them all back', () => {
    const grid = gridWith();
    grid.openColumns();
    grid.checkboxes()[1].dispatchEvent(new Event('change', { bubbles: true }));
    grid.render();

    grid.button('Show all').click();
    grid.render();

    expect(grid.visibility.at(-1)).toEqual([]);
    expect(grid.sortButtons()).toHaveLength(3);
  });

  it('starts from what the caller marked hidden', () => {
    const grid = gridWith({
      columns: [{ name: 'region', type: 'VARCHAR' }, { name: 'amount', type: 'BIGINT', hidden: true }],
      rows: [['west', '980']],
    });

    expect(grid.sortButtons()).toHaveLength(1);
    expect(grid.rowText(0)).toEqual(['west']);
  });
});

describe('column width', () => {
  it('sizes a column from the keyboard, so a resize is not a pointer-only feature', () => {
    const grid = gridWith();
    const handle = grid.handles()[0];

    key(handle, 'ArrowRight');
    grid.render();

    expect(grid.widths.at(-1)).toEqual({ column: 'region', width: 272 });
    expect(grid.headers()[0].style.width).toBe('272px');
  });

  it('takes a bigger step with shift held', () => {
    const grid = gridWith();

    key(grid.handles()[0], 'ArrowLeft', { shiftKey: true });

    expect(grid.widths.at(-1)).toEqual({ column: 'region', width: 192 });
  });

  it('will not be dragged past the point where a header stops being readable', () => {
    const grid = gridWith({
      columns: [{ name: 'region', type: 'VARCHAR', width: MAX_COLUMN_WIDTH - 8 }],
      rows: [['west']],
    });

    key(grid.handles()[0], 'ArrowRight', { shiftKey: true });

    expect(grid.widths.at(-1)).toEqual({ column: 'region', width: MAX_COLUMN_WIDTH });
  });

  it('hands a column back to automatic sizing', () => {
    const grid = gridWith({
      columns: [{ name: 'region', type: 'VARCHAR', width: 300 }],
      rows: [['west']],
    });
    expect(grid.headers()[0].style.width).toBe('300px');

    key(grid.handles()[0], 'Delete');
    grid.render();

    expect(grid.widths.at(-1)).toEqual({ column: 'region', width: null });
    expect(grid.headers()[0].style.width).toBe('');
  });

  it('emits once at the end of a drag, not once per mouse move', () => {
    // A listener only exists to persist this. Forty writes to land on the value the reader
    // stopped at is thirty-nine writes of a preference nobody expressed.
    const grid = gridWith({
      columns: [{ name: 'region', type: 'VARCHAR', width: 120 }],
      rows: [['west']],
    });

    grid.handles()[0].dispatchEvent(new MouseEvent('mousedown', { clientX: 100, bubbles: true }));
    for (const x of [120, 140, 160]) {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: x }));
    }
    grid.render();
    expect(grid.widths).toEqual([]);
    expect(grid.headers()[0].style.width).toBe('180px');

    document.dispatchEvent(new MouseEvent('mouseup'));
    grid.render();

    expect(grid.widths).toEqual([{ column: 'region', width: 180 }]);
  });

  it('stops listening to the document once the drag is over', () => {
    const grid = gridWith({
      columns: [{ name: 'region', type: 'VARCHAR', width: 120 }],
      rows: [['west']],
    });

    grid.handles()[0].dispatchEvent(new MouseEvent('mousedown', { clientX: 100, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup'));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 900 }));
    grid.render();

    expect(grid.headers()[0].style.width).toBe('120px');
  });

  it('announces itself as a separator with a range, not as an unlabelled handle', () => {
    const grid = gridWith();
    const handle = grid.handles()[0];

    expect(handle.getAttribute('role')).toBe('separator');
    expect(handle.getAttribute('tabindex')).toBe('0');
    expect(handle.getAttribute('aria-label')).toContain('Resize region');
  });
});

describe('remembering the reader\'s own layout', () => {
  it('keeps a hidden column and a width across a fresh mount of the same dataset', () => {
    const first = gridWith({ storageKey: 'bucket/orders.parquet' });
    first.openColumns();
    first.checkboxes()[1].dispatchEvent(new Event('change', { bubbles: true }));
    first.render();
    key(first.handles()[0], 'ArrowRight');
    first.render();

    const second = gridWith({ storageKey: 'bucket/orders.parquet' });

    expect(second.sortButtons().map(button => button.textContent!.trim()))
      .toEqual(['region', 'booked_on']);
    expect(second.headers()[0].style.width).toBe('272px');
  });

  it('keeps them per dataset, because two files do not share a column layout', () => {
    const first = gridWith({ storageKey: 'bucket/orders.parquet' });
    first.openColumns();
    first.checkboxes()[1].dispatchEvent(new Event('change', { bubbles: true }));
    first.render();

    const other = gridWith({ storageKey: 'bucket/refunds.parquet' });

    expect(other.sortButtons()).toHaveLength(3);
  });

  it('remembers nothing at all without a key', () => {
    const first = gridWith();
    first.openColumns();
    first.checkboxes()[1].dispatchEvent(new Event('change', { bubbles: true }));
    first.render();

    expect(gridWith().sortButtons()).toHaveLength(3);
  });

  it('renders normally when storage itself throws, which is what a private window does', () => {
    // Not "returns null" -- the accessor throws. An unwrapped read here would take the whole
    // Data tab down over a remembered column width.
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('site data blocked'); },
      setItem: () => { throw new Error('site data blocked'); },
      removeItem: () => { throw new Error('site data blocked'); },
      clear: () => { throw new Error('site data blocked'); },
      key: () => null,
      length: 0,
    });

    const grid = gridWith({ storageKey: 'bucket/orders.parquet' });
    expect(grid.bodyRows()).toHaveLength(3);

    grid.openColumns();
    expect(() => {
      grid.checkboxes()[1].dispatchEvent(new Event('change', { bubbles: true }));
      grid.render();
    }).not.toThrow();
    expect(grid.sortButtons()).toHaveLength(2);
  });

  it('starts from the dataset\'s own layout when the stored one is unreadable', () => {
    localStorage.setItem('etl.grid.bucket/orders.parquet', 'not json');

    const grid = gridWith({ storageKey: 'bucket/orders.parquet' });

    expect(grid.sortButtons()).toHaveLength(3);
  });
});

describe('copying a cell', () => {
  it('copies with the keyboard alone, which is the half usually left out', async () => {
    const grid = gridWith();

    key(grid.cell(0, 0), 'Enter');
    await settle();
    grid.render();

    expect(written).toEqual(['west']);
    expect(grid.copies.at(-1))
      .toEqual({ row: 0, column: 'region', value: 'west', copied: true });
  });

  it('copies on Ctrl or Cmd + C as well', async () => {
    const grid = gridWith();

    key(grid.cell(1, 1), 'c', { ctrlKey: true });
    await settle();

    expect(written).toEqual(['1200']);
  });

  it('leaves a bare "c" alone, since a cell is not a shortcut surface', async () => {
    const grid = gridWith();

    key(grid.cell(1, 1), 'c');
    await settle();

    expect(written).toEqual([]);
  });

  it('copies nothing for a null cell, and reports the null rather than an empty string', async () => {
    // A null is not a blank. Putting the word "null" on the clipboard would paste a value the
    // file does not contain; putting '' there is honest about there being no text.
    const grid = gridWith();

    key(grid.cell(2, 1), 'Enter');
    await settle();

    expect(written).toEqual(['']);
    expect(grid.copies.at(-1)!.value).toBeNull();
  });

  it('says so when the clipboard refuses, rather than claiming a copy that did not happen', async () => {
    clipboardAccepts = false;
    const grid = gridWith();

    key(grid.cell(0, 0), 'Enter');
    await settle();

    expect(grid.copies.at(-1)!.copied).toBe(false);
  });

  it('names the column it copied, not the position it was in', async () => {
    const grid = gridWith();
    grid.openColumns();
    grid.checkboxes()[0].dispatchEvent(new Event('change', { bubbles: true }));
    grid.render();

    // region is hidden, so screen column 0 is amount. A grid reporting the position would say
    // "region" here and a listener toasting the column name would print the wrong one.
    key(grid.cell(0, 0), 'Enter');
    await settle();

    expect(grid.copies.at(-1)!.column).toBe('amount');
    expect(written).toEqual(['980']);
  });

  it('offers a pointer affordance on the focused cell rather than only on hover', () => {
    const grid = gridWith();
    const cell = grid.cell(0, 0);

    expect(cell.querySelector('button')).toBeNull();

    cell.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    cell.dispatchEvent(new FocusEvent('focus'));
    grid.render();

    // Visible after a tap or a click, not just under a pointer -- a hover-only control is
    // unreachable on a touch screen and invisible to a keyboard.
    expect(grid.cell(0, 0).querySelector('button')?.getAttribute('aria-label'))
      .toBe('Copy region');
  });
});

describe('keyboard navigation over the cells', () => {
  it('puts exactly one cell in the tab order, so Tab reaches the grid and not every cell', () => {
    const grid = gridWith();
    const cells = Array.from(grid.element.querySelectorAll<HTMLElement>('tbody td'));

    expect(cells.filter(cell => cell.getAttribute('tabindex') === '0')).toHaveLength(1);
    expect(grid.cell(0, 0).getAttribute('tabindex')).toBe('0');
  });

  it('moves with the arrow keys and takes the tab stop with it', () => {
    const grid = gridWith();

    key(grid.cell(0, 0), 'ArrowRight');
    grid.render();
    expect(grid.cell(0, 1).getAttribute('tabindex')).toBe('0');
    expect(grid.cell(0, 0).getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(grid.cell(0, 1));

    key(grid.cell(0, 1), 'ArrowDown');
    grid.render();
    expect(grid.cell(1, 1).getAttribute('tabindex')).toBe('0');
  });

  it('stops at the edges instead of wrapping to a row the reader did not ask for', () => {
    const grid = gridWith();

    key(grid.cell(0, 0), 'ArrowLeft');
    key(grid.cell(0, 0), 'ArrowUp');
    grid.render();

    expect(grid.cell(0, 0).getAttribute('tabindex')).toBe('0');
  });

  it('walks a row with Home and End, and the corners with Ctrl held', () => {
    const grid = gridWith();

    key(grid.cell(0, 0), 'End');
    grid.render();
    expect(grid.cell(0, 2).getAttribute('tabindex')).toBe('0');

    key(grid.cell(0, 2), 'Home', { ctrlKey: true });
    grid.render();
    expect(grid.cell(0, 0).getAttribute('tabindex')).toBe('0');

    key(grid.cell(0, 0), 'End', { ctrlKey: true });
    grid.render();
    expect(grid.cell(2, 2).getAttribute('tabindex')).toBe('0');
  });

  it('keeps the tab stop on a real column after one is hidden', () => {
    // Hiding a column shifts every column to its right; a stale index would leave the tab stop
    // past the end of the row, where there is nothing to focus.
    const grid = gridWith();
    key(grid.cell(0, 2), 'ArrowUp');
    grid.render();
    grid.openColumns();
    grid.checkboxes()[1].dispatchEvent(new Event('change', { bubbles: true }));
    grid.render();

    expect(grid.cell(0, 2)).toBeNull();
    expect(grid.cell(0, 1).getAttribute('tabindex')).toBe('0');
  });
});

describe('the table itself', () => {
  it('renders a null as a null and a blank as a blank, because they are different', () => {
    const grid = gridWith({ rows: [['', '0', null]] });

    expect(grid.rowText(0)).toEqual(['', '0', 'null']);
  });

  it('scrolls wide content inside its own box rather than growing the page', () => {
    const grid = gridWith();
    const scroller = grid.element.querySelector('.scroll-table');

    expect(scroller).toBeTruthy();
    expect(scroller!.className).toContain('overflow-x-auto');
  });

  it('carries a caption that says what one page of a large dataset is', () => {
    const grid = gridWith({ totalRows: 1204, filtered: true, datasetRows: 250000 });
    const caption = grid.element.querySelector('caption');

    expect(caption?.className).toContain('sr-only');
    expect(caption?.textContent).toContain('run on the server');
  });

  it('renders no pager of its own, leaving paging to the screen that owns the page number', () => {
    // Pagination already exists above this component and is not re-implemented here; a second
    // Next button that did not know the page number would be the more convincing of the two.
    const grid = gridWith();

    expect(grid.text()).not.toContain('Previous');
    expect(grid.text()).not.toContain('Next');
  });
});
