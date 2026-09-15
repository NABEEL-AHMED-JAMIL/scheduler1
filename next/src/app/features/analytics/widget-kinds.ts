import type { WidgetVisualization } from './analytics.service';

/**
 * Every way a widget may be drawn, and what the picker calls it.
 *
 * In its own module, with no Angular import, so the Playwright suite can import it too. That
 * suite asserted a hardcoded count — "Fourteen: the original four, seven chart kinds, and three
 * summaries" — which was already wrong by two before this file existed: a later change added
 * `shareStacked` and `pivot` and nobody edited the sentence. A spec that restates a number the
 * code owns goes stale silently and then reads as a regression in whatever change happens to run
 * next. Importing the list means the picker and the test cannot disagree.
 *
 * The order is the order the picker offers, which is roughly "plainest first": the two that need
 * nothing of the result, then the bars, then the shapes that make a claim about the data, then
 * the summaries.
 *
 * @author Nabeel Ahmed
 */
export const KINDS: { id: WidgetVisualization; label: string }[] = [
  { id: 'kpi', label: 'Single figure' },
  { id: 'table', label: 'Table' },
  { id: 'ranked', label: 'Ranked bars' },
  { id: 'rankedShare', label: 'Ranked bars with share' },
  { id: 'bar', label: 'Bars in order' },
  { id: 'stacked', label: 'Stacked bars' },
  { id: 'shareStacked', label: 'Share within each group' },
  { id: 'pivot', label: 'Cross-tab grid' },
  { id: 'line', label: 'Line over the dimension' },
  { id: 'area', label: 'Filled area' },
  { id: 'cumulative', label: 'Running total' },
  { id: 'donut', label: 'Share of the total' },
  { id: 'histogram', label: 'Distribution of the figures' },
  { id: 'scatter', label: 'Scatter of two numbers' },
  { id: 'comparison', label: 'Two figures compared' },
  { id: 'dimensionSummary', label: 'Summary of the groups' },
  { id: 'trendSummary', label: 'Summary of the trend' },
  { id: 'distributionSummary', label: 'Summary of the spread' },
];

/** Just the ids, in picker order. What a test asserting "offers every kind" should compare to. */
export const KIND_IDS: WidgetVisualization[] = KINDS.map(kind => kind.id);
