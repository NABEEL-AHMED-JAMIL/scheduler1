import type { WidgetView } from '../dashboard';
import { SERVER_ZONE, instantOf } from '../../../core/instant';

/**
 * A result as the ECharts kinds read it: which columns are dimensions, which are numbers, and
 * what the question said about adding up and about order.
 *
 * Built from the SAME WidgetView every other kind reads -- a kind is a way of looking at one
 * answer -- but kept apart from `marks`, because marks flatten every dimension into one label and
 * keep one number. A sankey needs its two dimensions apart, and a bubble needs three numbers.
 *
 * Pure and Angular-free, so the fit rules and the option builders over it are tested without a
 * browser, a canvas or a component.
 *
 * @author Nabeel Ahmed
 */

export interface TableDim {
  name: string;
  /** One per kept row; a null cell is '(null)', the label the marks give it. */
  values: string[];
  /** Every value reads as a calendar date or a date-time. */
  date: boolean;
  /** Every value reads as a number, so it can be an axis of quantities. */
  numeric: boolean;
}

export interface TableMeasure {
  name: string;
  /** One per kept row. Null where that row's cell is not a number. */
  values: (number | null)[];
}

/** Whether the figures add up: known yes, known no, or (a saved statement) nobody can say. */
export type Additivity = boolean | 'unknown';

/** The order the rows arrived in: the dimension's own, biggest-first, or the dimension backwards. */
export type RowOrder = 'dimension' | 'rank' | 'reversed';

export interface ChartTable {
  dims: TableDim[];
  /** In column order. The PRIMARY measure -- the one the marks draw -- is the last. */
  measures: TableMeasure[];
  /** Kept rows: those whose primary measure is a number. */
  length: number;
  additive: Additivity;
  order: RowOrder;
  topNTrimmed: boolean;
  /** Why there is nothing to draw, when length is 0. */
  emptyReason: string;
}

export interface TableContext {
  additive: Additivity;
  order?: RowOrder;
  topNTrimmed?: boolean;
  emptyReason?: string;
}

/** A number from a cell, or null. Number('') is 0, which would turn an absent value into a zero. */
export function cellNumber(text: string | null | undefined): number | null {
  if (text === null || text === undefined) return null;
  const trimmed = String(text).trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

const DATE_LIKE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?(?:Z|[+-]\d{2}:?\d{2})?$/;

function readsAsDate(values: (string | null)[]): boolean {
  const present = values.filter((value): value is string => value !== null && value !== '');
  return present.length > 0 && present.every(value => DATE_LIKE.test(value.trim()) && instantOf(value) !== null);
}

function readsAsNumbers(values: (string | null)[]): boolean {
  const present = values.filter(value => value !== null && String(value).trim() !== '');
  return present.length > 0 && present.every(value => cellNumber(value) !== null);
}

/**
 * The calendar day a date or date-time falls on, as yyyy-mm-dd, read through instantOf rather
 * than by cutting the string: a value with an offset can fall on a different day in the zone the
 * server keeps its clock in, and a cut would put it on the wrong square of a calendar.
 */
export function dayKey(text: string): string | null {
  const moment = instantOf(text);
  if (!moment) return null;
  const hasTime = /\d{2}:\d{2}/.test(text);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: hasTime ? SERVER_ZONE : 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(moment);
}

/**
 * Splits a view into dimensions and measures.
 *
 * An analysis says which is which (measureColumn). A saved statement does not -- every column is
 * marked a measure there -- so the split is read from the values, by the rule queryView already
 * uses for its marks: the first column with no numbers names the rows (or the first column, when
 * every column parses), any other text column is a further dimension, and the numeric columns are
 * the measures, the last of them the primary one.
 */
export function tableOf(view: WidgetView, context: TableContext): ChartTable {
  // Names, whatever the caller handed over: a column is a string on the wire, and an object with a
  // name in some older callers' hands. A chart must not be the thing that throws over it.
  const columns = (view.columns ?? []).map(column =>
    typeof column === 'string' ? column : String((column as { name?: unknown })?.name ?? column));
  const rows = view.rows ?? [];
  const cells = (index: number) => rows.map(row => row[index] ?? null);
  const flagged = view.measureColumn ?? columns.map(() => true);
  let dimAt: number[];
  let measureAt: number[];
  if (flagged.some(isMeasure => !isMeasure)) {
    dimAt = columns.map((_, i) => i).filter(i => !flagged[i]);
    measureAt = columns.map((_, i) => i).filter(i => flagged[i]);
  } else {
    const numeric = columns.map((_, i) => readsAsNumbers(cells(i)));
    const label = columns.length < 2 ? -1 : Math.max(0, numeric.findIndex(isNumber => !isNumber));
    dimAt = columns.map((_, i) => i).filter(i => i === label || (!numeric[i] && label >= 0));
    measureAt = columns.map((_, i) => i).filter(i => numeric[i] && i !== label);
  }
  const primaryAt = measureAt[measureAt.length - 1];
  const kept = primaryAt === undefined ? [] : rows.filter(row => cellNumber(row[primaryAt]) !== null);
  const dims: TableDim[] = dimAt.map(index => {
    const raw = kept.map(row => row[index] ?? null);
    return {
      name: columns[index],
      values: raw.map(value => (value === null || value === '' ? '(null)' : String(value))),
      date: readsAsDate(raw),
      numeric: readsAsNumbers(raw) && raw.every(value => value !== null),
    };
  });
  const measures: TableMeasure[] = measureAt.map(index => ({
    name: columns[index],
    values: kept.map(row => cellNumber(row[index])),
  }));
  return {
    dims, measures, length: kept.length,
    additive: context.additive,
    order: context.order ?? 'dimension',
    topNTrimmed: !!context.topNTrimmed,
    emptyReason: context.emptyReason
      ?? (!rows.length ? 'This returned no rows.' : 'No row here has a number to draw.'),
  };
}

/** The measure the marks draw: the last numeric column. */
export function primary(table: ChartTable): TableMeasure | undefined {
  return table.measures[table.measures.length - 1];
}

/** The primary measure's values, every one a number by construction. */
export function figures(table: ChartTable): number[] {
  return (primary(table)?.values ?? []).map(value => value ?? 0);
}

/** A row's dimensions joined the way a mark names them. */
export function rowLabel(table: ChartTable, row: number): string {
  return table.dims.map(dim => dim.values[row]).join(' · ') || primary(table)?.name || '';
}

/**
 * The columns that are quantities, numeric dimensions first: what a scatter puts on its axes.
 * A dimension of years is a quantity; an analysis grouped by one hands it over as a dimension.
 */
export function quantities(table: ChartTable): { name: string; values: (number | null)[] }[] {
  return [
    ...table.dims.filter(dim => dim.numeric).map(dim => ({ name: dim.name, values: dim.values.map(cellNumber) })),
    ...table.measures,
  ];
}

/** Distinct values of one dimension, in the order they first appear. */
export function distinct(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * A two-dimension result as a grid: the first dimension across, the second as series, the
 * primary measure in the cells. Duplicate pairs are added, which is the marks' rule too.
 */
export function grid(table: ChartTable): { xs: string[]; series: string[]; cell: (number | null)[][] } {
  const [across, by] = table.dims;
  const values = figures(table);
  const xs = distinct(across?.values ?? []);
  const series = distinct(by?.values ?? []);
  const xAt = new Map(xs.map((x, i) => [x, i]));
  const sAt = new Map(series.map((s, i) => [s, i]));
  const cell: (number | null)[][] = series.map(() => xs.map(() => null));
  for (let row = 0; row < table.length; row++) {
    const s = sAt.get(by.values[row])!;
    const x = xAt.get(across.values[row])!;
    cell[s][x] = (cell[s][x] ?? 0) + values[row];
  }
  return { xs, series, cell };
}

/**
 * The table re-ordered, cut to its top N, and with the rest added into one "Other" row.
 *
 * Only for a result with at most one dimension: cutting a two-dimension result by row would take
 * some regions out of one month and not out of the next. "Other" is only added where the figures
 * add up -- a sum of averages is not a figure -- and otherwise the tail is dropped and the caller
 * says so (`dropped`).
 */
export function sortAndCut(table: ChartTable, sort: 'none' | 'asc' | 'desc', topN: number | null,
    withOther: boolean): { table: ChartTable; dropped: number; other: boolean } {
  if (table.dims.length > 1 || (sort === 'none' && !topN)) return { table, dropped: 0, other: false };
  const values = figures(table);
  let order = values.map((_, i) => i);
  const direction = sort !== 'none' ? sort : topN ? 'desc' : 'none';
  if (direction === 'desc') order.sort((a, b) => values[b] - values[a]);
  if (direction === 'asc') order.sort((a, b) => values[a] - values[b]);
  let dropped = 0;
  let other = false;
  let otherSum = 0;
  if (topN && topN > 0 && order.length > topN) {
    // A row the server already rolled up ("Other" from a Top-N with the bucket on) joins the new
    // tail rather than standing beside it: two slices called Other would each be half the truth.
    if (withOther && table.additive === true && table.dims.length === 1) {
      const rolled = order.filter(i => table.dims[0].values[i] === 'Other');
      if (rolled.length) order = [...order.filter(i => table.dims[0].values[i] !== 'Other'), ...rolled];
    }
    const tail = order.slice(topN);
    dropped = tail.length;
    if (withOther && table.additive === true) {
      other = true;
      otherSum = tail.reduce((sum, i) => sum + values[i], 0);
    }
    order = order.slice(0, topN);
  }
  const pick = <T>(list: T[], extra: T): T[] => [...order.map(i => list[i]), ...(other ? [extra] : [])];
  return {
    dropped, other,
    table: {
      ...table,
      length: order.length + (other ? 1 : 0),
      order: direction === 'none' ? table.order : 'rank',
      dims: table.dims.map(dim => ({ ...dim, values: pick(dim.values, 'Other'), date: dim.date && !other })),
      measures: table.measures.map((measure, at) => ({
        ...measure,
        values: pick(measure.values, at === table.measures.length - 1 ? otherSum : null),
      })),
    },
  };
}
