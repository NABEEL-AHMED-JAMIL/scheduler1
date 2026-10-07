import type { Mark, WidgetView } from '../widget-view';
import type { Pick } from './chart-options';

/**
 * A click on an ECharts kind, as the board reads a click on an SVG bar: a Mark.
 *
 * The option builders say which dimension values a clicked mark stands for (a Pick: the bar's
 * category, a stacked series' second dimension, a treemap node's path, a sankey link's two ends).
 * This turns that into the Mark the SVG kinds already emit -- the same name, value and operands
 * the board's narrowTo reads -- by finding the view's own marks, never by re-deriving operands
 * from drawn text. A mark's operands are the RAW values markOperands kept, index-aligned with the
 * dimensions; the pick is matched against the mark's name, which is those dimensions' cells
 * joined with " · " exactly as ChartTable holds them.
 *
 * A pick naming every dimension is one mark. A pick naming some of them (a series, a node above
 * the leaves) stands for every mark that agrees on those, and narrows on those operands only.
 * Null when nothing here can be narrowed on: the rolled-up "Other", a merged label, a grained
 * date -- the marks that are inert on the SVG kinds are inert here for the same reasons.
 *
 * @author Nabeel Ahmed
 */
export function markFor(view: WidgetView, pick: Pick | null): Mark | null {
  if (!pick || !pick.some(value => value !== undefined)) return null;
  const width = pick.length;
  const named = pick.map((value, i) => ({ value, i })).filter(entry => entry.value !== undefined);
  const agreeing = view.marks.filter(mark => {
    const parts = width === 1 ? [mark.name] : mark.name.split(' · ');
    return parts.length === width && named.every(({ value, i }) => parts[i] === value);
  });
  // A whole-row pick is that row's own mark, inert or not. A partial one borrows the operands it
  // names from any agreeing mark that has them: those positions hold the same values in all.
  if (named.length === width && agreeing.length && !agreeing[0].operands?.length) return null;
  const first = agreeing.find(mark => mark.operands?.length === width)?.operands;
  if (!first) return null;
  const at = new Set(named.map(entry => entry.i));
  return {
    name: named.map(entry => entry.value).join(' · '),
    value: agreeing.reduce((sum, mark) => sum + mark.value, 0),
    operands: first.filter((_, i) => at.has(i)),
  };
}
