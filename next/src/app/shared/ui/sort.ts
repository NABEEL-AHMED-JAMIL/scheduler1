import { Signal, computed, signal } from '@angular/core';
import { instantMs } from '../../core/instant';
import { storedViewerId } from '../../core/auth/auth.service';
import { statusRank } from './status-pill';

export type SortDirection = 'asc' | 'desc';

/**
 * How a column's values compare (owner 2026-10-27, "add a sort on each table"):
 * - text: locale-aware and case-insensitive, with numbers inside words in number order ("Job 9" before "Job 10");
 * - number: numerically (a numeric string counts as its number);
 * - date: as instants, through instantOf -- the services send naive Chicago wall-clock times and +00:00 / Z forms
 *   side by side, so two timestamps are never compared as strings;
 * - bool: no before yes (true/false, yes/no, on/off, 1/0);
 * - status: by the chip's tone (problems first, then in progress, waiting, done: statusRank), or by the column's own
 *   `order`, then by the word;
 * - auto: numbers when both values read as numbers, instants when both read as timestamps, text otherwise -- for the
 *   grids whose columns come from the data.
 */
export type SortKind = 'text' | 'number' | 'date' | 'bool' | 'status' | 'auto';

export interface SortColumn<T> {
  /** The value the column sorts by: the raw field, not the formatted cell ("1.2 MB" sorts as 1,200,000 bytes). */
  readonly value: (row: T) => unknown;
  readonly kind?: SortKind;
  /** The direction a first click picks. Default: newest / largest first for dates and numbers, A to Z otherwise. */
  readonly first?: SortDirection;
  /** For a status column: the words in the order they sort, before any word not listed. Case does not matter. */
  readonly order?: readonly string[];
  /** For a table sorted by the server: the column name the API's allow-list knows it by (default: the key). */
  readonly param?: string;
  /** Why the column cannot be sorted right now ('' when it can): the header then says so instead of sorting. */
  readonly blocked?: () => string;
}

export interface SortState {
  readonly key: string;
  readonly direction: SortDirection;
}

export interface TableSortOptions<T> {
  /** Where the choice is remembered, per viewer: a short stable name for the table ("users", "run-items"). */
  readonly id: string;
  /** The sortable columns by key. A plain function is a text column read by it. */
  readonly columns: Readonly<Record<string, SortColumn<T> | ((row: T) => unknown)>>;
  /**
   * The order the table shows today, so nothing moves on load: a column and direction, or null when the rows keep the
   * order they arrive in (the API's, or the steps' own). Rows that tie keep that arrival order too (the sort is stable).
   */
  readonly initial?: SortState | null;
  /**
   * The server sorts (a paged list): apply() hands the rows back untouched and `param()` is what the request carries.
   * The screen reads again in `onChange`.
   */
  readonly server?: boolean;
  /** Called after the viewer picks a new order (not when a remembered one is restored): a server-sorted list reloads. */
  readonly onChange?: (state: SortState) => void;
  /**
   * A line every sortable header carries as its tooltip, e.g. "Sorts the newest 200 shown" for a list that holds a
   * fixed window of the newest rows (owner 2026-10-27: say what a sort covers when it is not everything).
   */
  readonly note?: string;
  /** False to not remember the choice (a list inside a dialog that opens fresh each time). Default true. */
  readonly remember?: boolean;
  /**
   * For a grid whose columns come from the data (a query result, a file preview): the column for a key not in
   * `columns`, or null when there is no such column. Typically `k => ({ value: row => row[k], kind: 'auto' })`.
   */
  readonly dynamic?: (key: string) => SortColumn<T> | null;
}

export interface TableSort<T> {
  readonly key: Signal<string>;
  readonly direction: Signal<SortDirection>;
  /** The current order as one value, for an effect or a request. */
  readonly state: Signal<SortState>;
  readonly note: string;
  /** Whether the column takes part in sorting at all. */
  sortable(key: string): boolean;
  /** Why the column cannot sort now, or ''. */
  blockedReason(key: string): string;
  /**
   * A click on a heading: another column sorts in its first direction; the sorted column flips; a third click on it
   * goes back to the table's own order (its initial sort, or the order the rows came in).
   */
  toggle(key: string): void;
  /** Back to the table's own order, forgetting the remembered choice. */
  reset(): void;
  /** Sets the order directly (a "Sort by" select beside the cards view); remembered like a click. */
  set(state: SortState): void;
  /** The header's aria-sort: only the sorted column says ascending or descending. */
  ariaSort(key: string): 'ascending' | 'descending' | null;
  iconFor(key: string): 'sort' | 'arrowUp' | 'arrowDown';
  /** A sorted copy of the rows (server tables: the rows as given). */
  apply(rows: readonly T[]): T[];
  /** The two rows' order under the current sort, for a screen that sorts inside its own groups. 0 when unsorted. */
  compare(a: T, b: T): number;
  /** What a server-sorted request carries: the allow-listed column name and dir, or null for the server's own order. */
  param(): { sort: string; dir: SortDirection } | null;
}

const COLLATOR = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** No value: null, undefined, NaN, an empty or blank string, or the dash a cell draws for nothing. */
export function isEmptySortValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'number') return Number.isNaN(value);
  if (typeof value === 'string') return /^\s*(|[—–-])\s*$/.test(value);
  if (value instanceof Date) return Number.isNaN(value.getTime());
  return false;
}

function numberOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const t = value.trim().replace(/,/g, '');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return null;
}

function instantOfValue(value: unknown): number | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return instantMs(value);
  return null;
}

const ISO_LIKE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?([zZ]|[+-]\d{2}:?\d{2})?)?$/;

function boolOf(value: unknown): number | null {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value ? 1 : 0;
  const t = String(value).trim().toLowerCase();
  if (['true', 'yes', 'y', 'on', '1', 'enabled', 'active'].includes(t)) return 1;
  if (['false', 'no', 'n', 'off', '0', 'disabled', 'inactive'].includes(t)) return 0;
  return null;
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') { try { return JSON.stringify(value); } catch { return String(value); } }
  return String(value);
}

/**
 * Compares two filled values of one kind, ascending. Callers deal with empty values first (they always go last).
 * Values that do not read as the kind (a word in a number column) sort after the ones that do, by their text.
 */
export function compareSortValues(left: unknown, right: unknown, kind: SortKind = 'auto', order?: readonly string[]): number {
  switch (kind) {
    case 'number': return compareParsed(numberOf(left), numberOf(right), left, right);
    case 'date': return compareParsed(instantOfValue(left), instantOfValue(right), left, right);
    case 'bool': return compareParsed(boolOf(left), boolOf(right), left, right);
    case 'status': {
      const rank = (v: unknown) => {
        const word = textOf(v).toLowerCase();
        if (order?.length) {
          const at = order.findIndex(o => o.toLowerCase() === word);
          return at >= 0 ? at : order.length + statusRank(word);
        }
        return statusRank(word);
      };
      return (rank(left) - rank(right)) || COLLATOR.compare(textOf(left), textOf(right));
    }
    case 'text': return COLLATOR.compare(textOf(left), textOf(right));
    case 'auto': default: {
      const ln = numberOf(left), rn = numberOf(right);
      if (ln !== null && rn !== null && typeof left !== 'boolean') return ln - rn;
      if (typeof left === 'string' && typeof right === 'string' && ISO_LIKE.test(left.trim()) && ISO_LIKE.test(right.trim())) {
        return compareParsed(instantOfValue(left), instantOfValue(right), left, right);
      }
      if (typeof left === 'boolean' && typeof right === 'boolean') return Number(left) - Number(right);
      return COLLATOR.compare(textOf(left), textOf(right));
    }
  }
}

function compareParsed(l: number | null, r: number | null, left: unknown, right: unknown): number {
  if (l !== null && r !== null) return l - r;
  if (l !== null) return -1;
  if (r !== null) return 1;
  return COLLATOR.compare(textOf(left), textOf(right));
}

/**
 * Which band a value sorts in, whichever the direction: 0 a value of the column's kind, 1 a filled value that does not
 * read as that kind (a word in a number column), 2 no value at all.
 */
function tierOf(value: unknown, kind: SortKind): number {
  if (isEmptySortValue(value)) return 2;
  if (kind === 'number') return numberOf(value) === null ? 1 : 0;
  if (kind === 'date') return instantOfValue(value) === null ? 1 : 0;
  if (kind === 'bool') return boolOf(value) === null ? 1 : 0;
  return 0;
}

/**
 * Sorts a copy of the rows, stably: rows that tie keep the order they came in. Empty values go last in BOTH
 * directions -- "no value" is not smaller or larger than a value, it is missing.
 */
export function sortRows<T>(rows: readonly T[], value: (row: T) => unknown, direction: SortDirection,
                            kind: SortKind = 'auto', order?: readonly string[]): T[] {
  const factor = direction === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, v: value(row) }))
    .sort((a, b) => {
      const at = tierOf(a.v, kind), bt = tierOf(b.v, kind);
      if (at !== bt) return at - bt;
      if (at === 2) return a.index - b.index;
      return (compareSortValues(a.v, b.v, kind, order) * factor) || (a.index - b.index);
    })
    .map(entry => entry.row);
}

const STORE_PREFIX = 'etl_table_sort:';

function readStored(id: string): SortState | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_PREFIX + storedViewerId() + ':' + id) ?? 'null');
    if (raw && typeof raw.key === 'string' && (raw.direction === 'asc' || raw.direction === 'desc')) return raw;
  } catch { /* nothing remembered */ }
  return null;
}

function writeStored(id: string, state: SortState | null): void {
  try {
    const at = STORE_PREFIX + storedViewerId() + ':' + id;
    if (state) localStorage.setItem(at, JSON.stringify(state)); else localStorage.removeItem(at);
  } catch { /* not remembered: private window or blocked storage */ }
}

/**
 * Column sorting for a table (owner 2026-10-27): typed comparisons, empty values last both ways, a stable order, the
 * viewer's choice remembered per table, and a default that matches the order the table shows today. A helper rather
 * than a component so each table keeps its own markup; the heading is `<th appSort="key" [sortBy]="sort">` (SortHeader,
 * shared/ui/sort-header.ts), a real button inside the th with aria-sort on the th.
 */
export function createTableSort<T>(options: TableSortOptions<T>): TableSort<T> {
  const columns = new Map<string, SortColumn<T>>(
    Object.entries(options.columns).map(([k, c]) => [k, typeof c === 'function' ? { value: c, kind: 'text' } : c]));
  const col = (k: string): SortColumn<T> | undefined => (k ? columns.get(k) ?? options.dynamic?.(k) ?? undefined : undefined);
  const initial: SortState = options.initial && col(options.initial.key)
    ? options.initial : { key: '', direction: 'asc' };
  const remember = options.remember !== false;
  const stored = remember ? readStored(options.id) : null;
  const start = stored && (stored.key === '' || col(stored.key)) ? stored : initial;

  const key = signal(start.key);
  const direction = signal<SortDirection>(start.direction);
  const state = computed<SortState>(() => ({ key: key(), direction: direction() }));

  const firstOf = (k: string): SortDirection => {
    const c = col(k);
    if (c?.first) return c.first;
    return c?.kind === 'date' || c?.kind === 'number' ? 'desc' : 'asc';
  };
  const opposite = (d: SortDirection): SortDirection => (d === 'asc' ? 'desc' : 'asc');
  const blockedReason = (k: string) => col(k)?.blocked?.() ?? '';

  function set(next: SortState): void {
    key.set(next.key);
    direction.set(next.direction);
    if (remember) {
      writeStored(options.id, next.key === initial.key && next.direction === initial.direction ? null : next);
    }
    options.onChange?.(next);
  }

  function toggle(k: string): void {
    if (!col(k) || blockedReason(k)) return;
    if (key() !== k) { set({ key: k, direction: firstOf(k) }); return; }
    if (direction() === firstOf(k)) { set({ key: k, direction: opposite(direction()) }); return; }
    // The third click: back to the table's own order -- unless that order is this very column, which then just flips.
    set(initial.key && initial.key !== k ? initial : initial.key === k
      ? { key: k, direction: opposite(direction()) } : { key: '', direction: 'asc' });
  }

  function compare(a: T, b: T): number {
    const c = col(key());
    if (!c) return 0;
    const av = c.value(a), bv = c.value(b);
    const kind = c.kind ?? 'auto';
    const at = tierOf(av, kind), bt = tierOf(bv, kind);
    if (at !== bt) return at - bt;
    if (at === 2) return 0;
    return compareSortValues(av, bv, kind, c.order) * (direction() === 'asc' ? 1 : -1);
  }

  return {
    key: key.asReadonly(),
    direction: direction.asReadonly(),
    state,
    note: options.note ?? '',
    sortable: k => !!col(k),
    blockedReason,
    toggle,
    reset: () => set(initial),
    set: next => { if (next.key === '' || (col(next.key) && !blockedReason(next.key))) set(next); },
    ariaSort: k => (key() === k && col(k) ? (direction() === 'asc' ? 'ascending' : 'descending') : null),
    iconFor: k => (key() !== k ? 'sort' : direction() === 'asc' ? 'arrowUp' : 'arrowDown'),
    apply(rows: readonly T[]): T[] {
      const c = col(key());
      if (options.server || !c || blockedReason(key())) return [...rows];
      return sortRows(rows, c.value, direction(), c.kind ?? 'auto', c.order);
    },
    compare,
    param() {
      const c = col(key());
      return c ? { sort: c.param ?? key(), dir: direction() } : null;
    },
  };
}

/**
 * The first sort helper, kept for screens not yet moved to createTableSort: same comparisons (locale-aware text,
 * numbers, empty values last both ways, stable), with the column read by a callback per call.
 */
export function createSort<T>(initialKey = '', initialDirection: SortDirection = 'asc') {
  const key = signal(initialKey);
  const direction = signal<SortDirection>(initialDirection);

  function toggle(nextKey: string): void {
    if (key() === nextKey) {
      direction.update(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      key.set(nextKey);
      direction.set('asc');
    }
  }

  /** Glyph name for a column header: which way it sorts, or that it can be sorted at all. */
  function iconFor(forKey: string): 'sort' | 'arrowUp' | 'arrowDown' {
    if (key() !== forKey) return 'sort';
    return direction() === 'asc' ? 'arrowUp' : 'arrowDown';
  }

  function indicator(forKey: string): '' | '↑' | '↓' {
    if (key() !== forKey) return '';
    return direction() === 'asc' ? '↑' : '↓';
  }

  function apply(rows: T[], valueOf: (row: T, key: string) => unknown): T[] {
    const activeKey = key();
    if (!activeKey) return rows;
    return sortRows(rows, row => valueOf(row, activeKey), direction(), 'auto');
  }

  return { key: key as Signal<string>, direction: direction as Signal<SortDirection>, toggle, indicator, iconFor, apply };
}
