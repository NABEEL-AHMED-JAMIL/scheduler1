import { describe, expect, it } from 'vitest';
import { useMemoryStorage } from '../../../shared/testing/memory-storage';
import {
  BoardFilterDef, ParamReader, activeCount, chipText, crossFilterOf, defaultRange, emptyFilterState, filterForColumn,
  parseFilterDefs, restoreState, saveState, stateFromParams, stateKey, stateToParams, tileFilterNote, toggleValue,
  wireFilters, withCrossFilterOperands, withValues,
} from './board-filters';
import { tableBody } from './board-api';

/**
 * The filter bar's model: what travels to the server (only what is on), to the URL (every filter, so a cleared one
 * clears), into the viewer's storage, and what a click on a mark sets. The server's half -- that the filters are
 * bound and land on the dataset before the tile's statement -- is analytics-service's BoardFiltersTest.
 *
 * @author Nabeel Ahmed
 */

const DEFS: BoardFilterDef[] = [
  { key: 'date', label: 'Date', kind: 'date', columns: ['order_date', 'issue_date'], defaultPreset: '12m' },
  { key: 'region', label: 'Region', kind: 'values', columns: ['region'], family: 'text',
    source: { connection: 'meridian-s3', path: 'orders.csv', column: 'region' } },
  { key: 'channel', label: 'Channel', kind: 'values', columns: ['sales_channel', 'channel'], family: 'text' },
];
const TODAY = new Date(2026, 9, 12);

function params(map: Record<string, string | string[]>): ParamReader {
  return {
    has: name => name in map,
    get: name => { const v = map[name]; return v === undefined ? null : Array.isArray(v) ? v[0] ?? null : v; },
    getAll: name => { const v = map[name]; return v === undefined ? [] : Array.isArray(v) ? v : [v]; },
  };
}

describe('the board filter definitions', () => {
  it('keeps what is well formed and drops the rest rather than trusting it', () => {
    const defs = parseFilterDefs([
      ...DEFS,
      { key: 'region', label: 'twice', kind: 'values', columns: ['region'] },
      { key: 'bad key!', kind: 'values', columns: ['a'] },
      { key: 'nocols', kind: 'values', columns: [] },
      { key: 'kind', kind: 'pie', columns: ['a'] },
      'not an object',
    ]);
    expect(defs.map(d => d.key)).toEqual(['date', 'region', 'channel']);
    expect(defs[1].source?.column).toBe('region');
    expect(parseFilterDefs(null)).toEqual([]);
  });

  it('opens a board on its date filter default, and on all time without one', () => {
    expect(defaultRange(DEFS, TODAY)).toEqual({ from: '2025-10-13', to: '2026-10-12', preset: '12m' });
    expect(defaultRange(DEFS.slice(1), TODAY)).toBeNull();
  });
});

describe('what a tile run carries', () => {
  it('sends only the filters that are on, with every column a filter may land on', () => {
    let state = emptyFilterState();
    expect(wireFilters(DEFS, state)).toEqual([]);
    state = toggleValue(state, 'region', 'North');
    state = { ...state, range: { from: '2025-01-01', to: '2025-03-31', preset: 'custom' } };
    expect(wireFilters(DEFS, state)).toEqual([
      { key: 'date', columns: ['order_date', 'issue_date'], from: '2025-01-01', to: '2025-03-31' },
      { key: 'region', columns: ['region'], family: 'text', values: ['North'] },
    ]);
    expect(activeCount(DEFS, state)).toBe(2);
  });

  it('a value clicked twice is off again, and an empty list clears the filter', () => {
    let state = toggleValue(emptyFilterState(), 'region', 'North');
    state = toggleValue(state, 'region', 'South');
    expect(state.values['region']).toEqual(['North', 'South']);
    state = toggleValue(state, 'region', 'North');
    expect(state.values['region']).toEqual(['South']);
    state = withValues(state, 'region', []);
    expect('region' in state.values).toBe(false);
  });

  it('a table page body carries the board filters as an array and its own filters as their JSON', () => {
    const body = tableBody({
      connection: 'c', path: 'p', sql: 'SELECT 1', page: 2, pageSize: 25, sort: 'amount', direction: 'DESC', search: ' north ',
      boardFilters: [{ key: 'region', columns: ['region'], values: ['North'] }],
      filters: [{ field: 'amount', operator: 'NUMERIC_RANGE', values: ['1', '9'] }], facets: true,
    });
    expect(body['boardFilters']).toEqual([{ key: 'region', columns: ['region'], values: ['North'] }]);
    expect(JSON.parse(body['filters'] as string)).toEqual([{ field: 'amount', operator: 'NUMERIC_RANGE', values: ['1', '9'] }]);
    expect(body['search']).toBe('north');
    expect(body['connection2']).toBeUndefined();
  });
});

describe('the URL', () => {
  it('names every filter of the board, null for one that is off, so a navigation that merges clears it', () => {
    const state = { values: { region: ['North', 'West'] }, range: { from: '2025-10-13', to: '2026-10-12', preset: '12m' as const } };
    expect(stateToParams(DEFS, state)).toEqual({ 'f.region': ['North', 'West'], 'f.channel': null, range: '12m', from: null, to: null });
    expect(stateToParams(DEFS, emptyFilterState())).toEqual({ 'f.region': null, 'f.channel': null, range: 'all', from: null, to: null });
  });

  it('reads a shared link back, a rolling range against today and a custom one as its days', () => {
    const rolling = stateFromParams(DEFS, params({ 'f.region': ['North', 'North', 'West'], range: '90d' }), TODAY);
    expect(rolling).toEqual({ values: { region: ['North', 'West'] }, range: { from: '2026-07-15', to: '2026-10-12', preset: '90d' } });
    const custom = stateFromParams(DEFS, params({ from: '2025-01-01', to: '2025-02-01' }), TODAY);
    expect(custom?.range).toEqual({ from: '2025-01-01', to: '2025-02-01', preset: 'custom' });
  });

  it('drops a day that does not parse, and says nothing when the URL names none of the filters', () => {
    expect(stateFromParams(DEFS, params({ from: '01/02/2025', to: 'soon' }), TODAY)?.range).toBeNull();
    expect(stateFromParams(DEFS, params({ board: '7' }), TODAY)).toBeNull();
    expect(stateFromParams(DEFS, params({ range: 'all' }), TODAY)).toEqual({ values: {}, range: null });
  });
});

describe('remembered per viewer', () => {
  useMemoryStorage();

  it('keeps one viewer apart from another, and a rolling range rolling', () => {
    const key = stateKey(7, 4642);
    expect(key).not.toBe(stateKey(7, 4645));
    saveState(key, { values: { region: ['North'], gone: ['x'] }, range: { from: '2026-09-13', to: '2026-10-12', preset: '30d' } });
    const restored = restoreState(key, DEFS, new Date(2026, 9, 20));
    expect(restored?.values).toEqual({ region: ['North'] });
    expect(restored?.range).toEqual({ from: '2026-09-21', to: '2026-10-20', preset: '30d' });
  });

  it('reads rubbish as nothing remembered', () => {
    localStorage.setItem(stateKey(1, 2), '{not json');
    expect(restoreState(stateKey(1, 2), DEFS)).toBeNull();
  });
});

describe('the cross-filter', () => {
  it('a mark sets the filter its column belongs to; a column of no filter is not a button', () => {
    expect(filterForColumn(DEFS, 'CHANNEL')?.key).toBe('channel');
    expect(crossFilterOf(DEFS, { name: 'Web', value: 3, operands: [{ field: 'channel', value: 'Web' }] }))
      .toEqual({ key: 'channel', value: 'Web' });
    expect(crossFilterOf(DEFS, { name: 'x', value: 1, operands: [{ field: 'customer_id', value: 'x' }] })).toBeNull();
    expect(crossFilterOf(DEFS, { name: 'x', value: 1 })).toBeNull();
  });

  it("a saved statement's marks are given operands only where their label column is a filter's", () => {
    const marks = [{ name: 'North', value: 3 }, { name: 'Other', value: 1, inert: true }];
    const given = withCrossFilterOperands(marks, 'region', DEFS);
    expect(given[0].operands).toEqual([{ field: 'region', value: 'North' }]);
    expect(given[1].operands).toBeUndefined();
    expect(withCrossFilterOperands(marks, 'month', DEFS)).toBe(marks);
  });
});

describe('what a tile says', () => {
  it('names the filters that narrowed it, and each that could not, in the reader\'s words', () => {
    const note = tileFilterNote(DEFS, [
      { key: 'region', applied: true, column: 'region' },
      { key: 'date', applied: false, reason: 'This data has no order_date or issue_date column.' },
    ]);
    expect(note.filtered).toBe(true);
    expect(note.label).toBe('Filtered: Region');
    expect(note.notApplied).toEqual(['Date is not applied here: this data has no order_date or issue_date column.']);
    expect(tileFilterNote(DEFS, null)).toEqual({ filtered: false, label: '', notApplied: [] });
  });

  it('a chip says All, one value, or one and how many more', () => {
    expect(chipText([])).toBe('All');
    expect(chipText(['North'])).toBe('North');
    expect(chipText(['North', 'South', 'West'])).toBe('North +2');
  });
});
