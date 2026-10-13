import type { FilterClause } from '../analytics.service';
import { readableCell } from '../../../shared/charts/number-format';
import type { PageColumn } from './board-api';

/**
 * A table widget's column filters as the reader types them, and what they become on the wire -- the Canvas's own
 * FilterClause vocabulary, compiled by the server's FilterCompiler against the result's columns. Pure, so each rule is
 * a unit test.
 *
 *   text      "contains"                        CONTAINS value
 *   number    from / to                         NUMERIC_RANGE [from, to], an open bound filled with the column's own
 *   date      from / to                         DATE_RANGE [from, to], the same
 *   select    one of the column's few values    EQ value
 *
 * A range operator takes both bounds, so an open one is filled with the column's lowest or highest value (the first
 * page reads them, TablePage.ranges): "from 100" is "100 to the largest there is", which is what the reader meant.
 *
 * @author Nabeel Ahmed
 */

export type ColumnKind = 'text' | 'number' | 'date' | 'select' | 'other';

export interface ColumnFilter {
  text?: string;
  from?: string;
  to?: string;
  /** The select's one value; '' is all. */
  value?: string;
}

const NUMERIC = /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT|FLOAT|REAL|DOUBLE|DECIMAL|NUMERIC)/i;
const DATE = /^(DATE|TIMESTAMP)/i;
const TEXT = /^(VARCHAR|TEXT|STRING|BOOLEAN)/i;

/** How a column is filtered: a select when the server listed its few values, else by its type. */
export function columnKind(column: PageColumn, facets: Record<string, string[]> | undefined): ColumnKind {
  if (facets?.[column.name]?.length) return 'select';
  if (NUMERIC.test(column.type ?? '')) return 'number';
  if (DATE.test(column.type ?? '')) return 'date';
  if (TEXT.test(column.type ?? '')) return 'text';
  return 'other';
}

/** Whether a column's cells are figures: right-aligned and grouped. */
export function isNumberColumn(column: PageColumn | undefined): boolean {
  return !!column && NUMERIC.test(column.type ?? '');
}

/** Whether a filter holds anything. */
export function isSet(filter: ColumnFilter | undefined): boolean {
  return !!filter && !!((filter.text ?? '').trim() || filter.from || filter.to || filter.value);
}

/**
 * The clauses the reader's column filters stand for. A filter on a column the result no longer has is dropped -- the
 * server would refuse it, and the table should not turn into an error because a saved query changed.
 */
export function clausesOf(filters: Record<string, ColumnFilter>, columns: readonly PageColumn[],
    facets: Record<string, string[]> | undefined, ranges: Record<string, string[]> | undefined): FilterClause[] {
  const clauses: FilterClause[] = [];
  for (const column of columns) {
    const filter = filters[column.name];
    if (!isSet(filter)) continue;
    const kind = columnKind(column, facets);
    if (kind === 'select' && filter!.value) {
      clauses.push({ field: column.name, operator: 'EQ', value: filter!.value });
    } else if (kind === 'text' && filter!.text?.trim()) {
      clauses.push({ field: column.name, operator: 'CONTAINS', value: filter!.text.trim() });
    } else if ((kind === 'number' || kind === 'date') && (filter!.from || filter!.to)) {
      const bounds = ranges?.[column.name] ?? [];
      const low = filter!.from || bounds[0];
      const high = filter!.to || bounds[1];
      if (!low || !high) continue;
      clauses.push({ field: column.name, operator: kind === 'number' ? 'NUMERIC_RANGE' : 'DATE_RANGE', values: [low, high] });
    }
  }
  return clauses;
}

/** A cell as the table shows it: a figure grouped and right-aligned, a null as a dash, everything else as it came. */
export function cellText(value: string | null | undefined, column: PageColumn | undefined): string {
  if (value === null || value === undefined) return '—';
  return isNumberColumn(column) ? readableCell(value) : value;
}

/** "Rows 26–50 of 1,204" / "1,204 of 138,116 rows" -- the footer's words. */
export function pageText(page: number, pageSize: number, shown: number, total: number): string {
  if (!total) return 'No rows';
  const first = page * pageSize + 1;
  const last = page * pageSize + shown;
  return `Rows ${first.toLocaleString()}–${last.toLocaleString()} of ${total.toLocaleString()}`;
}

/** The next sort for a click on a heading: ascending, then descending, then none. */
export function nextSort(current: { column: string; direction: 'ASC' | 'DESC' } | null, column: string):
    { column: string; direction: 'ASC' | 'DESC' } | null {
  if (!current || current.column !== column) return { column, direction: 'ASC' };
  return current.direction === 'ASC' ? { column, direction: 'DESC' } : null;
}

/** A layout a viewer keeps for one table: the columns they hid and how many rows a page holds. */
export interface TableLayout { hidden: string[]; pageSize: number }

export const PAGE_SIZES = [10, 25, 50, 100];

export function readLayout(key: string): TableLayout {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
    const hidden = Array.isArray(saved?.hidden) ? saved.hidden.filter((c: unknown) => typeof c === 'string') : [];
    const pageSize = PAGE_SIZES.includes(saved?.pageSize) ? saved.pageSize : 25;
    return { hidden, pageSize };
  } catch {
    return { hidden: [], pageSize: 25 };
  }
}

export function writeLayout(key: string, layout: TableLayout): void {
  try { localStorage.setItem(key, JSON.stringify(layout)); } catch { /* not remembered */ }
}
