import type { DateRange, RangePreset } from '../../../shared/ui/date-range';
import { presetRange } from '../../../shared/ui/date-range';
import type { Mark } from '../widget-view';

/**
 * A dashboard's filter bar, as data: what the board's editor defined, what a reader chose, and how the two travel --
 * to the server with every tile's run, into the URL so a filtered board is a link, and into the reader's own storage
 * so the board opens the way they left it.
 *
 * Pure and Angular-free, so every rule here is a unit test rather than a screen to click through.
 *
 *   - A filter is DEFINED on the board (dashboard_config.filters): a key, a label, the column names it lands on (the
 *     first a tile's dataset has wins -- "admitted" in one file, "issue_date" in another), and where its picker reads
 *     its values from.
 *   - A reader SETS values (a multi-select) or a date range. Only what is set travels; a cleared chip is nothing.
 *   - The SERVER applies them -- before each tile's own statement, values bound -- and says per tile what each did
 *     (BoardFilterOutcome). A tile shows "Filtered" when one landed, and names the ones that could not.
 *
 * @author Nabeel Ahmed
 */

export type FilterFamily = 'text' | 'number' | 'boolean' | 'date';

/** Where a filter's picker reads its values: one dataset's column. */
export interface FilterSource { connection: string; path: string; column: string }

/** One filter as the board's editor defined it. */
export interface BoardFilterDef {
  /** Unique on the board; the URL parameter and the outcome's key. Letters, digits, '_', '.', ':' or '-'. */
  key: string;
  label: string;
  kind: 'values' | 'date';
  /** The column names it may land on, in order of preference. */
  columns: string[];
  /** The family the values were read from; the server applies a values filter only to a column of the same one. */
  family?: FilterFamily;
  /** Where the picker lists values from (a values filter). */
  source?: FilterSource;
  /** A date filter's range when the reader has not chosen one. Absent: all time. */
  defaultPreset?: RangePreset;
  /**
   * The column's values, most frequent first, as the editor saved the filter: each takes one colour on every tile
   * (charts/board-colors.ts). Kept with the definition so a board's colours do not move as its data does.
   */
  colorOrder?: string[];
}

/** What a reader has set: values per filter key, and the date range (null: all time). */
export interface BoardFilterState {
  values: Record<string, string[]>;
  range: DateRange | null;
}

/** One filter as a tile's run carries it to the server (analytics-service BoardFilter). */
export interface BoardFilterWire {
  key: string;
  columns: string[];
  family?: FilterFamily;
  values?: string[];
  from?: string;
  to?: string;
}

/** What one filter did to one tile (analytics-service BoardFilterOutcome). */
export interface BoardFilterOutcome {
  key: string;
  applied: boolean;
  column?: string;
  reason?: string;
}

const KEY = /^[A-Za-z0-9_.:-]{1,64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const FAMILIES: ReadonlySet<string> = new Set(['text', 'number', 'boolean', 'date']);
const PRESETS: ReadonlySet<string> = new Set(['today', '7d', '30d', 'month', '90d', '12m', 'ytd', 'all', 'custom']);
/** As the server holds them (BoardFilter.MAX_*). */
export const MAX_BOARD_FILTERS = 12;
export const MAX_FILTER_VALUES = 500;

/** The empty state: nothing chosen, all time. */
export function emptyFilterState(): BoardFilterState {
  return { values: {}, range: null };
}

/**
 * The filters a board's config defines, each held to its shape; anything malformed is left out rather than trusted,
 * because a board that throws while reading its own config shows nothing at all.
 */
export function parseFilterDefs(raw: unknown): BoardFilterDef[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const defs: BoardFilterDef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const key = typeof o['key'] === 'string' ? o['key'].trim() : '';
    if (!KEY.test(key) || seen.has(key)) continue;
    const kind = o['kind'] === 'date' ? 'date' : o['kind'] === 'values' ? 'values' : null;
    if (!kind) continue;
    const columns = Array.isArray(o['columns'])
      ? (o['columns'] as unknown[]).filter((c): c is string => typeof c === 'string' && !!c.trim()).map(c => c.trim()).slice(0, 8)
      : [];
    if (!columns.length) continue;
    const label = typeof o['label'] === 'string' && o['label'].trim() ? o['label'].trim().slice(0, 60) : key;
    const def: BoardFilterDef = { key, label, kind, columns };
    if (typeof o['family'] === 'string' && FAMILIES.has(o['family'])) def.family = o['family'] as FilterFamily;
    const src = o['source'] as Record<string, unknown> | undefined;
    if (src && typeof src === 'object' && typeof src['connection'] === 'string' && typeof src['path'] === 'string'
        && typeof src['column'] === 'string') {
      def.source = { connection: src['connection'], path: src['path'], column: src['column'] };
    }
    if (typeof o['defaultPreset'] === 'string' && PRESETS.has(o['defaultPreset']) && o['defaultPreset'] !== 'custom') {
      def.defaultPreset = o['defaultPreset'] as RangePreset;
    }
    if (Array.isArray(o['colorOrder'])) {
      const order = (o['colorOrder'] as unknown[]).filter((v): v is string => typeof v === 'string').slice(0, 24);
      if (order.length) def.colorOrder = order;
    }
    seen.add(key);
    defs.push(def);
    if (defs.length >= MAX_BOARD_FILTERS) break;
  }
  return defs;
}

/** The board's one date filter, if it has one (the bar draws one date-range control). */
export function dateFilterOf(defs: readonly BoardFilterDef[]): BoardFilterDef | null {
  return defs.find(def => def.kind === 'date') ?? null;
}

/** The range a board opens on when nothing else says: the date filter's default, else all time. */
export function defaultRange(defs: readonly BoardFilterDef[], today: Date = new Date()): DateRange | null {
  const preset = dateFilterOf(defs)?.defaultPreset;
  if (!preset || preset === 'all') return null;
  return { ...presetRange(preset, today), preset };
}

/** What every tile's run carries: the filters that are on, and nothing for the ones that are not. */
export function wireFilters(defs: readonly BoardFilterDef[], state: BoardFilterState): BoardFilterWire[] {
  const wire: BoardFilterWire[] = [];
  for (const def of defs) {
    if (def.kind === 'date') {
      const range = state.range;
      if (!range || (!range.from && !range.to)) continue;
      const one: BoardFilterWire = { key: def.key, columns: def.columns };
      if (range.from) one.from = range.from;
      if (range.to) one.to = range.to;
      wire.push(one);
      continue;
    }
    const values = state.values[def.key] ?? [];
    if (!values.length) continue;
    const one: BoardFilterWire = { key: def.key, columns: def.columns, values: values.slice(0, MAX_FILTER_VALUES) };
    if (def.family) one.family = def.family;
    wire.push(one);
  }
  return wire;
}

/** How many filters are on: what the bar's "Clear all" and a tile's marker count. */
export function activeCount(defs: readonly BoardFilterDef[], state: BoardFilterState): number {
  return wireFilters(defs, state).length;
}

/** One value added to or taken from a filter: a click on a bar, or a box in the picker. */
export function toggleValue(state: BoardFilterState, key: string, value: string): BoardFilterState {
  const now = state.values[key] ?? [];
  const next = now.includes(value) ? now.filter(v => v !== value) : [...now, value];
  return withValues(state, key, next);
}

/** A filter's values replaced (an empty list clears it). */
export function withValues(state: BoardFilterState, key: string, values: string[]): BoardFilterState {
  const copy = { ...state.values };
  if (values.length) copy[key] = [...new Set(values)].slice(0, MAX_FILTER_VALUES); else delete copy[key];
  return { ...state, values: copy };
}

// ---- the URL: a filtered board is a link -------------------------------------------------------------------------

/** The query parameter a filter's values travel in: "f.department". */
export function paramOf(key: string): string {
  return 'f.' + key;
}

/**
 * The state as query parameters, every filter of the board named -- null for one that is off, so a navigation that
 * merges parameters clears what the reader cleared. A rolling range travels as its preset ("range=90d") so the link
 * keeps meaning "the last ninety days"; a custom one as its two days.
 */
export function stateToParams(defs: readonly BoardFilterDef[], state: BoardFilterState): Record<string, string | string[] | null> {
  const params: Record<string, string | string[] | null> = {};
  for (const def of defs) {
    if (def.kind === 'values') {
      const values = state.values[def.key] ?? [];
      params[paramOf(def.key)] = values.length ? values : null;
    }
  }
  if (dateFilterOf(defs)) {
    const range = state.range;
    if (!range) {
      params['range'] = 'all';
      params['from'] = null;
      params['to'] = null;
    } else if (range.preset === 'custom') {
      params['range'] = null;
      params['from'] = range.from || null;
      params['to'] = range.to || null;
    } else {
      params['range'] = range.preset;
      params['from'] = null;
      params['to'] = null;
    }
  }
  return params;
}

/** The read side of a URL: what getAll / get answer for a parameter. */
export interface ParamReader {
  getAll(name: string): string[];
  get(name: string): string | null;
  has(name: string): boolean;
}

/**
 * The state a URL names, or null when it names none of this board's filters (the board then opens on the reader's
 * remembered state, or its defaults). A value or a day that does not parse is dropped, never guessed at.
 */
export function stateFromParams(defs: readonly BoardFilterDef[], params: ParamReader, today: Date = new Date()): BoardFilterState | null {
  let named = false;
  const values: Record<string, string[]> = {};
  for (const def of defs) {
    if (def.kind !== 'values' || !params.has(paramOf(def.key))) continue;
    named = true;
    const chosen = params.getAll(paramOf(def.key)).filter(v => v.length <= 400).slice(0, MAX_FILTER_VALUES);
    if (chosen.length) values[def.key] = [...new Set(chosen)];
  }
  let range: DateRange | null = null;
  if (dateFilterOf(defs) && (params.has('range') || params.has('from') || params.has('to'))) {
    named = true;
    const preset = params.get('range');
    const from = params.get('from') ?? '';
    const to = params.get('to') ?? '';
    if (preset && PRESETS.has(preset) && preset !== 'custom' && preset !== 'all') {
      range = { ...presetRange(preset as RangePreset, today), preset: preset as RangePreset };
    } else if (preset !== 'all' && (DAY.test(from) || DAY.test(to)) && (!DAY.test(from) || !DAY.test(to) || from <= to)) {
      range = { from: DAY.test(from) ? from : '', to: DAY.test(to) ? to : '', preset: 'custom' };
    }
  }
  return named ? { values, range } : null;
}

// ---- remembered per viewer ---------------------------------------------------------------------------------------

/** The storage key of one viewer's filters on one board. */
export function stateKey(boardId: number, viewer: string | number | null | undefined): string {
  return `etl.board-filters.${boardId}.${viewer ?? 'anon'}`;
}

export function saveState(key: string, state: BoardFilterState): void {
  const range = state.range && state.range.preset !== 'custom' ? { preset: state.range.preset } : state.range;
  try { localStorage.setItem(key, JSON.stringify({ values: state.values, range })); } catch { /* not remembered */ }
}

/** A viewer's remembered state for this board, held to the board's filters as they are now; null when none. */
export function restoreState(key: string, defs: readonly BoardFilterDef[], today: Date = new Date()): BoardFilterState | null {
  let saved: unknown = null;
  try { saved = JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { saved = null; }
  if (!saved || typeof saved !== 'object') return null;
  const o = saved as { values?: Record<string, unknown>; range?: Record<string, unknown> | null };
  const values: Record<string, string[]> = {};
  for (const def of defs) {
    const raw = o.values?.[def.key];
    if (def.kind === 'values' && Array.isArray(raw)) {
      const kept = raw.filter((v): v is string => typeof v === 'string').slice(0, MAX_FILTER_VALUES);
      if (kept.length) values[def.key] = kept;
    }
  }
  let range: DateRange | null = null;
  const r = o.range;
  if (r && typeof r === 'object' && typeof r['preset'] === 'string' && PRESETS.has(r['preset'])) {
    const preset = r['preset'] as RangePreset;
    if (preset === 'custom') {
      const from = typeof r['from'] === 'string' && DAY.test(r['from']) ? r['from'] : '';
      const to = typeof r['to'] === 'string' && DAY.test(r['to']) ? r['to'] : '';
      range = from || to ? { from, to, preset } : null;
    } else if (preset !== 'all') {
      range = { ...presetRange(preset, today), preset };
    }
  }
  return { values, range };
}

// ---- a click on a mark: the cross-filter -------------------------------------------------------------------------

/** The values filter a column of a result belongs to, or null: a click on a bar of "department" sets Department. */
export function filterForColumn(defs: readonly BoardFilterDef[], column: string | null | undefined): BoardFilterDef | null {
  if (!column) return null;
  const folded = column.toLowerCase();
  return defs.find(def => def.kind === 'values' && def.columns.some(c => c.toLowerCase() === folded)) ?? null;
}

/**
 * What a click on a mark sets: the filter and value of its first operand that belongs to one of the board's filters.
 * Null for a mark that names no such column (it is not a button), and for the roll-up "Other".
 */
export function crossFilterOf(defs: readonly BoardFilterDef[], mark: Mark | null | undefined): { key: string; value: string } | null {
  for (const operand of mark?.operands ?? []) {
    const def = filterForColumn(defs, operand.field);
    if (def && operand.value !== null && operand.value !== undefined) return { key: def.key, value: operand.value };
  }
  return null;
}

/**
 * Marks of a saved statement's result given operands where its label column is one of the board's filters, so a
 * click on its bar or slice can set that filter. A saved query's marks carry none of their own (the analysis path
 * names its groups; a statement does not), and only a one-label result is given them: a mark that merged several
 * rows, or the roll-up "Other", is left inert.
 */
export function withCrossFilterOperands(marks: Mark[], labelColumn: string | null | undefined,
    defs: readonly BoardFilterDef[]): Mark[] {
  const def = filterForColumn(defs, labelColumn);
  if (!def || !labelColumn) return marks;
  return marks.map(mark => mark.operands?.length || mark.name === 'Other' ? mark
    : { ...mark, operands: [{ field: labelColumn, value: mark.name }], inert: false });
}

// ---- what a tile says ----------------------------------------------------------------------------------------------

export interface TileFilterNote {
  /** Whether any filter narrowed this tile: its "Filtered" marker. */
  filtered: boolean;
  /** The marker's words: "Filtered: Department, Date". */
  label: string;
  /** One line per filter that is on and could not land here, in the reader's words. */
  notApplied: string[];
  /** The labels of those filters: the foot's short "Not by Department, Date". */
  notAppliedLabels: string[];
}

/** A tile's filter marker and its notes, from what the server said each filter did to it. */
export function tileFilterNote(defs: readonly BoardFilterDef[], outcomes: readonly BoardFilterOutcome[] | null | undefined): TileFilterNote {
  const byKey = new Map(defs.map(def => [def.key, def]));
  const applied = (outcomes ?? []).filter(o => o.applied).map(o => byKey.get(o.key)?.label ?? o.key);
  const notApplied = (outcomes ?? []).filter(o => !o.applied)
    .map(o => `${byKey.get(o.key)?.label ?? o.key} is not applied here: ${lowerFirst(o.reason ?? 'this data cannot take it.')}`);
  const notAppliedLabels = (outcomes ?? []).filter(o => !o.applied).map(o => byKey.get(o.key)?.label ?? o.key);
  return { filtered: applied.length > 0, label: applied.length ? 'Filtered: ' + applied.join(', ') : '', notApplied, notAppliedLabels };
}

function lowerFirst(text: string): string {
  return text && /^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
}

/** "Cardiology, Neurology" / "Cardiology +2": a chip's words for its chosen values. */
export function chipText(values: readonly string[], max = 1): string {
  if (!values.length) return 'All';
  if (values.length <= max) return values.join(', ');
  return `${values.slice(0, max).join(', ')} +${values.length - max}`;
}
