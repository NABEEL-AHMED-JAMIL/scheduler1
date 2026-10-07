import type { EChartKind } from '../analytics.service';
import type { WidgetView } from '../dashboard';
import { compactNumber, readableCell } from '../../../shared/charts/number-format';
import { shortLabel } from '../../../shared/charts/short-label';
import { dayLabel } from '../../../shared/ui/time-format';
import { instantOf } from '../../../core/instant';
import { ChartTokenSet, blend, inkOn } from '../../../shared/charts/echart/echart-theme';
import type { EChartClick } from '../../../shared/charts/echart/echart';
import {
  ChartTable, TableDim, dayKey, distinct, figures, grid, primary, quantities, rowLabel, sortAndCut, tableOf,
} from './chart-table';
import { CATEGORY_LIMIT, gaugeFigures } from './chart-fit';
import { AxisSettings, ChartSettings, LABEL_PX, NumberStyle } from './chart-settings';
import { CHART_TYPE, figurePx } from '../../../shared/charts/chart-type';

const CAPTION = CHART_TYPE.caption;
/** A label's size by the settings, 'normal' (12px) unless a kind's labels are dense and start smaller. */
const labelPx = (s: ChartSettings, unset: 'small' | 'normal' = 'normal'): number => LABEL_PX[s.labels?.size ?? unset];

/**
 * Results to ECharts options: one pure function per kind, and one entry point.
 *
 * Pure so every kind is tested as data -- what series, what axes, what the tooltip prints --
 * without a canvas, a component or a browser. Nothing here reads the DOM or the clock: colours
 * arrive resolved in `theme`, and settings arrive parsed.
 *
 * <b>Big results.</b> A board tile may be handed tens of thousands of points, so the options turn
 * on ECharts' own large-data paths past a threshold rather than always: `large` for bars and
 * scatters (one batched path instead of one shape per point), `sampling: 'lttb'` for long lines
 * (downsampled to the pixels, keeping the peaks), `progressive` rendering so the first frame is
 * not blocked on the last point, symbols off on a dense line, and a dataZoom -- wheel and slider
 * -- once there are more points than can stand side by side. Animation is off past
 * ANIMATE_BELOW, where a tween costs more than it shows.
 *
 * @author Nabeel Ahmed
 */

export type EOption = Record<string, unknown>;
type Obj = Record<string, unknown>;

export interface OptionTheme {
  /** The series colours, resolved and in the widget's order. */
  palette: string[];
  tokens: ChartTokenSet;
}

export interface OptionContext {
  /** Whether to offer the toolbox (save as image, data view, restore). Off for previews. */
  interactive?: boolean;
  /** The drawing's height in px, for the kinds that lay out rows of their own (the calendar). */
  height?: number;
  /** The file name a saved image takes, and the data view's heading. */
  name?: string;
  /** Whether a click on a mark narrows something: the pointer says so only where it does. */
  clickable?: boolean;
}

// ---- what a click picked --------------------------------------------------------------------

/**
 * The dimension values a clicked mark stands for, index-aligned with the table's dims, as the
 * table holds them (never the text drawn). `undefined` where the mark says nothing about that
 * dimension: a series of a stacked area names the second dimension only, a sankey node one stage.
 */
export type Pick = (string | undefined)[];
export type Picker = (click: EChartClick) => Pick | null;

/**
 * Each built option's picker, beside it rather than in it: ECharts must not be handed a function
 * it would try to merge, and an option compared in a spec should not carry one either.
 */
const PICKERS = new WeakMap<EOption, Picker>();

/** How a click on this option maps back to the rows it was drawn from; null where nothing can. */
export function pickerOf(option: EOption | null | undefined): Picker | null {
  return option ? PICKERS.get(option) ?? null : null;
}

function withPicker<T extends EOption>(option: T, picker: Picker): T {
  PICKERS.set(option, picker);
  return option;
}

/** A pick naming some dimensions and leaving the rest open. */
function pickOf(table: ChartTable, values: Record<number, string | undefined>): Pick | null {
  const out = table.dims.map((_, i) => values[i]);
  return out.some(value => value !== undefined) ? out : null;
}

/** The pick for one whole row of the table. */
function rowPick(table: ChartTable, row: number | undefined): Pick | null {
  if (row === undefined || row < 0 || row >= table.length || !table.dims.length) return null;
  return table.dims.map(dim => dim.values[row]);
}

/** The value a drawn label stands for, for the kinds that only hand back the label. */
function rawByText(dim: TableDim | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const value of dim?.values ?? []) {
    const text = valueText(dim, value);
    if (!out.has(text)) out.set(text, value);
  }
  return out;
}

/** Past this many points a series is drawn through ECharts' large-data path. */
export const LARGE_FROM = 2000;
/** Past this many points a line is downsampled to the pixels and drawn without symbols. */
export const SAMPLE_FROM = 600;
/** Past this many categories or points the axis gets a dataZoom, unless the settings say no. */
export const ZOOM_FROM = { category: 40, line: 300, scatter: 3000 };
/** No tween past this many points: it costs more than it shows. */
export const ANIMATE_BELOW = 2000;

// ---- formats --------------------------------------------------------------------------------

const CURRENCY = /^[$€£¥₹]$/;

/** A figure in a named style, with a unit: "$1.2K", "34.5%", "1,204 kg". */
export function formatNumber(value: number | null | undefined, style: NumberStyle = 'auto', unit = ''): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  let text: string;
  switch (style) {
    case 'compact': text = compactNumber(value); break;
    case 'plain': text = String(value); break;
    case 'fixed0': text = value.toLocaleString(undefined, { maximumFractionDigits: 0 }); break;
    case 'fixed2': text = value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); break;
    case 'percent': text = `${(Math.round(value * 10) / 10).toLocaleString()}%`; break;
    default: text = readableCell(String(value));
  }
  if (!unit) return text;
  return CURRENCY.test(unit) ? (text.startsWith('-') ? `-${unit}${text.slice(1)}` : unit + text)
    : unit === '%' ? text + unit : `${text} ${unit}`;
}

/** An axis label short enough for an axis: compact unless the author chose a style. */
function axisNumber(style: NumberStyle | undefined, unit = ''): (value: number) => string {
  return value => formatNumber(value, style ?? 'compact', unit);
}

/**
 * A dimension value as a reader reads it. A date-time is read through instantOf (a value with an
 * offset is taken at its word) and written on the console's 24-hour clock; a calendar day as
 * "4 Mar 2026". Nothing is cut out of the text.
 */
export function valueText(dim: TableDim | undefined, value: string): string {
  if (!dim?.date) return value;
  if (!/\d{2}:\d{2}/.test(value)) return dayLabel(value);
  const moment = instantOf(value);
  if (!moment) return value;
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(moment);
}

function labels(table: ChartTable, at = 0): string[] {
  const dim = table.dims[at];
  return (dim?.values ?? []).map(value => valueText(dim, value));
}

// ---- shared pieces --------------------------------------------------------------------------

interface Series { name: string; data: (number | null)[] }

/**
 * The series over the first dimension: one per value of a second dimension, one per measure when
 * there are several, or the primary measure alone.
 */
export function seriesModel(table: ChartTable): { xs: string[]; series: Series[] } {
  if (table.dims.length >= 2) {
    const shaped = grid(table);
    const dim = table.dims[0];
    return {
      xs: shaped.xs.map(x => valueText(dim, x)),
      series: shaped.series.map((name, i) => ({ name: valueText(table.dims[1], name), data: shaped.cell[i] })),
    };
  }
  const xs = table.dims.length ? labels(table) : table.measures.length ? [primary(table)!.name] : [];
  const measures = table.measures.length > 1 ? table.measures : table.measures.slice(-1);
  return { xs, series: measures.map(measure => ({ name: measure.name, data: measure.values })) };
}

function percentOfColumn(series: Series[]): Series[] {
  const totals = series[0]?.data.map((_, x) => series.reduce((sum, s) => sum + Math.max(0, s.data[x] ?? 0), 0)) ?? [];
  return series.map(s => ({ ...s, data: s.data.map((v, x) => (v === null || !totals[x] ? null : (v / totals[x]) * 100)) }));
}

function legend(settings: ChartSettings, count: number, fallbackShow: boolean): Obj | undefined {
  const show = settings.legend?.show ?? (fallbackShow && count > 1);
  if (!show) return undefined;
  const position = settings.legend?.position ?? 'top';
  const orient = settings.legend?.orient ?? (position === 'left' || position === 'right' ? 'vertical' : 'horizontal');
  return {
    show: true,
    type: settings.legend?.scroll === false ? 'plain' : 'scroll',
    orient,
    [position]: position === 'top' && settings.title?.text ? 40 : 0,
    // Not the full width: the toolbox sits at the top right, and a long legend scrolls before reaching it.
    ...(orient === 'horizontal' ? { left: 'center', width: '74%' } : { top: 'middle' }),
    itemWidth: 12, itemHeight: 8, itemGap: 12,
    // A long name is cut with an ellipsis, and the whole of it is the legend item's tooltip.
    textStyle: { width: orient === 'vertical' ? 96 : 140, overflow: 'truncate', ellipsis: '…' },
    tooltip: { show: true, confine: true },
  };
}

function gridBox(settings: ChartSettings, legendOption: Obj | undefined, slider: boolean, vertical = false): Obj {
  const pad = settings.grid?.padding === 'compact' ? 4 : settings.grid?.padding === 'roomy' ? 24 : 12;
  const position = legendOption ? (settings.legend?.position ?? 'top') : null;
  const titled = settings.title?.text ? 36 : 0;
  return {
    left: pad + (position === 'left' ? 110 : 0),
    right: pad + (position === 'right' ? 110 : 0) + (slider && vertical ? 28 : 0),
    top: pad + titled + (position === 'top' ? 26 : 0) + 4,
    bottom: pad + (position === 'bottom' ? 26 : 0) + (slider && !vertical ? 30 : 0),
    outerBoundsMode: settings.grid?.fitLabels === false ? 'none' : 'same',
    outerBoundsContain: 'axisLabel',
  };
}

function axisFrom(base: Obj, axis: AxisSettings | undefined, numeric: boolean): Obj {
  const out: Obj = { ...base };
  if (axis?.name) Object.assign(out, { name: axis.name, nameLocation: 'middle', nameGap: numeric ? 42 : 28 });
  if (numeric) {
    if (axis?.min !== undefined) out['min'] = axis.min;
    if (axis?.max !== undefined) out['max'] = axis.max;
    if (axis?.log) out['type'] = 'log';
    out['axisLabel'] = { ...(out['axisLabel'] as Obj ?? {}), formatter: axisNumber(axis?.format, axis?.unit) };
  } else {
    out['axisLabel'] = {
      // A category name of any length is cut to the width with an ellipsis; the axis tooltip over
      // the mark carries the whole of it. 60-character names pushed the plot into a sliver.
      width: CATEGORY_LABEL_PX, overflow: 'truncate', ellipsis: '…',
      ...(out['axisLabel'] as Obj ?? {}),
      ...(axis?.rotate !== undefined ? { rotate: axis.rotate } : {}),
      ...(axis?.interval === 'all' ? { interval: 0 } : {}),
      hideOverlap: true,
    };
  }
  if (axis?.splitLines !== undefined) out['splitLine'] = { show: axis.splitLines };
  return out;
}

/** The widest a category name is drawn on an axis before it is cut, in px. */
export const CATEGORY_LABEL_PX = 160;
/** The height one horizontal bar is given before the chart grows or scrolls, in px. */
export const BAR_ROW_PX = 18;
/** Room a horizontal bar chart needs besides its bars: the value axis, padding, the toolbox. */
export const BAR_CHROME_PX = 72;

/**
 * The slider and the wheel over a category or point axis, opened on the first `visible` of them
 * (or the last, `fromEnd`: horizontal bars are drawn bottom-up, so their first rows are the end).
 * A vertical (y) window is a scroll bar for bars that did not fit; a horizontal one opens on the
 * first ZOOM_FROM.category.
 */
function dataZoom(on: boolean, axis: 'x' | 'y', count: number, visible = ZOOM_FROM.category, fromEnd = false): Obj[] | undefined {
  if (!on) return undefined;
  const index = axis === 'x' ? { xAxisIndex: 0 } : { yAxisIndex: 0 };
  const window = count > 0 ? Math.min(100, Math.max(1, (visible / count) * 100)) : 100;
  const [start, end] = fromEnd ? [100 - window, 100] : [0, window];
  return [
    // The window on both: ECharts links two zooms on one axis, and the one without a window
    // otherwise opened it to the whole axis.
    { type: 'inside', ...index, filterMode: 'filter', zoomOnMouseWheel: 'shift', moveOnMouseWheel: true, start, end },
    {
      type: 'slider', ...index, height: axis === 'x' ? 18 : undefined, width: axis === 'y' ? 14 : undefined,
      ...(axis === 'y' ? { right: 4, top: 30, bottom: 28 } : { bottom: 6 }),
      start, end, showDetail: false, brushSelect: false, zoomLock: axis === 'y',
    },
  ];
}

/**
 * How tall a horizontal bar chart of n categories wants to be: a row per bar and its chrome,
 * never less than the height asked for and never more than `cap`. Past the cap the bars scroll
 * (dataZoom on the category axis) rather than shrinking into a smear.
 */
export function naturalHeight(n: number, asked: number, cap: number): number {
  return Math.max(asked, Math.min(cap, n * BAR_ROW_PX + BAR_CHROME_PX));
}

/** How many horizontal bars stand at full height in a drawing of this height. */
function barsThatFit(height: number): number {
  return Math.max(4, Math.floor((height - BAR_CHROME_PX) / (BAR_ROW_PX - 2)));
}

function labelOption(settings: ChartSettings, defaultShow: boolean, defaultPosition: string, unit = ''): Obj {
  const position = settings.labels?.position && settings.labels.position !== 'auto' ? settings.labels.position : defaultPosition;
  return {
    show: settings.labels?.show ?? defaultShow,
    position,
    fontSize: labelPx(settings),
    formatter: (params: { value: unknown }) => {
      const raw = Array.isArray(params.value) ? params.value[params.value.length - 1] : params.value;
      return typeof raw === 'number' ? formatNumber(raw, settings.labels?.format ?? 'compact', unit) : String(raw ?? '');
    },
  };
}

function markLines(settings: ChartSettings): Obj | undefined {
  const ref = settings.refLines;
  if (!ref) return undefined;
  const data: Obj[] = [];
  if (ref.average) data.push({ type: 'average', name: 'Average' });
  if (ref.min) data.push({ type: 'min', name: 'Minimum' });
  if (ref.max) data.push({ type: 'max', name: 'Maximum' });
  if (ref.target !== undefined) data.push({ yAxis: ref.target, name: ref.label || 'Target' });
  if (!data.length) return undefined;
  return {
    silent: true, symbol: 'none',
    lineStyle: { type: 'dashed', width: 1 },
    label: { formatter: (p: { name: string; value: number }) => `${p.name} ${formatNumber(p.value, 'compact')}`, position: 'insideEndTop' },
    data,
  };
}

/** Large-data switches for a cartesian series of n points. */
function bigData(kind: 'bar' | 'line' | 'scatter', n: number): Obj {
  const out: Obj = { progressive: 2000, progressiveThreshold: 4000 };
  if ((kind === 'bar' || kind === 'scatter') && n >= LARGE_FROM) Object.assign(out, { large: true, largeThreshold: LARGE_FROM });
  if (kind === 'line' && n >= SAMPLE_FROM) Object.assign(out, { sampling: 'lttb', showSymbol: false });
  return out;
}

function tooltip(settings: ChartSettings, trigger: 'axis' | 'item', unit = ''): Obj {
  const style = settings.tooltip?.format ?? 'auto';
  return {
    trigger: settings.tooltip?.trigger ?? trigger,
    confine: true,
    axisPointer: { type: trigger === 'axis' ? 'shadow' : 'line' },
    valueFormatter: (value: unknown) => (typeof value === 'number' ? formatNumber(value, style, unit) : String(value ?? '—')),
  };
}

// ---- the kinds ------------------------------------------------------------------------------

type Builder = (table: ChartTable, s: ChartSettings, theme: OptionTheme, context: OptionContext) => EOption;

const unitOf = (s: ChartSettings) => s.yAxis?.unit ?? s.xAxis?.unit ?? '';

function cartesian(kind: 'line' | 'bar', horizontal: boolean): Builder {
  return (table0, s, _theme, context) => {
    const cutOne = table0.dims.length <= 1 ? cutTable(table0, s) : { table: table0, otherAt: -1 };
    const table = cutOne.table;
    const model = seriesModel(table);
    const percent = s.bar?.stack === 'percent';
    const stack = s.bar?.stack === 'stack' || percent;
    const n = model.xs.length;
    // Horizontal bars read top-down in the result's order. They are drawn bottom-up with the order
    // reversed rather than on an inverse axis: ECharts 6.1 lays out an inverse category axis of a
    // few hundred names into a sliver of the grid when it fits the labels (outerBounds), which
    // left 240 bars in the top 140px of a 600px chart. `at` maps a drawn index back to the row.
    const flip = <T>(list: T[]): T[] => (horizontal ? [...list].reverse() : list);
    const at = (drawnIndex: number) => (horizontal ? n - 1 - drawnIndex : drawnIndex);
    const xs = flip(model.xs);
    const series = model.series.map(one => ({ ...one, data: flip(one.data) }));
    const drawn = percent ? percentOfColumn(series) : series;
    // Horizontal bars scroll once they no longer stand at a readable height: the window is what
    // fits the drawing, the slider on the right is the scroll bar, and the wheel moves it.
    const fit = horizontal ? barsThatFit(context.height ?? 220) : ZOOM_FROM.category;
    const zoom = s.zoom ?? (horizontal ? n > fit : n > (kind === 'line' ? ZOOM_FROM.line : ZOOM_FROM.category));
    const lg = legend(s, drawn.length, true);
    const valueAxis = axisFrom({ type: 'value' }, horizontal ? s.xAxis : s.yAxis, true);
    if (percent) Object.assign(valueAxis, { max: 100, axisLabel: { formatter: (v: number) => `${v}%` } });
    const categoryAxis = axisFrom({ type: 'category', data: xs, boundaryGap: kind === 'bar',
      ...(horizontal ? {} : crowdedX(xs, s.xAxis)) }, horizontal ? s.yAxis : s.xAxis, false);
    const shaped = table.dims.length >= 2 ? grid(table) : null;
    const option: EOption = {
      legend: lg,
      grid: gridBox(s, lg, zoom, horizontal),
      tooltip: tooltip(s, 'axis', unitOf(s)),
      xAxis: horizontal ? valueAxis : categoryAxis,
      yAxis: horizontal ? categoryAxis : valueAxis,
      dataZoom: dataZoom(zoom, horizontal ? 'y' : 'x', n, horizontal ? fit : kind === 'line' ? n : ZOOM_FROM.category, horizontal),
      series: drawn.map((one, i) => ({
        type: kind, name: one.name, data: one.data,
        ...(stack ? { stack: 'total' } : {}),
        ...bigData(kind, n),
        ...(kind === 'bar' ? {
          barMaxWidth: 48,
          ...(s.bar?.width ? { barWidth: `${s.bar.width}%` } : {}),
          itemStyle: { borderRadius: s.bar?.radius ?? (stack ? 0 : 3) },
          label: labelOption(s, false, stack ? 'inside' : horizontal ? 'right' : 'top', unitOf(s)),
        } : {}),
        ...(i === 0 ? { markLine: markLines(s) } : {}),
      })),
    };
    return withPicker(option, click => {
      if (click.dataIndex === undefined || click.componentType !== 'series') return null;
      const row = at(click.dataIndex);
      if (shaped) return pickOf(table, { 0: shaped.xs[row], 1: shaped.series[click.seriesIndex ?? -1] });
      return row === cutOne.otherAt ? null : rowPick(table, row);
    });
  };
}

/**
 * A crowded category axis along the bottom: past a dozen names, or names longer than a short
 * word, they are tilted and cut to a width, and the ones that still collide are skipped.
 */
function crowdedX(xs: string[], axis: AxisSettings | undefined): Obj {
  if (axis?.rotate !== undefined) return {};
  const longest = xs.reduce((max, x) => Math.max(max, x.length), 0);
  return xs.length > 12 && longest > 6 || longest > 24 ? { axisLabel: { rotate: 35, width: 110 } } : {};
}

function lineKind(variant: 'smooth' | 'step' | 'markers' | 'stacked' | 'share'): Builder {
  return (table, s) => {
    const { xs, series } = seriesModel(table);
    const share = variant === 'share';
    const stacked = variant === 'stacked' || share;
    const drawn = share ? percentOfColumn(series) : series;
    const n = xs.length;
    const zoom = s.zoom ?? n > ZOOM_FROM.line;
    const lg = legend(s, drawn.length, true);
    const valueAxis = axisFrom({ type: 'value' }, s.yAxis, true);
    if (share) Object.assign(valueAxis, { max: 100, axisLabel: { formatter: (v: number) => `${v}%` } });
    const smooth = s.line?.smooth ?? (variant === 'smooth' || variant === 'stacked' || variant === 'share');
    const step = s.line?.step ?? variant === 'step';
    const areaOpacity = s.line?.areaOpacity ?? (stacked ? 0.35 : 0);
    const refs = markLines(s);
    const shaped = table.dims.length >= 2 ? grid(table) : null;
    const box = gridBox(s, lg, zoom);
    // The highest point's pin stands 46px above it: room for it under the legend and the toolbox.
    if (variant === 'markers') box['top'] = (box['top'] as number) + 30;
    const option: EOption = {
      legend: lg,
      grid: box,
      tooltip: tooltip(s, 'axis', share ? '%' : unitOf(s)),
      xAxis: axisFrom({ type: 'category', data: xs, boundaryGap: false }, s.xAxis, false),
      yAxis: valueAxis,
      dataZoom: dataZoom(zoom, 'x', n, n),
      series: drawn.map((one, i) => ({
        // The line and its fill report a click with their series (triggerEvent); the point is
        // read off the axis under the pointer (app-echart), so a stacked area narrows to both.
        type: 'line', name: one.name, data: one.data, triggerEvent: true,
        smooth: step ? false : smooth ? 0.35 : false,
        step: step ? 'middle' : false,
        connectNulls: false,
        showSymbol: s.line?.symbols ?? n <= 60,
        symbolSize: 5,
        lineStyle: { width: s.line?.width ?? 2 },
        ...(areaOpacity > 0 ? { areaStyle: { opacity: areaOpacity } } : {}),
        ...(stacked ? { stack: 'total', emphasis: { focus: 'series' } } : {}),
        ...bigData('line', n),
        label: labelOption(s, false, 'top', unitOf(s)),
        ...(variant === 'markers' ? {
          markPoint: {
            // Big enough to hold a compact figure at 11px ("609K", "1.2M"): at 34 the text ran out of the pin.
            symbolSize: 46,
            data: [{ type: 'max', name: 'Highest' }, { type: 'min', name: 'Lowest' }],
            label: { formatter: (p: { value: number }) => formatNumber(p.value, 'compact'), fontSize: CAPTION },
          },
          markLine: {
            silent: true, symbol: 'none', lineStyle: { type: 'dashed', width: 1 },
            label: { formatter: (p: { value: number }) => `Average ${formatNumber(p.value, 'compact')}`, position: 'insideEndTop' },
            data: [{ type: 'average', name: 'Average' }, ...((refs?.['data'] as Obj[] | undefined) ?? [])],
          },
        } : i === 0 && refs ? { markLine: refs } : {}),
      })),
    };
    return withPicker(option, click => {
      const at = click.dataIndex;
      if (at === undefined || click.componentType !== 'series') return null;
      return shaped ? pickOf(table, { 0: shaped.xs[at], 1: shaped.series[click.seriesIndex ?? -1] }) : rowPick(table, at);
    });
  };
}

const waterfall: Builder = (table0, s, theme) => {
  const { table, otherAt } = cutTable(table0, s, 'none', CATEGORY_LIMIT.waterfall);
  const xs = labels(table);
  const deltas = figures(table);
  const base: number[] = [];
  const shown: Obj[] = [];
  let running = 0;
  deltas.forEach(delta => {
    const next = running + delta;
    base.push(Math.min(running, next));
    shown.push({ value: Math.abs(delta), delta, itemStyle: { color: delta >= 0 ? theme.tokens.up : theme.tokens.down } });
    running = next;
  });
  const n = xs.length + 1;
  const zoom = s.zoom ?? n > ZOOM_FROM.category;
  const unit = unitOf(s);
  return withPicker({
    grid: gridBox(s, undefined, zoom),
    tooltip: {
      trigger: 'axis', confine: true, axisPointer: { type: 'shadow' },
      formatter: (params: { dataIndex: number; name: string }[]) => {
        const at = params[0]?.dataIndex ?? 0;
        if (at === deltas.length) return `Total<br>${formatNumber(running, s.tooltip?.format, unit)}`;
        const total = deltas.slice(0, at + 1).reduce((sum, v) => sum + v, 0);
        return `${xs[at]}<br>${deltas[at] >= 0 ? '+' : ''}${formatNumber(deltas[at], s.tooltip?.format, unit)}`
          + `<br>Running total ${formatNumber(total, s.tooltip?.format, unit)}`;
      },
    },
    xAxis: axisFrom({ type: 'category', data: [...xs, 'Total'], ...crowdedX(xs, s.xAxis) }, s.xAxis, false),
    yAxis: axisFrom({ type: 'value' }, s.yAxis, true),
    dataZoom: dataZoom(zoom, 'x', n),
    series: [
      { type: 'bar', stack: 'fall', silent: true, itemStyle: { color: 'transparent', borderColor: 'transparent' }, data: [...base, 0] },
      {
        type: 'bar', stack: 'fall', name: primary(table)?.name ?? '', barMaxWidth: 48,
        itemStyle: { borderRadius: s.bar?.radius ?? 2 },
        label: labelOption(s, xs.length <= 16, 'top', unit),
        data: [...shown, { value: running, delta: running, itemStyle: { color: theme.palette[0] } }],
      },
    ],
  }, click => (click.seriesIndex !== 1 || click.dataIndex === otherAt ? null : rowPick(table, click.dataIndex)));
};

const pareto: Builder = (table, s, theme) => {
  const { table: sorted, otherAt } = cutTable(table, { ...s, sort: 'desc' }, 'desc', CATEGORY_LIMIT.pareto);
  const xs = labels(sorted);
  const values = figures(sorted);
  const total = values.reduce((sum, v) => sum + v, 0) || 1;
  let running = 0;
  const share = values.map(v => { running += v; return (running / total) * 100; });
  const n = xs.length;
  const zoom = s.zoom ?? n > ZOOM_FROM.category;
  const lg = legend(s, 2, true);
  return withPicker({
    legend: lg,
    grid: gridBox(s, lg, zoom),
    tooltip: {
      trigger: 'axis', confine: true, axisPointer: { type: 'shadow' },
      valueFormatter: (v: number) => formatNumber(v, s.tooltip?.format, unitOf(s)),
    },
    xAxis: axisFrom({ type: 'category', data: xs, ...crowdedX(xs, s.xAxis) }, s.xAxis, false),
    yAxis: [
      axisFrom({ type: 'value' }, s.yAxis, true),
      { type: 'value', max: 100, min: 0, splitLine: { show: false }, axisLabel: { formatter: (v: number) => `${v}%` } },
    ],
    dataZoom: dataZoom(zoom, 'x', n),
    series: [
      { type: 'bar', name: primary(table)?.name ?? '', data: values, barMaxWidth: 48, itemStyle: { borderRadius: s.bar?.radius ?? 3 }, label: labelOption(s, false, 'top'), ...bigData('bar', n) },
      {
        type: 'line', name: 'Running share', yAxisIndex: 1, data: share, smooth: 0.2, symbolSize: 4, showSymbol: n <= 40,
        tooltip: { valueFormatter: (v: number) => formatNumber(v, 'percent') },
        lineStyle: { width: 2, color: theme.palette[1] }, itemStyle: { color: theme.palette[1] },
        markLine: { silent: true, symbol: 'none', lineStyle: { type: 'dashed', width: 1 }, label: { show: false }, data: [{ yAxis: 80 }] },
      },
    ],
  }, categoryPicker(sorted, otherAt));
};

const barLine: Builder = (table, s) => {
  const xs = labels(table);
  const [bars, line] = table.measures;
  const n = xs.length;
  const zoom = s.zoom ?? n > ZOOM_FROM.category;
  const lg = legend(s, 2, true);
  return withPicker({
    legend: lg,
    grid: gridBox(s, lg, zoom),
    tooltip: tooltip(s, 'axis', unitOf(s)),
    xAxis: axisFrom({ type: 'category', data: xs, ...crowdedX(xs, s.xAxis) }, s.xAxis, false),
    yAxis: [
      // Unnamed: the legend names both, and a name on the right axis sat under the toolbox.
      axisFrom({ type: 'value' }, s.yAxis, true),
      { type: 'value', splitLine: { show: false }, axisLabel: { formatter: axisNumber('compact') } },
    ],
    dataZoom: dataZoom(zoom, 'x', n),
    series: [
      { type: 'bar', name: bars.name, data: bars.values, barMaxWidth: 48, itemStyle: { borderRadius: s.bar?.radius ?? 3 }, label: labelOption(s, false, 'top'), markLine: markLines(s), ...bigData('bar', n) },
      { type: 'line', name: line.name, yAxisIndex: 1, data: line.values, smooth: (s.line?.smooth ?? true) ? 0.3 : false, showSymbol: s.line?.symbols ?? n <= 40, lineStyle: { width: s.line?.width ?? 2 }, ...bigData('line', n) },
    ],
  }, categoryPicker(table));
};

/** The label the rolled-up tail takes, the one sortAndCut writes. */
export const OTHER = 'Other';

/**
 * Sorted and cut as the settings ask, for the kinds that list categories -- and, past the kind's
 * own limit, cut to it with the tail in "Other", which is the default top-N a long result needs.
 * `otherAt` is the rolled-up row's index (-1 when there is none): it is not a value in the data,
 * so a click on it narrows nothing.
 */
function cutTable(table: ChartTable, s: ChartSettings, defaultSort: 'none' | 'desc' = 'none',
    limit?: number): { table: ChartTable; otherAt: number } {
  const over = limit !== undefined && table.dims.length === 1 && table.length > limit && table.additive === true;
  const topN = s.topN ?? (over ? limit! - 1 : null);
  const sort = s.sort ?? (over ? 'desc' : defaultSort);
  const result = sortAndCut(table, sort, topN, s.other ?? true);
  return { table: result.table, otherAt: result.other ? result.table.length - 1 : -1 };
}

/** A click on the n-th category of a one-dimension table, the rolled-up row picking nothing. */
function categoryPicker(table: ChartTable, otherAt = -1): Picker {
  return click => (click.dataIndex === undefined || click.dataIndex === otherAt ? null : rowPick(table, click.dataIndex));
}

const polarBar: Builder = (table0, s) => {
  const { table, otherAt } = cutTable(table0, s, 'none', CATEGORY_LIMIT.polarBar);
  const xs = labels(table);
  return withPicker({
    tooltip: tooltip(s, 'item', unitOf(s)),
    polar: { radius: ['12%', '78%'] },
    angleAxis: { type: 'value', startAngle: 90, splitNumber: 4, axisLabel: { formatter: axisNumber('compact') }, splitLine: { show: false } },
    radiusAxis: { type: 'category', data: xs, axisLabel: { interval: 0, fontSize: CAPTION }, z: 10 },
    series: [{
      type: 'bar', coordinateSystem: 'polar', name: primary(table)?.name ?? '', data: figures(table),
      colorBy: 'data', roundCap: (s.bar?.radius ?? 1) > 0, label: labelOption(s, false, 'middle'),
    }],
  }, categoryPicker(table, otherAt));
};

const pictorialBar: Builder = (table0, s) => {
  const { table, otherAt } = cutTable(table0, s, 'none', CATEGORY_LIMIT.pictorialBar);
  const xs = labels(table);
  return withPicker({
    // Room on the right for the value written past the longest bar.
    grid: { ...gridBox(s, undefined, false, true), right: 48 },
    tooltip: tooltip(s, 'axis', unitOf(s)),
    xAxis: axisFrom({ type: 'value', splitLine: { show: false } }, s.xAxis, true),
    yAxis: axisFrom({ type: 'category', data: xs, inverse: true, axisTick: { show: false } }, s.yAxis, false),
    series: [{
      type: 'pictorialBar', name: primary(table)?.name ?? '', data: figures(table),
      symbol: 'roundRect', symbolRepeat: true, symbolSize: ['8', '60%'], symbolMargin: 2, symbolClip: true,
      colorBy: 'data', label: labelOption(s, true, 'right', unitOf(s)), markLine: markLines(s),
    }],
  }, categoryPicker(table, otherAt));
};

function pie(variant: 'rose' | 'half'): Builder {
  return (table0, s) => {
    const { table, otherAt } = cutTable(table0, s, 'desc', CATEGORY_LIMIT[variant === 'rose' ? 'rose' : 'halfDonut']);
    const xs = labels(table);
    const values = figures(table);
    const total = values.reduce((sum, v) => sum + v, 0) || 1;
    // Off unless asked: every slice is labelled with its name already.
    const lg = legend(s, xs.length, false);
    // A legend beside the pie takes a third of the width: the pie moves over and shrinks, and its
    // slices are not also labelled -- the legend names them, and fifteen outside labels and a
    // legend of fifteen fought over the same strip (owner review, 2026-10-06).
    const side = lg ? (s.legend?.position ?? 'top') : null;
    const beside = side === 'left' || side === 'right';
    const inner = s.pie?.inner ?? (variant === 'half' ? 50 : 18);
    const outer = s.pie?.outer ?? (variant === 'half' ? 95 : beside ? 62 : 72);
    const cx = side === 'right' ? '36%' : side === 'left' ? '64%' : '50%';
    return withPicker({
      legend: lg,
      tooltip: {
        trigger: 'item', confine: true,
        formatter: (p: { name: string; value: number }) =>
          `${p.name}<br>${formatNumber(p.value, s.tooltip?.format, unitOf(s))} · ${formatNumber((p.value / total) * 100, 'percent')}`,
      },
      series: [{
        type: 'pie', name: primary(table)?.name ?? '',
        radius: [`${inner}%`, `${outer}%`],
        center: variant === 'half' ? [cx, '72%'] : [cx, side === 'top' ? '55%' : side === 'bottom' ? '45%' : '50%'],
        ...(variant === 'half' ? { startAngle: 180, endAngle: 360 } : {}),
        roseType: (s.pie?.rose ?? variant === 'rose') ? 'area' : undefined,
        itemStyle: { borderRadius: 4, borderWidth: 1 },
        avoidLabelOverlap: true,
        label: {
          // The share first, then the name, cut to the room ECharts finds between the ring and the
          // edge (no fixed width: a set width overrides that, and a label ran off a narrow chart).
          // Cut from the end, the name goes and the share stays; the tooltip has the whole of it.
          ...labelOption(s, !lg, 'outside'), overflow: 'truncate', ellipsis: '…',
          formatter: (p: { name: string; percent: number }) => `${Math.round(p.percent)}% ${shortLabel(p.name, 24)}`,
        },
        data: xs.map((name, i) => ({ name, value: values[i] })),
      }],
    }, categoryPicker(table, otherAt));
  };
}

const nestedPie: Builder = (table, s, theme) => {
  const shaped = grid(table);
  const totals = shaped.xs.map((_, x) => shaped.series.reduce((sum, _s, i) => sum + (shaped.cell[i][x] ?? 0), 0));
  const inner = shaped.xs.map((x, i) => ({ name: valueText(table.dims[0], x), value: totals[i], itemStyle: { color: theme.palette[i % theme.palette.length] } }));
  const outer: Obj[] = [];
  const outerAt: [string, string][] = [];
  shaped.xs.forEach((x, xi) => shaped.series.forEach((name, si) => {
    const value = shaped.cell[si][xi];
    if (value) outerAt.push([x, name]);
    if (value) outer.push({
      name: `${valueText(table.dims[0], x)} · ${valueText(table.dims[1], name)}`, value,
      // Shades of the inner slice's colour, drawn solid so a label's ink is measured on what is drawn.
      itemStyle: { color: blend(theme.palette[xi % theme.palette.length], theme.tokens.surface, 0.45 - 0.45 * ((si % 3) / 2)) },
    });
  }));
  const fmt = (v: number) => formatNumber(v, s.tooltip?.format, unitOf(s));
  return withPicker({
    tooltip: { trigger: 'item', confine: true, formatter: (p: { name: string; value: number; percent: number }) => `${p.name}<br>${fmt(p.value)} · ${Math.round(p.percent)}%` },
    series: [
      { type: 'pie', radius: [0, `${s.pie?.inner ?? 34}%`], data: inner,
        // Named inside the slice only where the slice is wide enough to hold the name.
        label: { position: 'inner', fontSize: labelPx(s), width: 90, overflow: 'truncate', formatter: (p: { name: string; percent: number }) => (p.percent >= 9 ? p.name : '') }, itemStyle: { borderColor: theme.tokens.surface, borderWidth: 1 } },
      { type: 'pie', radius: [`${(s.pie?.inner ?? 34) + 8}%`, `${s.pie?.outer ?? 72}%`], label: { show: s.labels?.show ?? outer.length <= 16, fontSize: labelPx(s), overflow: 'truncate', ellipsis: '…' }, data: outer, itemStyle: { borderColor: theme.tokens.surface, borderWidth: 1 } },
    ],
  }, click => {
    const at = click.dataIndex;
    if (at === undefined) return null;
    if (click.seriesIndex === 0) return pickOf(table, { 0: shaped.xs[at] });
    const pair = outerAt[at];
    return pair ? pickOf(table, { 0: pair[0], 1: pair[1] }) : null;
  });
};

/** Least squares through the points, and how much of the spread it explains. */
export function trendLine(points: [number, number][]): { slope: number; intercept: number; r2: number } {
  const n = points.length;
  const mx = points.reduce((sum, [x]) => sum + x, 0) / n;
  const my = points.reduce((sum, [, y]) => sum + y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of points) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  const slope = sxx ? sxy / sxx : 0;
  return { slope, intercept: my - slope * mx, r2: sxx && syy ? (sxy * sxy) / (sxx * syy) : 0 };
}

function scatterPoints(table: ChartTable, count: number): { names: string[]; points: number[][]; axes: string[]; rows: number[] } {
  const nums = quantities(table).slice(0, count);
  const names: string[] = [];
  const points: number[][] = [];
  const rows: number[] = [];
  for (let row = 0; row < table.length; row++) {
    const values = nums.map(q => q.values[row]);
    if (values.some(v => v === null || v === undefined)) continue;
    points.push(values as number[]);
    names.push(rowLabel(table, row));
    rows.push(row);
  }
  return { names, points, axes: nums.map(q => q.name), rows };
}

function scatterKind(variant: 'trend' | 'bubble' | 'effect'): Builder {
  return (table, s) => {
    const { names, points, axes, rows } = scatterPoints(table, variant === 'bubble' ? 3 : 2);
    const n = points.length;
    const zoom = s.zoom ?? n > ZOOM_FROM.scatter;
    const fmt = (v: number) => formatNumber(v, s.tooltip?.format);
    const sizes = variant === 'bubble' ? points.map(p => Math.abs(p[2])) : [];
    const biggest = Math.max(1, ...sizes);
    const series: Obj[] = [{
      type: 'scatter', name: axes[1] ?? '', data: points.map((p, i) => ({ value: p, name: names[i] })),
      symbolSize: variant === 'bubble' ? (value: number[]) => 6 + 38 * Math.sqrt(Math.abs(value[2]) / biggest) : n > 500 ? 4 : 8,
      itemStyle: { opacity: variant === 'bubble' ? 0.7 : 0.85 },
      ...bigData('scatter', n),
      markLine: markLines(s),
    }];
    if (variant === 'trend' && n >= 2) {
      const fit = trendLine(points.map(p => [p[0], p[1]] as [number, number]));
      const xs = points.map(p => p[0]);
      const lo = Math.min(...xs), hi = Math.max(...xs);
      series.push({
        type: 'line', name: `Trend (r² ${fit.r2.toFixed(2)})`, showSymbol: false, silent: true,
        lineStyle: { type: 'dashed', width: 2 }, data: [[lo, fit.intercept + fit.slope * lo], [hi, fit.intercept + fit.slope * hi]],
      });
    }
    let top: { p: number[]; i: number }[] = [];
    if (variant === 'effect') {
      top = points.map((p, i) => ({ p, i })).sort((a, b) => b.p[1] - a.p[1]).slice(0, 5);
      series.push({
        type: 'effectScatter', name: 'Top five', symbolSize: 12, rippleEffect: { scale: 3, brushType: 'stroke' },
        data: top.map(({ p, i }) => ({ value: p, name: names[i] })), zlevel: 1,
      });
    }
    const lg = legend(s, series.length, true);
    return withPicker({
      legend: lg,
      grid: gridBox(s, lg, zoom),
      tooltip: {
        trigger: 'item', confine: true,
        formatter: (p: { name: string; value: number[] }) => [p.name, ...axes.map((axis, i) => `${axis}: ${fmt(p.value[i])}`)].filter(Boolean).join('<br>'),
      },
      xAxis: axisFrom({ type: 'value', scale: true, name: axes[0], nameLocation: 'middle', nameGap: 26, splitLine: { show: false } }, s.xAxis, true),
      yAxis: axisFrom({ type: 'value', scale: true, name: axes[1], nameLocation: 'middle', nameGap: 44, nameRotate: 90 }, s.yAxis, true),
      dataZoom: zoom ? [{ type: 'inside', xAxisIndex: 0 }, { type: 'inside', yAxisIndex: 0 }, { type: 'slider', xAxisIndex: 0, height: 18, bottom: 6, showDetail: false }] : undefined,
      series,
    }, click => {
      const at = click.dataIndex;
      if (at === undefined) return null;
      if (click.seriesIndex === 0) return rowPick(table, rows[at]);
      return click.seriesType === 'effectScatter' && top[at] ? rowPick(table, rows[top[at].i]) : null;
    });
  };
}

/** Quartiles and Tukey whiskers, the shape a box plot draws. */
export function boxStats(values: number[]): { box: [number, number, number, number, number]; outliers: number[] } {
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p: number) => {
    const at = (sorted.length - 1) * p;
    const lo = Math.floor(at), hi = Math.ceil(at);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
  };
  const q1 = q(0.25), q2 = q(0.5), q3 = q(0.75);
  const reach = 1.5 * (q3 - q1);
  const inside = sorted.filter(v => v >= q1 - reach && v <= q3 + reach);
  return {
    box: [inside[0] ?? q1, q1, q2, q3, inside[inside.length - 1] ?? q3],
    outliers: sorted.filter(v => v < q1 - reach || v > q3 + reach),
  };
}

function groupsOf(table: ChartTable): { name: string; values: number[]; raw?: string }[] {
  const values = figures(table);
  if (table.dims.length !== 2) return [{ name: primary(table)?.name ?? 'All', values }];
  const out = new Map<string, number[]>();
  table.dims[0].values.forEach((group, row) => {
    const list = out.get(group) ?? [];
    list.push(values[row]);
    out.set(group, list);
  });
  return [...out].map(([name, list]) => ({ name: valueText(table.dims[0], name), values: list, raw: name }));
}

const boxplot: Builder = (table, s) => {
  const groups = groupsOf(table).filter(group => group.values.length);
  const stats = groups.map(group => boxStats(group.values));
  const fmt = (v: number) => formatNumber(v, s.tooltip?.format, unitOf(s));
  const group = (at: number | undefined) => (table.dims.length === 2 && at !== undefined ? pickOf(table, { 0: groups[at]?.raw }) : null);
  return withPicker({
    grid: gridBox(s, undefined, false),
    tooltip: {
      trigger: 'item', confine: true,
      formatter: (p: { seriesType: string; name: string; value: number[] }) => p.seriesType === 'boxplot'
        ? `${p.name}<br>Highest ${fmt(p.value[5])}<br>Upper quartile ${fmt(p.value[4])}<br>Median ${fmt(p.value[3])}<br>Lower quartile ${fmt(p.value[2])}<br>Lowest ${fmt(p.value[1])}`
        : `${p.name}<br>Outlier ${fmt(p.value[1])}`,
    },
    xAxis: axisFrom({ type: 'category', data: groups.map(g => g.name) }, s.xAxis, false),
    yAxis: axisFrom({ type: 'value', scale: true }, s.yAxis, true),
    series: [
      { type: 'boxplot', name: primary(table)?.name ?? '', data: stats.map(st => st.box), itemStyle: { borderWidth: 1.5 }, colorBy: 'data' },
      { type: 'scatter', name: 'Outliers', symbolSize: 5, data: stats.flatMap((st, i) => st.outliers.map(v => [i, v])) },
    ],
  }, click => group(click.seriesIndex === 0 ? click.dataIndex : (click.value as number[] | undefined)?.[0]));
};

/** A Gaussian kernel density on a grid of points, with Silverman's bandwidth. */
export function density(values: number[], points = 96): [number, number][] {
  const n = values.length;
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const sd = Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / Math.max(1, n - 1)) || 1;
  const h = 1.06 * sd * n ** -0.2;
  const lo = Math.min(...values) - 2 * h, hi = Math.max(...values) + 2 * h;
  const step = (hi - lo) / (points - 1);
  const out: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const x = lo + i * step;
    let sum = 0;
    for (const v of values) sum += Math.exp(-0.5 * ((x - v) / h) ** 2);
    out.push([x, sum / (n * h * Math.sqrt(2 * Math.PI))]);
  }
  return out;
}

const densityKind: Builder = (table, s) => {
  const groups = groupsOf(table).filter(group => group.values.length >= 2);
  const lg = legend(s, groups.length, true);
  return withPicker({
    legend: lg,
    grid: gridBox(s, lg, false),
    tooltip: { trigger: 'axis', confine: true, valueFormatter: (v: number) => v.toPrecision(3) },
    xAxis: axisFrom({ type: 'value', scale: true, name: primary(table)?.name, nameLocation: 'middle', nameGap: 26 }, s.xAxis, true),
    yAxis: { type: 'value', axisLabel: { show: false }, splitLine: { show: false } },
    series: groups.map(group => ({
      // The curve and its fill report a click (triggerEvent): a density draws no points to click.
      type: 'line', name: group.name, data: density(group.values), smooth: 0.3, showSymbol: false, triggerEvent: true,
      lineStyle: { width: s.line?.width ?? 2 }, areaStyle: { opacity: s.line?.areaOpacity ?? 0.2 },
    })),
  }, click => (table.dims.length === 2 ? pickOf(table, { 0: groups[click.seriesIndex ?? -1]?.raw }) : null));
};

/** `path` is the node's dimension values as the table holds them: what a click on it narrows to. */
interface TreeNode { name: string; value?: number; path: string[]; children?: TreeNode[]; itemStyle?: Obj; label?: Obj; upperLabel?: Obj }

/** The dimensions nested, the primary measure on the leaves and summed up the branches. */
export function treeOf(table: ChartTable): TreeNode[] {
  const roots: TreeNode[] = [];
  const values = figures(table);
  for (let row = 0; row < table.length; row++) {
    let level = roots;
    table.dims.forEach((dim, depth) => {
      const name = valueText(dim, dim.values[row]);
      let node = level.find(item => item.name === name);
      if (!node) { node = { name, path: table.dims.slice(0, depth + 1).map(d => d.values[row]) }; level.push(node); }
      node.value = (node.value ?? 0) + values[row];
      if (depth < table.dims.length - 1) level = node.children ??= [];
    });
  }
  return roots;
}

/**
 * Colours every node itself -- a top-level one from the palette, each child a step lighter or
 * darker than its parent -- so the ink of every label is measured against the fill it sits on.
 * ECharts' own colour-saturation levels paint fills nobody can read back to choose a label colour.
 */
function paintTree(nodes: TreeNode[], palette: string[], s: ChartSettings, tokens: ChartTokenSet, parent?: string): void {
  nodes.forEach((node, i) => {
    const fill = parent === undefined ? palette[i % palette.length] : blend(parent, tokens.surface, 0.12 * (1 + (i % 3)));
    const ink = labelInk(fill, true, s, tokens);
    node.itemStyle = { ...(node.itemStyle ?? {}), color: fill };
    node.label = { color: ink };
    node.upperLabel = { color: ink };
    if (node.children) paintTree(node.children, palette, s, tokens, fill);
  });
}

/** What a click on a tree-shaped kind picked: the node's own path, else its names read back. */
function treePicker(table: ChartTable, leavesOnly = false): Picker {
  const back = table.dims.map(rawByText);
  return click => {
    const node = click.data as Partial<TreeNode> | undefined;
    if (leavesOnly && node?.children?.length) return null;
    if (Array.isArray(node?.path)) return pickOf(table, Object.fromEntries(node.path.map((v, i) => [i, v])));
    const names = (click.treePathInfo ?? click.treeAncestors ?? []).map(step => step.name).slice(1);
    return pickOf(table, Object.fromEntries(names.slice(0, table.dims.length).map((name, i) => [i, back[i]?.get(name)])));
  };
}

const treemap: Builder = (table0, s, theme, context) => {
  const { table, otherAt } = table0.dims.length === 1 ? cutTable(table0, s, 'desc') : { table: table0, otherAt: -1 };
  const fmt = (v: number) => formatNumber(v, s.tooltip?.format, unitOf(s));
  const nodes = treeOf(table);
  paintTree(nodes, theme.palette, s, theme.tokens);
  // The rolled-up tail is not a value in the data: a click on it narrows nothing.
  const last = nodes[nodes.length - 1];
  if (otherAt >= 0 && last?.path[0] === OTHER) last.path = [];
  const pick = treePicker(table);
  return withPicker({
    tooltip: { trigger: 'item', confine: true, formatter: (p: { treePathInfo: { name: string }[]; value: number }) => `${p.treePathInfo.map(i => i.name).filter(Boolean).join(' › ')}<br>${fmt(p.value)}` },
    series: [{
      // A click narrows the board where it can; zooming into a branch is then the breadcrumb's job.
      type: 'treemap', name: primary(table)?.name ?? '', data: nodes, roam: false, nodeClick: context.clickable ? false : 'zoomToNode',
      top: s.title?.text ? 40 : 4, left: 4, right: 4, bottom: table.dims.length > 1 ? 30 : 4,
      breadcrumb: { show: table.dims.length > 1, height: 18, bottom: 0, itemStyle: { textStyle: { fontSize: CAPTION } } },
      label: { show: s.labels?.show ?? true, fontSize: labelPx(s), overflow: 'truncate', ellipsis: '…', textBorderWidth: 0, formatter: (p: { name: string; value: number }) => `${p.name}\n${formatNumber(p.value, s.labels?.format ?? 'compact')}` },
      upperLabel: { show: table.dims.length > 1, height: labelPx(s) + 7, fontSize: labelPx(s), overflow: 'truncate', ellipsis: '…', textBorderWidth: 0 },
      // Gaps in the card's colour: ECharts paints them white, a grid of white lines on a dark card.
      itemStyle: { borderWidth: 1, gapWidth: 1, borderColor: theme.tokens.surface },
      levels: [
        { itemStyle: { gapWidth: 2, borderColor: theme.tokens.surface }, upperLabel: { show: false } },
        { itemStyle: { gapWidth: 1, borderColor: theme.tokens.surface } },
      ],
    }],
  }, click => {
    const node = click.data as Partial<TreeNode> | undefined;
    return Array.isArray(node?.path) && !node.path.length ? null : pick(click);
  });
};

const sunburst: Builder = (table, s, theme, context) => {
  const fmt = (v: number) => formatNumber(v, s.tooltip?.format, unitOf(s));
  const nodes = treeOf(table);
  paintTree(nodes, theme.palette, s, theme.tokens);
  return withPicker({
    tooltip: { trigger: 'item', confine: true, formatter: (p: { treePathInfo: { name: string }[]; value: number }) => `${p.treePathInfo.map(i => i.name).filter(Boolean).join(' › ')}<br>${fmt(p.value)}` },
    series: [{
      type: 'sunburst', data: nodes, radius: [`${s.pie?.inner ?? 12}%`, `${s.pie?.outer ?? 92}%`], sort: undefined,
      nodeClick: context.clickable ? false : 'rootToNode',
      itemStyle: { borderColor: theme.tokens.surface, borderWidth: 1 },
      label: { show: s.labels?.show ?? true, fontSize: labelPx(s), minAngle: 8, rotate: 'radial', overflow: 'truncate', textBorderWidth: 0 },
      emphasis: { focus: 'ancestor' },
    }],
  }, treePicker(table));
};

const tree: Builder = (table, s) => {
  // Opened one level down when there are more leaves than lines to give them; a click opens a branch.
  const leaves = table.length;
  return withPicker({
  tooltip: { trigger: 'item', confine: true, formatter: (p: { name: string; value: number }) => `${p.name}<br>${formatNumber(p.value, s.tooltip?.format, unitOf(s))}` },
  series: [{
    type: 'tree', data: [{ name: primary(table)?.name ?? 'All', children: treeOf(table) }],
    top: 8, bottom: 8, left: 80, right: 140, symbolSize: 7, initialTreeDepth: leaves > 24 ? 1 : -1,
    label: { position: 'left', verticalAlign: 'middle', align: 'right', fontSize: labelPx(s, 'small'), width: 72, overflow: 'truncate', ellipsis: '…' },
    leaves: { label: { position: 'right', align: 'left', formatter: (p: { name: string; value: number }) => `${p.name}  ${formatNumber(p.value, 'compact')}` } },
    expandAndCollapse: true, animationDuration: 280,
  }],
  // A branch's click opens or closes it, so only a leaf narrows: one click must not do both.
  }, treePicker(table, true));
};

/**
 * Sankey nodes have to be unique by name, and the same value can stand at two stages ("north"
 * shipping to "north"). Each stage's names carry that many zero-width spaces, which draw as
 * nothing and keep the graph acyclic.
 */
export function flowOf(table: ChartTable): { nodes: { name: string }[]; links: { source: string; target: string; value: number }[] } {
  const values = figures(table);
  const tag = (depth: number, value: string) => valueText(table.dims[depth], value) + '​'.repeat(depth);
  const nodes = new Map<string, { name: string }>();
  const links = new Map<string, { source: string; target: string; value: number }>();
  for (let row = 0; row < table.length; row++) {
    if (values[row] <= 0) continue;
    for (let depth = 0; depth < table.dims.length - 1; depth++) {
      const source = tag(depth, table.dims[depth].values[row]);
      const target = tag(depth + 1, table.dims[depth + 1].values[row]);
      nodes.set(source, { name: source });
      nodes.set(target, { name: target });
      const key = `${source}\u0000${target}`;
      const link = links.get(key) ?? { source, target, value: 0 };
      link.value += values[row];
      links.set(key, link);
    }
  }
  return { nodes: [...nodes.values()], links: [...links.values()] };
}

const sankey: Builder = (table, s) => {
  const flow = flowOf(table);
  const back = table.dims.map(rawByText);
  /** A node's name is its value at its stage, tagged with one zero-width space per stage. */
  const node = (name: string | undefined): Record<number, string | undefined> | null => {
    if (name === undefined) return null;
    const depth = name.length - name.replace(/\u200b+$/, '').length;
    return { [depth]: back[depth]?.get(name.replace(/\u200b+$/, '')) };
  };
  return withPicker({
    tooltip: { trigger: 'item', confine: true, valueFormatter: (v: number) => formatNumber(v, s.tooltip?.format, unitOf(s)) },
    series: [{
      type: 'sankey', data: flow.nodes, links: flow.links, nodeAlign: 'justify', nodeGap: 8, nodeWidth: 12,
      top: s.title?.text ? 44 : 8, bottom: 8, left: 8, right: 90,
      emphasis: { focus: 'adjacency' }, lineStyle: { color: 'gradient', opacity: 0.35, curveness: 0.5 },
      label: { fontSize: labelPx(s), width: 84, overflow: 'truncate', ellipsis: '…' },
    }],
  }, click => {
    const item = click.data as { name?: string; source?: string; target?: string } | undefined;
    if (click.dataType === 'edge') {
      const from = node(item?.source), to = node(item?.target);
      return from && to ? pickOf(table, { ...from, ...to }) : null;
    }
    const one = node(item?.name ?? click.name);
    return one ? pickOf(table, one) : null;
  });
};

const chord: Builder = (table, s) => {
  const values = figures(table);
  const names = distinct([...table.dims[0].values, ...table.dims[1].values]);
  const links = new Map<string, { source: string; target: string; value: number }>();
  for (let row = 0; row < table.length; row++) {
    const source = table.dims[0].values[row], target = table.dims[1].values[row];
    if (values[row] <= 0 || source === target) continue;
    const key = `${source}\u0000${target}`;
    const link = links.get(key) ?? { source, target, value: 0 };
    link.value += values[row];
    links.set(key, link);
  }
  const first = new Set(table.dims[0].values);
  // A name can stand on either side; it narrows the side it is found on first.
  const side = (name: string | undefined) => (name === undefined ? {} : first.has(name) ? { 0: name } : { 1: name });
  return withPicker({
    tooltip: { trigger: 'item', confine: true, valueFormatter: (v: number) => formatNumber(v, s.tooltip?.format, unitOf(s)) },
    series: [{
      type: 'chord', data: names.map(name => ({ name })), links: [...links.values()], radius: ['70%', '78%'],
      padAngle: 2, minAngle: 2, label: { show: s.labels?.show ?? names.length <= 24, fontSize: labelPx(s, 'small'), width: 90, overflow: 'truncate', ellipsis: '…' },
      lineStyle: { color: 'source', opacity: 0.4 }, emphasis: { focus: 'adjacency' },
    }],
  }, click => {
    const item = click.data as { name?: string; source?: string; target?: string } | undefined;
    if (click.dataType === 'edge') return pickOf(table, { 0: item?.source, 1: item?.target });
    return pickOf(table, side(item?.name ?? click.name));
  });
};

const heatmap: Builder = (table, s, theme) => {
  const shaped = grid(table);
  const data: [number, number, number][] = [];
  shaped.cell.forEach((row, y) => row.forEach((value, x) => { if (value !== null) data.push([x, y, value]); }));
  const values = data.map(d => d[2]);
  const low = Math.min(...values), high = Math.max(...values);
  const labelled = s.labels?.show ?? data.length <= 60;
  // The cell's colour as the visual map paints it (a straight run from sunken to heat), so a
  // figure written in the cell is black or white by that cell's own fill.
  const cells = labelled
    ? data.map(d => ({ value: d, label: { color: labelInk(blend(theme.tokens.sunken, theme.tokens.heat, high > low ? (d[2] - low) / (high - low) : 1), true, s, theme.tokens) } }))
    : data;
  return withPicker({
    grid: { ...gridBox(s, undefined, false), bottom: 44 },
    tooltip: {
      trigger: 'item', confine: true,
      formatter: (p: { value: [number, number, number] }) =>
        `${valueText(table.dims[0], shaped.xs[p.value[0]])} · ${valueText(table.dims[1], shaped.series[p.value[1]])}<br>${formatNumber(p.value[2], s.tooltip?.format, unitOf(s))}`,
    },
    xAxis: axisFrom({ type: 'category', data: shaped.xs.map(x => valueText(table.dims[0], x)), splitArea: { show: false } }, s.xAxis, false),
    yAxis: axisFrom({ type: 'category', data: shaped.series.map(y => valueText(table.dims[1], y)) }, s.yAxis, false),
    visualMap: {
      min: low, max: high, calculable: false, orient: 'horizontal', left: 'center', bottom: 0,
      itemHeight: 120, itemWidth: 10, text: [formatNumber(high, 'compact'), formatNumber(low, 'compact')],
    },
    series: [{ type: 'heatmap', name: primary(table)?.name ?? '', data: cells, label: labelOption(s, labelled, 'inside'), progressive: 2000, emphasis: { itemStyle: { borderWidth: 1 } } }],
  }, click => {
    const [x, y] = (click.value as [number, number, number] | undefined) ?? [];
    return x === undefined || y === undefined ? null : pickOf(table, { 0: shaped.xs[x], 1: shaped.series[y] });
  });
};

const calendar: Builder = (table, s, _theme, context) => {
  const values = figures(table);
  const byDay = new Map<string, number>();
  table.dims[0].values.forEach((value, row) => {
    const day = dayKey(value);
    if (day) byDay.set(day, (byDay.get(day) ?? 0) + values[row]);
  });
  const years = distinct([...byDay.keys()].map(day => day.split('-')[0])).sort();
  const all = [...byDay.values()];
  // Each year a band of the drawing's height, a week's seven rows to fit it, the scale below.
  const top = context.interactive ? 40 : 20;
  const band = Math.max(60, ((context.height ?? 220) - top - 34) / Math.max(1, years.length));
  const cell = Math.max(6, Math.floor((band - 20) / 7));
  // A day back to the value it came from: a date column has one per day, so this is exact there.
  // A square standing for several values (date-times) narrows to none of them rather than to one.
  const byKey = new Map<string, string | null>();
  table.dims[0].values.forEach(value => {
    const day = dayKey(value);
    if (day) byKey.set(day, byKey.has(day) && byKey.get(day) !== value ? null : value);
  });
  return withPicker({
    tooltip: {
      trigger: 'item', confine: true,
      formatter: (p: { value: [string, number] }) => `${dayLabel(p.value[0])}<br>${formatNumber(p.value[1], s.tooltip?.format, unitOf(s))}`,
    },
    visualMap: {
      min: Math.min(...all), max: Math.max(...all), calculable: false, orient: 'horizontal', left: 'center', bottom: 0,
      itemHeight: 120, itemWidth: 10,
    },
    // The year sits left of the weekday initials, with room for both; the toolbox gets the top row.
    calendar: years.map((year, i) => ({
      range: year, top: top + i * band, left: years.length > 1 ? 58 : 36, right: 12, cellSize: ['auto', cell], orient: 'horizontal',
      yearLabel: { show: years.length > 1, position: 'left', margin: 30, fontSize: CAPTION },
      dayLabel: { firstDay: 1, nameMap: ['S', 'M', 'T', 'W', 'T', 'F', 'S'], margin: 6, fontSize: CAPTION },
      monthLabel: { margin: 4, fontSize: CAPTION },
    })),
    series: years.map((year, i) => ({
      type: 'heatmap', coordinateSystem: 'calendar', calendarIndex: i,
      data: [...byDay].filter(([day]) => day.split('-')[0] === year),
    })),
  }, click => {
    const day = (click.value as [string, number] | undefined)?.[0];
    return day ? pickOf(table, { 0: byKey.get(day) ?? undefined }) : null;
  });
};

const funnel: Builder = (table0, s, theme) => {
  // Past the limit a funnel draws its largest stages and SAYS it left the rest out. Not an "Other":
  // a rolled-up tail is not a stage of anything, and drawn last it turned the funnel upside down.
  const limit = CATEGORY_LIMIT.funnel!;
  const over = s.topN === undefined && table0.dims.length === 1 && table0.length > limit;
  const table = over ? sortAndCut(table0, 'desc', limit, false).table : cutTable(table0, s).table;
  const xs = labels(table);
  const values = figures(table);
  const lg = legend(s, xs.length, false);
  const sort = s.sort === 'asc' ? 'ascending' : s.sort === 'none' ? 'none' : 'descending';
  // Few stages carry their names inside; more than a handful are too thin, so the names go beside.
  const inside = (s.labels?.position ?? 'auto') === 'inside' || ((s.labels?.position ?? 'auto') === 'auto' && xs.length <= 6);
  const titled = !!s.title?.text || over;
  return withPicker({
    legend: lg,
    ...(over && !s.title?.text ? { title: { text: '', subtext: `The largest ${limit} of ${table0.length}; the rest are not drawn.`, left: 'left', top: 0, itemGap: 0 } } : {}),
    tooltip: { trigger: 'item', confine: true, valueFormatter: (v: number) => formatNumber(v, s.tooltip?.format, unitOf(s)) },
    series: [{
      type: 'funnel', name: primary(table)?.name ?? '', sort,
      left: '8%', right: inside ? '8%' : '34%', top: titled ? 30 : 8, bottom: 8, gap: 2, minSize: '8%',
      label: {
        ...labelOption(s, true, inside ? 'inside' : 'right'), width: inside ? undefined : 150, overflow: 'truncate', ellipsis: '…',
        formatter: (p: { name: string; value: number }) => `${p.name}  ${formatNumber(p.value, s.labels?.format ?? 'compact')}`,
      },
      labelLine: { show: !inside, length: 8 },
      itemStyle: { borderWidth: 0 },
      data: xs.map((name, i) => ({ name, value: values[i], itemStyle: { color: theme.palette[i % theme.palette.length] } })),
    }],
  }, categoryPicker(table));
};

/** A round number at or above a figure, for a gauge's end: 873 -> 1000, 0.42 -> 0.5. */
export function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (step * magnitude >= value) return step * magnitude;
  return 10 * magnitude;
}

const gauge: Builder = (table, s, theme, context) => {
  const { value, target: inRow } = gaugeFigures(table);
  const target = s.refLines?.target ?? inRow;
  const max = s.yAxis?.max ?? niceCeiling(Math.max(value, target ?? 0) * 1.1);
  const min = s.yAxis?.min ?? Math.min(0, value);
  const unit = unitOf(s);
  const series: Obj[] = [{
    type: 'gauge', min, max, startAngle: 210, endAngle: -30, radius: '92%', center: ['50%', '58%'],
    progress: { show: true, width: 14, roundCap: true },
    axisLine: { lineStyle: { width: 14, color: [[1, theme.tokens.sunken]] }, roundCap: true },
    pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false },
    axisLabel: { distance: 18, fontSize: CAPTION, color: theme.tokens.textSecondary, formatter: axisNumber('compact', unit) },
    anchor: { show: false }, title: { show: true, offsetCenter: [0, '26%'], fontSize: CAPTION, color: theme.tokens.textSecondary, width: 160, overflow: 'truncate', ellipsis: '…' },
    detail: {
      // The reading is the answer, like a single figure: it grows with the tile, up to a cap.
      valueAnimation: true, offsetCenter: [0, '-4%'], fontSize: figurePx(context.height), fontWeight: 600, color: theme.tokens.text,
      formatter: (v: number) => formatNumber(v, s.labels?.format ?? 'compact', unit),
    },
    data: [{ value, name: target !== null && target !== undefined ? `of ${formatNumber(target, 'auto', unit)} target` : primary(table)?.name ?? '' }],
  }];
  if (target !== null && target !== undefined) {
    series.push({
      type: 'gauge', min, max, startAngle: 210, endAngle: -30, radius: '92%', center: ['50%', '58%'],
      axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, progress: { show: false },
      pointer: { icon: 'triangle', length: 12, width: 10, offsetCenter: [0, '-98%'], itemStyle: { color: theme.tokens.text } },
      detail: { show: false }, title: { show: false }, data: [{ value: target, name: s.refLines?.label || 'Target' }],
    });
  }
  return withPicker({ tooltip: { trigger: 'item', confine: true, valueFormatter: (v: number) => formatNumber(v, s.tooltip?.format, unit) }, series },
    () => rowPick(table, 0));
};

const radar: Builder = (table, s) => {
  let indicators: { name: string; max: number }[];
  let series: { name: string; value: number[] }[];
  let pick: Picker;
  if (table.measures.length >= 3) {
    pick = click => rowPick(table, click.dataIndex);
    indicators = table.measures.map(measure => ({ name: measure.name, max: niceCeiling(Math.max(0, ...measure.values.map(v => v ?? 0))) }));
    series = Array.from({ length: table.length }, (_, row) => ({ name: rowLabel(table, row), value: table.measures.map(m => m.values[row] ?? 0) }));
  } else {
    const shaped = grid(table);
    const spokes = shaped.series;
    pick = click => (click.dataIndex === undefined ? null : pickOf(table, { 0: shaped.xs[click.dataIndex] }));
    const max = niceCeiling(Math.max(0, ...figures(table)));
    indicators = spokes.map(name => ({ name: valueText(table.dims[1], name), max }));
    series = shaped.xs.map((x, xi) => ({ name: valueText(table.dims[0], x), value: spokes.map((_, si) => shaped.cell[si][xi] ?? 0) }));
  }
  const lg = legend(s, series.length, true);
  return withPicker({
    legend: lg,
    tooltip: { trigger: 'item', confine: true, valueFormatter: (v: number) => formatNumber(v, s.tooltip?.format, unitOf(s)) },
    radar: { indicator: indicators, radius: '66%', center: ['50%', lg && (s.legend?.position ?? 'top') === 'top' ? '56%' : '50%'], splitNumber: 4, axisName: { fontSize: CAPTION, width: 90, overflow: 'truncate', ellipsis: '…' } },
    series: [{
      type: 'radar', symbolSize: 4, lineStyle: { width: s.line?.width ?? 2 }, areaStyle: { opacity: s.line?.areaOpacity ?? 0.12 },
      data: series,
    }],
  }, pick);
};

const parallel: Builder = (table, s) => {
  const axes: Obj[] = [
    ...table.dims.map((dim, dimIndex) => ({ dim: dimIndex, name: dim.name, type: 'category', data: distinct(dim.values).map(v => valueText(dim, v)) })),
    ...table.measures.map((measure, i) => ({ dim: table.dims.length + i, name: measure.name, type: 'value', scale: true, axisLabel: { formatter: axisNumber('compact') } })),
  ];
  const data = Array.from({ length: table.length }, (_, row) => [
    ...table.dims.map(dim => valueText(dim, dim.values[row])),
    ...table.measures.map(m => m.values[row]),
  ]);
  const names = axes.map(axis => String(axis['name'] ?? ''));
  return withPicker({
    tooltip: {
      trigger: 'item', confine: true,
      formatter: (p: { value: (string | number)[] }) => (p.value ?? [])
        .map((v, i) => `${names[i]}: ${typeof v === 'number' ? formatNumber(v, s.tooltip?.format) : v}`).join('<br>'),
    },
    parallel: { left: 40, right: 60, top: s.title?.text ? 56 : 36, bottom: 24, parallelAxisDefault: { nameTextStyle: { fontSize: CAPTION, width: 90, overflow: 'truncate', ellipsis: '…' }, axisLabel: { fontSize: CAPTION } } },
    parallelAxis: axes,
    series: [{
      type: 'parallel', lineStyle: { width: 1, opacity: table.length > 500 ? 0.15 : 0.45 }, data,
      progressive: 1000, progressiveThreshold: 3000, smooth: false,
      emphasis: { lineStyle: { width: 2, opacity: 1 } },
    }],
  }, click => rowPick(table, click.dataIndex));
};

const themeRiver: Builder = (table, s) => {
  const values = figures(table);
  const data: [number, number, string][] = [];
  const dayOf = new Map<number, string>();
  for (let row = 0; row < table.length; row++) {
    const moment = instantOf(table.dims[0].values[row]);
    if (moment) {
      data.push([moment.getTime(), values[row], valueText(table.dims[1], table.dims[1].values[row])]);
      if (!dayOf.has(moment.getTime())) dayOf.set(moment.getTime(), table.dims[0].values[row]);
    }
  }
  const lg = legend(s, distinct(data.map(d => d[2])).length, true);
  const back = rawByText(table.dims[1]);
  return withPicker({
    legend: lg,
    tooltip: {
      trigger: 'axis', confine: true, axisPointer: { type: 'line' },
      // The day on the console's own clock, and each layer's figure in the chosen format.
      formatter: (params: { value: [number, number, string]; marker: string }[]) => {
        const day = params[0]?.value?.[0];
        const head = day === undefined ? '' : valueText(table.dims[0], dayOf.get(day) ?? '');
        return [head, ...params.map(p => `${p.marker}${p.value[2]}: ${formatNumber(p.value[1], s.tooltip?.format, unitOf(s))}`)].join('<br>');
      },
    },
    singleAxis: { type: 'time', top: lg ? 44 : 16, bottom: 30, left: 24, right: 24, axisLabel: { fontSize: CAPTION }, splitLine: { show: true, lineStyle: { type: 'dashed' } } },
    series: [{ type: 'themeRiver', data, label: { show: false }, emphasis: { focus: 'series' } }],
  }, click => {
    const layer = (click.value as [number, number, string] | undefined)?.[2] ?? click.name;
    return layer === undefined ? null : pickOf(table, { 1: back.get(layer) });
  });
};

const candlestick: Builder = (table, s, theme) => {
  const find = (name: string) => table.measures.find(m => m.name.toLowerCase().includes(name))!;
  const [open, high, low, close] = ['open', 'high', 'low', 'close'].map(find);
  const xs = labels(table);
  const n = xs.length;
  const zoom = s.zoom ?? n > ZOOM_FROM.category;
  const fmt = (v: number) => formatNumber(v, s.tooltip?.format, unitOf(s));
  return withPicker({
    grid: gridBox(s, undefined, zoom),
    tooltip: {
      trigger: 'axis', confine: true, axisPointer: { type: 'cross' },
      formatter: (params: { name: string; value: number[] }[]) => {
        const p = params[0];
        if (!p) return '';
        // value is [index, open, close, low, high] as ECharts hands it back.
        const [, o, c, l, h] = p.value;
        return `${p.name}<br>Open ${fmt(o)}<br>High ${fmt(h)}<br>Low ${fmt(l)}<br>Close ${fmt(c)}`;
      },
    },
    xAxis: axisFrom({ type: 'category', data: xs, boundaryGap: true }, s.xAxis, false),
    yAxis: axisFrom({ type: 'value', scale: true }, s.yAxis, true),
    dataZoom: dataZoom(zoom, 'x', n),
    series: [{
      type: 'candlestick', name: primary(table)?.name ?? '',
      data: xs.map((_, i) => [open.values[i], close.values[i], low.values[i], high.values[i]]),
      itemStyle: { color: theme.tokens.up, color0: theme.tokens.down, borderColor: theme.tokens.up, borderColor0: theme.tokens.down },
      ...bigData('bar', n), markLine: markLines(s),
    }],
  }, click => rowPick(table, click.dataIndex));
};

const BUILDERS: Record<EChartKind, Builder> = {
  barH: cartesian('bar', true),
  waterfall, pareto, barLine, polarBar, pictorialBar,
  lineSmooth: lineKind('smooth'),
  lineStep: lineKind('step'),
  lineMarkers: lineKind('markers'),
  areaStacked: lineKind('stacked'),
  areaShare: lineKind('share'),
  rose: pie('rose'),
  halfDonut: pie('half'),
  nestedPie,
  scatterTrend: scatterKind('trend'),
  bubble: scatterKind('bubble'),
  effectScatter: scatterKind('effect'),
  boxplot, density: densityKind,
  treemap, sunburst, tree,
  sankey, chord,
  heatmap, calendar,
  funnel, gauge, radar, parallel, themeRiver, candlestick,
};

/** How many points a table draws, for the animation and progressive switches. */
function pointCount(table: ChartTable): number {
  return table.length * Math.max(1, table.measures.length);
}

/**
 * The whole option for one kind: the kind's own series and axes, and around them the parts every
 * kind shares -- palette, title, animation, accessibility, and the toolbox.
 */
export function chartOption(table0: ChartTable, kind: EChartKind, settings: ChartSettings, theme: OptionTheme,
    context: OptionContext = {}): EOption {
  const builder = BUILDERS[kind];
  if (!builder || !table0.length) return {};
  const table = table0;
  const option = builder(table, settings, theme, context);
  const animate = settings.animation ?? pointCount(table) < ANIMATE_BELOW;
  const out: EOption = {
    color: theme.palette,
    aria: { enabled: true, decal: { show: false } },
    animation: animate,
    animationThreshold: ANIMATE_BELOW,
    ...option,
  };
  if (settings.title?.text || settings.title?.subtext) {
    out['title'] = { text: settings.title.text ?? '', subtext: settings.title.subtext ?? '', left: 'left', top: 0, itemGap: 4 };
  }
  inkLabels(out, theme, settings);
  sizeText(out, settings);
  // The pointer says a mark is a button only where a click on it does something.
  for (const one of (out['series'] as Obj[] | undefined) ?? []) {
    if (!one['silent']) one['cursor'] = context.clickable ? 'pointer' : 'default';
  }
  const tools = settings.toolbox ?? {};
  if (context.interactive && (tools.saveImage !== false || tools.dataView !== false)) {
    makeRoomForToolbox(out);
    const t = theme.tokens;
    out['toolbox'] = {
      show: true, right: 0, top: 0, itemSize: 13, itemGap: 8, showTitle: true,
      feature: {
        ...(tools.saveImage !== false ? {
          saveAsImage: { title: 'Save as PNG', type: 'png', pixelRatio: 2, backgroundColor: t.surface, name: (context.name || 'chart').replace(/[^\w.-]+/g, '-').slice(0, 80) },
        } : {}),
        ...(tools.dataView !== false ? {
          dataView: {
            title: 'Data view', readOnly: true, lang: [context.name || 'Data view', 'Close', 'Refresh'],
            backgroundColor: t.surface, textColor: t.text, textareaColor: t.sunken, textareaBorderColor: t.border,
            buttonColor: t.text, buttonTextColor: t.surface,
          },
        } : {}),
        ...(out['dataZoom'] || kind === 'treemap' || kind === 'sunburst' ? { restore: { title: 'Restore zoom' } } : {}),
      },
    };
  }
  const picker = PICKERS.get(option);
  return picker ? withPicker(out, picker) : out;
}

const asList = (value: unknown): Obj[] =>
  (Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : []).filter(item => item && typeof item === 'object') as Obj[];

/** The object at `key` on `owner`, made when it is missing, so a size can be written on it. */
function textAt(owner: Obj, key: string): Obj {
  const found = owner[key];
  if (found && typeof found === 'object' && !Array.isArray(found)) return found as Obj;
  const made: Obj = {};
  owner[key] = made;
  return made;
}

/**
 * Every piece of text in an option on the chart type scale (shared/charts/chart-type.ts), stated,
 * so nothing is left at an ECharts default: 12px for what is said about a mark (by the settings'
 * label size), 11px for the chrome around it -- axes, legends, reference lines, pins, breadcrumbs,
 * calendars -- and a gauge's reading sized to the drawing. Rich-text styles take their label's
 * size unless they name their own. Then every size is held to the scale's ends: never under 11px,
 * never over the 14px of the tile's title, except the reading.
 *
 * A size a builder chose is kept (within the ends); only the missing ones are filled.
 */
function sizeText(option: EOption, s: ChartSettings): void {
  const data = labelPx(s);
  const size = (text: Obj, px: number, figure = false) => {
    const own = typeof text['fontSize'] === 'number' ? text['fontSize'] as number : px;
    text['fontSize'] = figure ? own : Math.min(CHART_TYPE.title, Math.max(CAPTION, own));
    for (const style of Object.values((text['rich'] as Obj | undefined) ?? {})) {
      if (style && typeof style === 'object') {
        const rich = style as Obj;
        rich['fontSize'] = Math.min(CHART_TYPE.title, Math.max(CAPTION, typeof rich['fontSize'] === 'number' ? rich['fontSize'] as number : text['fontSize'] as number));
      }
    }
  };
  for (const key of ['xAxis', 'yAxis', 'radiusAxis', 'angleAxis', 'singleAxis', 'parallelAxis']) {
    for (const axis of asList(option[key])) { size(textAt(axis, 'axisLabel'), CAPTION); size(textAt(axis, 'nameTextStyle'), CAPTION); }
  }
  for (const parallel of asList(option['parallel'])) {
    const base = textAt(parallel, 'parallelAxisDefault');
    size(textAt(base, 'axisLabel'), CAPTION); size(textAt(base, 'nameTextStyle'), CAPTION);
  }
  for (const radar of asList(option['radar'])) size(textAt(radar, 'axisName'), CAPTION);
  for (const legend of asList(option['legend'])) { size(textAt(legend, 'textStyle'), CAPTION); size(textAt(legend, 'pageTextStyle'), CAPTION); }
  for (const tip of asList(option['tooltip'])) size(textAt(tip, 'textStyle'), CHART_TYPE.body);
  for (const title of asList(option['title'])) { size(textAt(title, 'textStyle'), CHART_TYPE.body); size(textAt(title, 'subtextStyle'), CAPTION); }
  for (const calendar of asList(option['calendar'])) for (const key of ['dayLabel', 'monthLabel', 'yearLabel']) size(textAt(calendar, key), CAPTION);
  for (const key of ['visualMap', 'dataZoom']) for (const one of asList(option[key])) size(textAt(one, 'textStyle'), CAPTION);
  for (const one of asList(option['series'])) {
    const type = String(one['type'] ?? '');
    size(textAt(one, 'label'), data);
    for (const key of ['upperLabel', 'edgeLabel']) if (one[key]) size(one[key] as Obj, data);
    if (one['leaves']) for (const leaf of asList(one['leaves'])) if (leaf['label']) size(leaf['label'] as Obj, data);
    for (const level of asList(one['levels'])) for (const key of ['label', 'upperLabel']) if (level[key]) size(level[key] as Obj, data);
    const emphasis = one['emphasis'] as Obj | undefined;
    if (emphasis?.['label']) size(emphasis['label'] as Obj, data);
    for (const key of ['markLine', 'markPoint', 'markArea']) if (one[key]) size(textAt(one[key] as Obj, 'label'), CAPTION);
    const crumb = one['breadcrumb'] as Obj | undefined;
    if (crumb) size(textAt(textAt(crumb, 'itemStyle'), 'textStyle'), CAPTION);
    if (type === 'gauge') {
      size(textAt(one, 'axisLabel'), CAPTION);
      size(textAt(one, 'title'), CAPTION);
      size(textAt(one, 'detail'), figurePx(undefined), true);
    }
  }
}

const INSIDE = new Set(['inside', 'inner', 'insideTop', 'insideBottom', 'insideLeft', 'insideRight',
  'insideTopLeft', 'insideTopRight', 'insideBottomLeft', 'insideBottomRight', 'middle', 'center']);
/** Kinds whose labels are drawn on the mark whatever the position says. */
const ON_THE_MARK = new Set(['treemap', 'sunburst', 'heatmap']);
/** Kinds ECharts colours by data item, not by series, unless told otherwise. */
const BY_ITEM = new Set(['pie', 'funnel']);

/**
 * The colour of a label, by the settings' Text choice. On a fill ("auto"): black or white,
 * whichever reads at 4.5:1 on that fill. Beside a mark: the theme's secondary text, which is
 * held to the card. "theme" puts the theme's text colours on both; a #rrggbb is used as given.
 */
export function labelInk(fill: string | null, onFill: boolean, s: ChartSettings, tokens: ChartTokenSet): string {
  const chosen = s.labels?.color;
  if (chosen && chosen.startsWith('#')) return chosen;
  if (!onFill) return tokens.textSecondary;
  return chosen === 'theme' ? tokens.text : inkOn(fill);
}

/**
 * Every label's colour, decided here from what it is drawn on. A label beside a mark is text on
 * the card: the card's secondary text colour and no halo (ECharts 6 outlines labels in a dark
 * stroke by default, which read as smudged bold type on the dark card). A label ON a mark gets
 * black or white for that mark's own fill -- per series, or per item where the items differ in
 * colour -- because ECharts' own choice keeps a halo and misses on mid-tone fills. A colour a
 * builder already set (a treemap's painted nodes, a heatmap's cells) is kept.
 */
function inkLabels(option: EOption, theme: OptionTheme, s: ChartSettings): void {
  const palette = theme.palette;
  ((option['series'] as Obj[] | undefined) ?? []).forEach((one, seriesIndex) => {
    const type = String(one['type'] ?? '');
    const label = one['label'] as Obj | undefined;
    if (label) {
      label['textBorderWidth'] = 0;
      const onFill = ON_THE_MARK.has(type) || INSIDE.has(String(label['position'] ?? ''));
      const own = (one['itemStyle'] as Obj | undefined)?.['color'];
      const seriesFill = typeof own === 'string' ? own : palette[seriesIndex % palette.length];
      const byItem = one['colorBy'] === 'data' || BY_ITEM.has(type);
      if (!onFill) {
        if (label['color'] === undefined) label['color'] = labelInk(null, false, s, theme.tokens);
      } else if (label['color'] === undefined && !byItem) {
        label['color'] = labelInk(seriesFill, true, s, theme.tokens);
      } else if (label['color'] === undefined && label['show'] !== false && Array.isArray(one['data']) && (one['data'] as unknown[]).length <= 500) {
        // Per item: the item's own colour, else the palette's in item order.
        one['data'] = (one['data'] as unknown[]).map((item, i) => {
          const object: Obj = item !== null && typeof item === 'object' && !Array.isArray(item) ? { ...(item as Obj) } : { value: item };
          const fill = ((object['itemStyle'] as Obj | undefined)?.['color'] as string | undefined) ?? palette[i % palette.length];
          const mine = object['label'] as Obj | undefined;
          if (mine?.['color'] === undefined) object['label'] = { ...(mine ?? {}), color: labelInk(fill, true, s, theme.tokens) };
          return object;
        });
      }
    }
    // A pin's figure sits on the pin, which is drawn in the series' colour.
    const pin = one['markPoint'] as Obj | undefined;
    if (pin) {
      const fill = palette[seriesIndex % palette.length];
      pin['label'] = { ...(pin['label'] as Obj ?? {}), color: labelInk(fill, true, s, theme.tokens), textBorderWidth: 0 };
    }
    const rule = one['markLine'] as Obj | undefined;
    if (rule?.['label']) (rule['label'] as Obj)['color'] ??= labelInk(null, false, s, theme.tokens);
  });
}

/**
 * The toolbox takes the top right corner. A plot area with no legend above it, or a layout series
 * placed from the top, is moved down a line so the icons do not sit on the data.
 */
function makeRoomForToolbox(option: EOption): void {
  const box = option['grid'] as Obj | undefined;
  const legendOnTop = !!option['legend'] && (option['legend'] as Obj)['top'] !== undefined;
  if (box && typeof box['top'] === 'number' && !legendOnTop) box['top'] = (box['top'] as number) + 18;
  for (const one of (option['series'] as Obj[] | undefined) ?? []) {
    if (typeof one['top'] === 'number' && !option['grid']) one['top'] = (one['top'] as number) + 22;
  }
}

/** The option straight from a view: the table it already carries, or one read from it. */
export function optionFor(view: WidgetView, kind: EChartKind, settings: ChartSettings, theme: OptionTheme,
    context: OptionContext = {}): EOption {
  const table = view.chart ?? tableOf(view, { additive: view.additive });
  return chartOption(table, kind, settings, theme, context);
}
