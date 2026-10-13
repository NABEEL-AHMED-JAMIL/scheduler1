import { describe, expect, it } from 'vitest';
import type { WidgetView } from '../widget-view';
import { KIND_IDS } from '../widget-kinds';
import type { ChartTable, TableDim } from './chart-table';
import { kindMenu, matches, preferredKinds, suggestedKinds } from './kind-menu';
import { KINDS } from '../widget-kinds';

/**
 * The tile menu's model: which kinds are suggested for a result, and the order "All charts" lists
 * them in. The menu draws what this returns, so the ranking and the folding are pinned here.
 *
 * @author Nabeel Ahmed
 */

const dim = (name: string, values: string[], over: Partial<TableDim> = {}): TableDim =>
  ({ name, values, date: false, numeric: false, ...over });

function table(over: Partial<ChartTable>): ChartTable {
  return { dims: [], measures: [], length: 0, additive: true, order: 'rank', topNTrimmed: false, emptyReason: '', ...over };
}

/** A view whose only facts are the table and which kinds it refuses. */
function view(chart: ChartTable, refused: string[] = []): WidgetView {
  const issues = Object.fromEntries(KIND_IDS.map(id => [id, refused.includes(id) ? `This chart cannot draw ${id}.` : '']));
  return { chart, issues, rowCount: chart.length, additive: chart.additive === true } as unknown as WidgetView;
}

const twelve = Array.from({ length: 12 }, (_, i) => `group ${i}`);
const amounts = { name: 'amount', values: twelve.map((_, i) => 100 - i) };

describe('the kinds suggested for a result', () => {
  it('reads a single row as a figure', () => {
    expect(preferredKinds(table({ measures: [{ name: 'total', values: [5] }], length: 1 }), 1).slice(0, 2)).toEqual(['kpi', 'gauge']);
  });

  it('reads one column of names as ranked bars first, and dates as a line', () => {
    const named = table({ dims: [dim('region', twelve)], measures: [amounts], length: 12 });
    expect(preferredKinds(named, 12)[0]).toBe('ranked');
    const dated = table({ dims: [dim('day', twelve.map((_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`), { date: true })],
      measures: [amounts], length: 12, order: 'dimension' });
    expect(preferredKinds(dated, 12).slice(0, 2)).toEqual(['line', 'area']);
  });

  it('reads two columns of names as a stack, and numbers alone as a distribution or a scatter', () => {
    const two = table({ dims: [dim('region', twelve), dim('category', twelve)], measures: [amounts], length: 12 });
    expect(preferredKinds(two, 12)[0]).toBe('stacked');
    expect(preferredKinds(table({ measures: [amounts], length: 12 }), 12)[0]).toBe('histogram');
    expect(preferredKinds(table({ measures: [amounts, amounts], length: 12 }), 12)[0]).toBe('scatter');
  });

  it('puts the current kind first, skips what does not fit, and stops at six', () => {
    const named = table({ dims: [dim('region', twelve)], measures: [amounts], length: 12 });
    const picked = suggestedKinds(view(named, ['ranked', 'treemap']), 'barH');
    expect(picked[0]).toBe('barH');
    expect(picked).not.toContain('ranked');
    expect(picked).not.toContain('treemap');
    expect(picked).toHaveLength(6);
    expect(new Set(picked).size).toBe(6);
  });
});

describe('every kind, by category', () => {
  const named = table({ dims: [dim('region', twelve)], measures: [amounts], length: 12 });
  const refused = ['kpi', 'comparison', 'stacked', 'treemap', 'sunburst', 'tree'];

  it('lists the ones that fit first in each category, and folds the categories where nothing does', () => {
    const menu = kindMenu(view(named, refused), 'ranked');
    const bar = menu.groups.find(group => group.category === 'Bar')!;
    const off = bar.tiles.map(tile => !!tile.why);
    expect(off).toEqual([...off].sort((a, b) => Number(a) - Number(b)));
    expect(bar.tiles.find(tile => tile.kind.id === 'stacked')!.why).toMatch(/cannot draw stacked/);
    // Hierarchy: nothing fits, so it is folded until asked for.
    expect(menu.groups.some(group => group.category === 'Hierarchy')).toBe(false);
    expect(menu.folded).toBe(1);
    const unfolded = kindMenu(view(named, refused), 'ranked', '', true);
    expect(unfolded.folded).toBe(0);
    expect(unfolded.groups.flatMap(group => group.tiles.map(tile => tile.kind.id)).sort()).toEqual([...KIND_IDS].sort());
  });

  it('marks the current kind, wherever it is listed', () => {
    const menu = kindMenu(view(named, refused), 'bar');
    expect(menu.suggested[0].current).toBe(true);
    expect(menu.groups.flatMap(group => group.tiles).filter(tile => tile.current).map(tile => tile.kind.id)).toEqual(['bar']);
  });

  it('searches the label, the short label and the category, and unfolds while searching', () => {
    expect(KINDS.filter(kind => matches(kind, 'flow')).map(kind => kind.id)).toEqual(['sankey', 'chord']);
    expect(KINDS.filter(kind => matches(kind, 'Candles')).map(kind => kind.id)).toEqual(['candlestick']);
    const menu = kindMenu(view(named, refused), 'ranked', 'hierarchy');
    expect(menu.folded).toBe(0);
    expect(menu.groups.map(group => group.category)).toEqual(['Hierarchy']);
    expect(kindMenu(view(named, refused), 'ranked', 'nothing like this').matched).toBe(false);
  });

  it('gives every kind a distinct short label', () => {
    const shorts = KINDS.map(kind => kind.short);
    expect(new Set(shorts).size).toBe(shorts.length);
    expect(shorts.every(short => short.length > 0 && short.length <= 13)).toBe(true);
  });
});
