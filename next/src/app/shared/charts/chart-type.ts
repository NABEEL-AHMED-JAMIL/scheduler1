/**
 * The type scale every chart's text is drawn on, the SVG kinds and the ECharts kinds alike.
 *
 * Three of the console's own steps, not a chart scale of its own:
 *   - caption, 11px: the console's small text -- a tile's subtitle (.widget-sub), a stat's label,
 *     every text-[11px]. Axis labels and names, legends, calendar labels, reference-line labels,
 *     the dense node names of a tree, a chord or a calendar.
 *   - body, 12px: Tailwind's text-xs (--text-xs), the console's secondary prose. Data labels on a
 *     mark, tooltips, the label of a kind in the tile menu.
 *   - title, 14px: text-sm (--text-sm), which is a tile's title (.widget-title). No chart text is
 *     larger: a chart inside a tile does not out-shout the tile's name.
 *
 * The one exception is a figure that IS the answer -- a single figure, two figures compared, a
 * gauge's reading -- which grows with its tile between FIGURE_PX.min and FIGURE_PX.max (the
 * .kpi-figure clamp in styles.css: 1rem to 1.875rem).
 *
 * In px rather than rem because ECharts takes numbers. The SVG kinds use the matching classes
 * (text-[11px], text-xs, text-sm); chart-type.spec.ts renders one kind of each family and holds
 * both engines to these steps.
 *
 * @author Nabeel Ahmed
 */
export const CHART_TYPE = { caption: 11, body: 12, title: 14 } as const;

/** Every size chart text may be drawn at, figures aside. */
export const CHART_TYPE_STEPS: readonly number[] = [CHART_TYPE.caption, CHART_TYPE.body, CHART_TYPE.title];

/** A figure that is the answer grows with its tile between these, as .kpi-figure does. */
export const FIGURE_PX = { min: 16, max: 30 } as const;

/** A figure's size for a drawing this tall: a tenth of it, held between FIGURE_PX's ends. */
export function figurePx(height: number | undefined): number {
  if (!height || !Number.isFinite(height)) return 20;
  return Math.round(Math.min(FIGURE_PX.max, Math.max(FIGURE_PX.min, height / 10)));
}
