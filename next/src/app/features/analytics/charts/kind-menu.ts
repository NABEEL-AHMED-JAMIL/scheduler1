import type { WidgetVisualization } from '../analytics.service';
import type { WidgetView } from '../widget-view';
import { CATEGORIES, KINDS, KindCategory, KindInfo } from '../widget-kinds';
import { ChartTable, tableOf } from './chart-table';

/**
 * What a tile's "Show as" menu lists: the kinds suggested for this result, and every kind by
 * category with the ones that fit first.
 *
 * Pure and Angular-free, so the ranking and the order are pinned without a menu, an overlay or a
 * browser. The menu itself (dashboard.html) only draws what this returns.
 *
 * @author Nabeel Ahmed
 */

/** One kind as the menu draws it. */
export interface KindTile {
  kind: KindInfo;
  /** Why it cannot draw this result, or '' when it can. */
  why: string;
  /** The kind the tile draws now. */
  current: boolean;
}

export interface KindGroup {
  category: KindCategory;
  /** The kinds that fit first, in the catalogue's order, then the ones that do not. */
  tiles: KindTile[];
  /** Whether any kind in it fits. A group with none is folded behind "Show charts that don't fit". */
  fits: boolean;
}

export interface KindMenu {
  /** Up to SUGGESTED kinds that fit, the current one first. Narrowed by the search like the rest. */
  suggested: KindTile[];
  /** The groups on screen: every one with a match, less the folded ones unless they are shown. */
  groups: KindGroup[];
  /** How many groups are folded away now (0 while searching, or once they are shown). */
  folded: number;
  /** How many groups have nothing that fits, folded or not: whether the toggle is offered at all. */
  misfitGroups: number;
  /** Whether anything matched the search. */
  matched: boolean;
}

/** How many kinds "Suggested for this data" offers. */
export const SUGGESTED = 6;

/** A case-folded haystack per kind: what the search box matches -- the label, the short label and the category. */
const HAYSTACK = new Map(KINDS.map(kind => [kind.id, `${kind.label} ${kind.short} ${kind.category}`.toLowerCase()]));

export function matches(kind: KindInfo, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return !needle || (HAYSTACK.get(kind.id) ?? '').includes(needle);
}

/**
 * The kinds that suit the shape of this result best, most suitable first, before the fit test.
 *
 * Read off the same ChartTable the ECharts kinds draw from: how many columns name the rows, how
 * many numbers there are, whether the first name is a date, whether the figures add up and how
 * many rows came back. The fit test (view.issues) still has the last word: a kind listed here that
 * does not fit is skipped, and the catalogue's own order fills whatever is left.
 */
export function preferredKinds(table: ChartTable, rowCount: number): WidgetVisualization[] {
  const d = table.dims.length;
  const m = table.measures.length;
  const n = table.length || rowCount;
  const date = !!table.dims[0]?.date;
  const ordered = table.order === 'dimension' && (date || !!table.dims[0]?.numeric);
  const adds = table.additive === true && !table.topNTrimmed;

  if (n === 1) return ['kpi', 'gauge', 'table', 'comparison'];
  if (d === 0) {
    return m >= 3 ? ['bubble', 'scatter', 'parallel', 'scatterTrend', 'radar', 'table']
      : m === 2 ? ['scatter', 'scatterTrend', 'effectScatter', 'histogram', 'table']
      : ['histogram', 'boxplot', 'density', 'distributionSummary', 'table'];
  }
  if (d === 1 && m >= 2) {
    return date || ordered
      ? ['barLine', 'lineSmooth', 'areaStacked', 'lineStep', 'radar', 'table']
      : ['barLine', 'radar', 'scatter', 'parallel', 'barH', 'table'];
  }
  if (d === 1) {
    if (n === 2) return ['comparison', 'ranked', 'bar', 'donut', 'table'];
    if (date) return ['line', 'area', 'bar', 'calendar', 'cumulative', 'trendSummary', 'lineSmooth', 'table'];
    if (ordered) return ['line', 'bar', 'area', 'cumulative', 'histogram', 'trendSummary', 'table'];
    return adds && n <= 8
      ? ['ranked', 'donut', 'bar', 'treemap', 'rankedShare', 'barH', 'pareto', 'table']
      : ['ranked', 'bar', 'barH', 'treemap', 'pareto', 'rankedShare', 'dimensionSummary', 'table'];
  }
  if (d === 2) {
    return date
      ? ['areaStacked', 'stacked', 'lineSmooth', 'heatmap', 'themeRiver', 'groupedBar', 'pivot']
      : ['stacked', 'groupedBar', 'heatmap', 'pivot', 'sankey', 'sunburst', 'treemap', 'shareStacked'];
  }
  return ['treemap', 'sunburst', 'sankey', 'tree', 'parallel', 'pivot', 'table'];
}

/** The suggestions for a result: the current kind first, then the best fits, never more than `max`. */
export function suggestedKinds(view: WidgetView, current: string, max = SUGGESTED): WidgetVisualization[] {
  const table = view.chart ?? tableOf(view, { additive: view.additive });
  const fits = (id: WidgetVisualization) => !view.issues[id];
  const known = new Set(KINDS.map(kind => kind.id));
  const picked: WidgetVisualization[] = [];
  for (const id of [current as WidgetVisualization, ...preferredKinds(table, view.rowCount), ...KINDS.map(kind => kind.id)]) {
    if (picked.length >= max) break;
    if (known.has(id) && fits(id) && !picked.includes(id)) picked.push(id);
  }
  return picked;
}

/**
 * The whole menu for one result, the kind drawn now, the search and whether the folded groups
 * are shown. While a search is typed nothing is folded: a match in a group with nothing that fits
 * is still what was asked for.
 */
export function kindMenu(view: WidgetView, current: string, query = '', showMisfits = false): KindMenu {
  const tile = (kind: KindInfo): KindTile => ({ kind, why: view.issues[kind.id] ?? '', current: kind.id === current });
  const searching = !!query.trim();
  const suggested = suggestedKinds(view, current)
    .map(id => KINDS.find(kind => kind.id === id)!)
    .filter(kind => matches(kind, query))
    .map(tile);
  const all = CATEGORIES.map(category => {
    const tiles = KINDS.filter(kind => kind.category === category && matches(kind, query)).map(tile);
    return { category, tiles: [...tiles.filter(t => !t.why), ...tiles.filter(t => t.why)], fits: tiles.some(t => !t.why) };
  }).filter(group => group.tiles.length);
  const misfitGroups = all.filter(group => !group.fits).length;
  const folded = searching || showMisfits ? 0 : misfitGroups;
  return {
    suggested,
    groups: folded ? all.filter(group => group.fits) : all,
    folded,
    misfitGroups,
    matched: all.length > 0,
  };
}
