import type { EChartKind } from '../analytics.service';
import type { WidgetView } from '../dashboard';
import { compactNumber, readableCell } from '../../../shared/charts/number-format';
import { dayLabel } from '../../../shared/ui/time-format';
import { instantOf } from '../../../core/instant';
import type { ChartTokenSet } from '../../../shared/charts/echart/echart-theme';
import {
  ChartTable, TableDim, dayKey, distinct, figures, grid, primary, quantities, rowLabel, sortAndCut, tableOf,
} from './chart-table';
import { gaugeFigures } from './chart-fit';
import { AxisSettings, ChartSettings, NumberStyle } from './chart-settings';

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
      ...(out['axisLabel'] as Obj ?? {}),
      ...(axis?.rotate !== undefined ? { rotate: axis.rotate } : {}),
      ...(axis?.interval === 'all' ? { interval: 0 } : {}),
      hideOverlap: true,
    };
  }
  if (axis?.splitLines !== undefined) out['splitLine'] = { show: axis.splitLines };
  return out;
}

function dataZoom(on: boolean, axis: 'x' | 'y', count: number): Obj[] | undefined {
  if (!on) return undefined;
  const index = axis === 'x' ? { xAxisIndex: 0 } : { yAxisIndex: 0 };
  const window = count > 0 ? Math.min(100, Math.max(5, (ZOOM_FROM.category / count) * 100)) : 100;
  return [
    { type: 'inside', ...index, filterMode: 'filter', zoomOnMouseWheel: 'shift', moveOnMouseWheel: true },
    {
      type: 'slider', ...index, height: axis === 'x' ? 18 : undefined, width: axis === 'y' ? 16 : undefined,
      ...(axis === 'y' ? { right: 4 } : { bottom: 6 }), end: axis === 'x' ? window : undefined,
      start: axis === 'y' ? 0 : undefined, showDetail: false, brushSelect: false,
    },
  ];
}

function labelOption(settings: ChartSettings, defaultShow: boolean, defaultPosition: string, unit = ''): Obj {
  const position = settings.labels?.position && settings.labels.position !== 'auto' ? settings.labels.position : defaultPosition;
  return {
    show: settings.labels?.show ?? defaultShow,
    position,
    fontSize: 11,
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
  return (table0, s) => {
    const table = table0.dims.length <= 1 ? cut(table0, s) : table0;
    const { xs, series } = seriesModel(table);
    const percent = s.bar?.stack === 'percent';
    const stack = s.bar?.stack === 'stack' || percent;
    const drawn = percent ? percentOfColumn(series) : series;
    const n = xs.length;
    const zoom = s.zoom ?? n > (kind === 'line' ? ZOOM_FROM.line : ZOOM_FROM.category);
    const lg = legend(s, drawn.length, true);
    const valueAxis = axisFrom({ type: 'value' }, horizontal ? s.xAxis : s.yAxis, true);
    if (percent) Object.assign(valueAxis, { max: 100, axisLabel: { formatter: (v: number) => `${v}%` } });
    const categoryAxis = axisFrom({ type: 'category', data: xs, boundaryGap: kind === 'bar', inverse: horizontal }, horizontal ? s.yAxis : s.xAxis, false);
    return {
      legend: lg,
      grid: gridBox(s, lg, zoom, horizontal),
      tooltip: tooltip(s, 'axis', unitOf(s)),
      xAxis: horizontal ? valueAxis : categoryAxis,
      yAxis: horizontal ? categoryAxis : valueAxis,
      dataZoom: dataZoom(zoom, horizontal ? 'y' : 'x', n),
      series: drawn.map((one, i) => ({
        type: kind, name: one.name, data: one.data,
        ...(stack ? { stack: 'total' } : {}),
        ...bigData(kind, n),
        ...(kind === 'bar' ? {
          barMaxWidth: 48,
          ...(s.bar?.width ? { barWidth: `${s.bar.width}%` } : {}),
          itemStyle: { borderRadius: s.bar?.radius ?? (stack ? 0 : 3) },
          label: labelOption(s, false, horizontal ? 'right' : 'top', unitOf(s)),
        } : {}),
        ...(i === 0 ? { markLine: markLines(s) } : {}),
      })),
    };
  };
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
    return {
      legend: lg,
      grid: gridBox(s, lg, zoom),
      tooltip: tooltip(s, 'axis', share ? '%' : unitOf(s)),
      xAxis: axisFrom({ type: 'category', data: xs, boundaryGap: false }, s.xAxis, false),
      yAxis: valueAxis,
      dataZoom: dataZoom(zoom, 'x', n),
      series: drawn.map((one, i) => ({
        type: 'line', name: one.name, data: one.data,
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
            symbolSize: 34,
            data: [{ type: 'max', name: 'Highest' }, { type: 'min', name: 'Lowest' }],
            label: { formatter: (p: { value: number }) => formatNumber(p.value, 'compact'), fontSize: 11 },
          },
          markLine: {
            silent: true, symbol: 'none', lineStyle: { type: 'dashed', width: 1 },
            label: { formatter: (p: { value: number }) => `Average ${formatNumber(p.value, 'compact')}`, position: 'insideEndTop' },
            data: [{ type: 'average', name: 'Average' }, ...((refs?.['data'] as Obj[] | undefined) ?? [])],
          },
        } : i === 0 && refs ? { markLine: refs } : {}),
      })),
    };
  };
}

const waterfall: Builder = (table, s, theme) => {
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
  return {
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
    xAxis: axisFrom({ type: 'category', data: [...xs, 'Total'] }, s.xAxis, false),
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
  };
};

const pareto: Builder = (table, s, theme) => {
  const { table: sorted } = sortAndCut(table, 'desc', s.topN ?? null, s.other ?? true);
  const xs = labels(sorted);
  const values = figures(sorted);
  const total = values.reduce((sum, v) => sum + v, 0) || 1;
  let running = 0;
  const share = values.map(v => { running += v; return (running / total) * 100; });
  const n = xs.length;
  const zoom = s.zoom ?? n > ZOOM_FROM.category;
  const lg = legend(s, 2, true);
  return {
    legend: lg,
    grid: gridBox(s, lg, zoom),
    tooltip: {
      trigger: 'axis', confine: true, axisPointer: { type: 'shadow' },
      valueFormatter: (v: number) => formatNumber(v, s.tooltip?.format, unitOf(s)),
    },
    xAxis: axisFrom({ type: 'category', data: xs }, s.xAxis, false),
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
  };
};

const barLine: Builder = (table, s) => {
  const xs = labels(table);
  const [bars, line] = table.measures;
  const n = xs.length;
  const zoom = s.zoom ?? n > ZOOM_FROM.category;
  const lg = legend(s, 2, true);
  return {
    legend: lg,
    grid: gridBox(s, lg, zoom),
    tooltip: tooltip(s, 'axis', unitOf(s)),
    xAxis: axisFrom({ type: 'category', data: xs }, s.xAxis, false),
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
  };
};

/** Sorted and cut as the settings ask, for the kinds that list categories. */
function cut(table: ChartTable, s: ChartSettings, defaultSort: 'none' | 'desc' = 'none'): ChartTable {
  return sortAndCut(table, s.sort ?? defaultSort, s.topN ?? null, s.other ?? true).table;
}

const polarBar: Builder = (table0, s) => {
  const table = cut(table0, s);
  const xs = labels(table);
  return {
    tooltip: tooltip(s, 'item', unitOf(s)),
    polar: { radius: ['12%', '78%'] },
    angleAxis: { type: 'value', startAngle: 90, splitNumber: 4, axisLabel: { formatter: axisNumber('compact') }, splitLine: { show: false } },
    radiusAxis: { type: 'category', data: xs, axisLabel: { interval: 0, fontSize: 11 }, z: 10 },
    series: [{
      type: 'bar', coordinateSystem: 'polar', name: primary(table)?.name ?? '', data: figures(table),
      colorBy: 'data', roundCap: (s.bar?.radius ?? 1) > 0, label: labelOption(s, false, 'middle'),
    }],
  };
};

const pictorialBar: Builder = (table0, s) => {
  const table = cut(table0, s);
  const xs = labels(table);
  return {
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
  };
};

function pie(variant: 'rose' | 'half'): Builder {
  return (table0, s) => {
    const table = cut(table0, s, 'desc');
    const xs = labels(table);
    const values = figures(table);
    const total = values.reduce((sum, v) => sum + v, 0) || 1;
    // Off unless asked: every slice is labelled with its name already.
    const lg = legend(s, xs.length, false);
    const inner = s.pie?.inner ?? (variant === 'half' ? 50 : 18);
    const outer = s.pie?.outer ?? (variant === 'half' ? 95 : 72);
    return {
      legend: lg,
      tooltip: {
        trigger: 'item', confine: true,
        formatter: (p: { name: string; value: number }) =>
          `${p.name}<br>${formatNumber(p.value, s.tooltip?.format, unitOf(s))} · ${formatNumber((p.value / total) * 100, 'percent')}`,
      },
      series: [{
        type: 'pie', name: primary(table)?.name ?? '',
        radius: [`${inner}%`, `${outer}%`],
        center: variant === 'half' ? ['50%', '72%'] : ['50%', '50%'],
        ...(variant === 'half' ? { startAngle: 180, endAngle: 360 } : {}),
        roseType: (s.pie?.rose ?? variant === 'rose') ? 'area' : undefined,
        itemStyle: { borderRadius: 4, borderWidth: 1 },
        avoidLabelOverlap: true,
        label: { ...labelOption(s, true, 'outside'), formatter: (p: { name: string; percent: number }) => `${p.name} ${Math.round(p.percent)}%` },
        data: xs.map((name, i) => ({ name, value: values[i] })),
      }],
    };
  };
}

const nestedPie: Builder = (table, s, theme) => {
  const shaped = grid(table);
  const totals = shaped.xs.map((_, x) => shaped.series.reduce((sum, _s, i) => sum + (shaped.cell[i][x] ?? 0), 0));
  const inner = shaped.xs.map((x, i) => ({ name: valueText(table.dims[0], x), value: totals[i], itemStyle: { color: theme.palette[i % theme.palette.length] } }));
  const outer: Obj[] = [];
  shaped.xs.forEach((x, xi) => shaped.series.forEach((name, si) => {
    const value = shaped.cell[si][xi];
    if (value) outer.push({
      name: `${valueText(table.dims[0], x)} · ${valueText(table.dims[1], name)}`, value,
      itemStyle: { color: theme.palette[xi % theme.palette.length], opacity: 0.55 + 0.45 * ((si % 3) / 2) },
    });
  }));
  const fmt = (v: number) => formatNumber(v, s.tooltip?.format, unitOf(s));
  return {
    tooltip: { trigger: 'item', confine: true, formatter: (p: { name: string; value: number; percent: number }) => `${p.name}<br>${fmt(p.value)} · ${Math.round(p.percent)}%` },
    series: [
      { type: 'pie', radius: [0, `${s.pie?.inner ?? 34}%`], data: inner,
        // Named inside the slice only where the slice is wide enough to hold the name.
        label: { position: 'inner', fontSize: 11, color: theme.tokens.surface, formatter: (p: { name: string; percent: number }) => (p.percent >= 9 ? p.name : '') }, itemStyle: { borderColor: theme.tokens.surface, borderWidth: 1 } },
      { type: 'pie', radius: [`${(s.pie?.inner ?? 34) + 8}%`, `${s.pie?.outer ?? 72}%`], label: { show: s.labels?.show ?? outer.length <= 16, fontSize: 11 }, data: outer, itemStyle: { borderColor: theme.tokens.surface, borderWidth: 1 } },
    ],
  };
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

function scatterPoints(table: ChartTable, count: number): { names: string[]; points: number[][]; axes: string[] } {
  const nums = quantities(table).slice(0, count);
  const names: string[] = [];
  const points: number[][] = [];
  for (let row = 0; row < table.length; row++) {
    const values = nums.map(q => q.values[row]);
    if (values.some(v => v === null || v === undefined)) continue;
    points.push(values as number[]);
    names.push(rowLabel(table, row));
  }
  return { names, points, axes: nums.map(q => q.name) };
}

function scatterKind(variant: 'trend' | 'bubble' | 'effect'): Builder {
  return (table, s) => {
    const { names, points, axes } = scatterPoints(table, variant === 'bubble' ? 3 : 2);
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
    if (variant === 'effect') {
      const top = points.map((p, i) => ({ p, i })).sort((a, b) => b.p[1] - a.p[1]).slice(0, 5);
      series.push({
        type: 'effectScatter', name: 'Top five', symbolSize: 12, rippleEffect: { scale: 3, brushType: 'stroke' },
        data: top.map(({ p, i }) => ({ value: p, name: names[i] })), zlevel: 1,
      });
    }
    const lg = legend(s, series.length, true);
    return {
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
    };
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

function groupsOf(table: ChartTable): { name: string; values: number[] }[] {
  const values = figures(table);
  if (table.dims.length !== 2) return [{ name: primary(table)?.name ?? 'All', values }];
  const out = new Map<string, number[]>();
  table.dims[0].values.forEach((group, row) => {
    const list = out.get(group) ?? [];
    list.push(values[row]);
    out.set(group, list);
  });
  return [...out].map(([name, list]) => ({ name: valueText(table.dims[0], name), values: list }));
}

const boxplot: Builder = (table, s) => {
  const groups = groupsOf(table).filter(group => group.values.length);
  const stats = groups.map(group => boxStats(group.values));
  const fmt = (v: number) => formatNumber(v, s.tooltip?.format, unitOf(s));
  return {
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
  };
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
  return {
    legend: lg,
    grid: gridBox(s, lg, false),
    tooltip: { trigger: 'axis', confine: true, valueFormatter: (v: number) => v.toPrecision(3) },
    xAxis: axisFrom({ type: 'value', scale: true, name: primary(table)?.name, nameLocation: 'middle', nameGap: 26 }, s.xAxis, true),
    yAxis: { type: 'value', axisLabel: { show: false }, splitLine: { show: false } },
    series: groups.map(group => ({
      type: 'line', name: group.name, data: density(group.values), smooth: 0.3, showSymbol: false,
      lineStyle: { width: s.line?.width ?? 2 }, areaStyle: { opacity: s.line?.areaOpacity ?? 0.2 },
    })),
  };
};

interface TreeNode { name: string; value?: number; children?: TreeNode[] }

/** The dimensions nested, the primary measure on the leaves and summed up the branches. */
export function treeOf(table: ChartTable): TreeNode[] {
  const roots: TreeNode[] = [];
  const values = figures(table);
  for (let row = 0; row < table.length; row++) {
    let level = roots;
    table.dims.forEach((dim, depth) => {
      const name = valueText(dim, dim.values[row]);
      let node = level.find(item => item.name === name);
      if (!node) { node = { name }; level.push(node); }
      node.value = (node.value ?? 0) + values[row];
      if (depth < table.dims.length - 1) level = node.children ??= [];
    });
  }
  return roots;
}

const treemap: Builder = (table0, s, theme) => {
  const table = table0.dims.length === 1 ? cut(table0, s, 'desc') : table0;
  const fmt = (v: number) => formatNumber(v, s.tooltip?.format, unitOf(s));
  return {
    tooltip: { trigger: 'item', confine: true, formatter: (p: { treePathInfo: { name: string }[]; value: number }) => `${p.treePathInfo.map(i => i.name).filter(Boolean).join(' › ')}<br>${fmt(p.value)}` },
    series: [{
      type: 'treemap', name: primary(table)?.name ?? '', data: treeOf(table), roam: false, nodeClick: 'zoomToNode',
      top: s.title?.text ? 40 : 4, left: 4, right: 4, bottom: table.dims.length > 1 ? 26 : 4,
      breadcrumb: { show: table.dims.length > 1, height: 18, itemStyle: { textStyle: { fontSize: 11 } } },
      label: { show: s.labels?.show ?? true, fontSize: 11, formatter: (p: { name: string; value: number }) => `${p.name}\n${formatNumber(p.value, s.labels?.format ?? 'compact')}` },
      upperLabel: { show: table.dims.length > 1, height: 18, fontSize: 11 },
      // Gaps in the card's colour: ECharts paints them white, a grid of white lines on a dark card.
      itemStyle: { borderWidth: 1, gapWidth: 1, borderColor: theme.tokens.surface },
      levels: [
        { itemStyle: { gapWidth: 2, borderColor: theme.tokens.surface }, upperLabel: { show: false } },
        { colorSaturation: [0.35, 0.6], itemStyle: { gapWidth: 1, borderColorSaturation: 0.6 } },
      ],
    }],
  };
};

const sunburst: Builder = (table, s, theme) => {
  const fmt = (v: number) => formatNumber(v, s.tooltip?.format, unitOf(s));
  return {
    tooltip: { trigger: 'item', confine: true, formatter: (p: { treePathInfo: { name: string }[]; value: number }) => `${p.treePathInfo.map(i => i.name).filter(Boolean).join(' › ')}<br>${fmt(p.value)}` },
    series: [{
      type: 'sunburst', data: treeOf(table), radius: [`${s.pie?.inner ?? 12}%`, `${s.pie?.outer ?? 92}%`], sort: undefined,
      itemStyle: { borderColor: theme.tokens.surface, borderWidth: 1 },
      label: { show: s.labels?.show ?? true, fontSize: 11, minAngle: 8, rotate: 'radial' },
      emphasis: { focus: 'ancestor' },
    }],
  };
};

const tree: Builder = (table, s) => {
  // Opened one level down when there are more leaves than lines to give them; a click opens a branch.
  const leaves = table.length;
  return {
  tooltip: { trigger: 'item', confine: true, formatter: (p: { name: string; value: number }) => `${p.name}<br>${formatNumber(p.value, s.tooltip?.format, unitOf(s))}` },
  series: [{
    type: 'tree', data: [{ name: primary(table)?.name ?? 'All', children: treeOf(table) }],
    top: 8, bottom: 8, left: 80, right: 140, symbolSize: 7, initialTreeDepth: leaves > 24 ? 1 : -1,
    label: { position: 'left', verticalAlign: 'middle', align: 'right', fontSize: 11 },
    leaves: { label: { position: 'right', align: 'left', formatter: (p: { name: string; value: number }) => `${p.name}  ${formatNumber(p.value, 'compact')}` } },
    expandAndCollapse: true, animationDuration: 280,
  }],
  };
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
  return {
    tooltip: { trigger: 'item', confine: true, valueFormatter: (v: number) => formatNumber(v, s.tooltip?.format, unitOf(s)) },
    series: [{
      type: 'sankey', data: flow.nodes, links: flow.links, nodeAlign: 'justify', nodeGap: 8, nodeWidth: 12,
      top: s.title?.text ? 44 : 8, bottom: 8, left: 8, right: 90,
      emphasis: { focus: 'adjacency' }, lineStyle: { color: 'gradient', opacity: 0.35, curveness: 0.5 },
      label: { fontSize: 11 },
    }],
  };
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
  return {
    tooltip: { trigger: 'item', confine: true, valueFormatter: (v: number) => formatNumber(v, s.tooltip?.format, unitOf(s)) },
    series: [{
      type: 'chord', data: names.map(name => ({ name })), links: [...links.values()], radius: ['70%', '78%'],
      padAngle: 2, minAngle: 2, label: { show: s.labels?.show ?? names.length <= 24, fontSize: 11 },
      lineStyle: { color: 'source', opacity: 0.4 }, emphasis: { focus: 'adjacency' },
    }],
  };
};

const heatmap: Builder = (table, s) => {
  const shaped = grid(table);
  const data: [number, number, number][] = [];
  shaped.cell.forEach((row, y) => row.forEach((value, x) => { if (value !== null) data.push([x, y, value]); }));
  const values = data.map(d => d[2]);
  return {
    grid: { ...gridBox(s, undefined, false), bottom: 44 },
    tooltip: {
      trigger: 'item', confine: true,
      formatter: (p: { value: [number, number, number] }) =>
        `${valueText(table.dims[0], shaped.xs[p.value[0]])} · ${valueText(table.dims[1], shaped.series[p.value[1]])}<br>${formatNumber(p.value[2], s.tooltip?.format, unitOf(s))}`,
    },
    xAxis: axisFrom({ type: 'category', data: shaped.xs.map(x => valueText(table.dims[0], x)), splitArea: { show: false } }, s.xAxis, false),
    yAxis: axisFrom({ type: 'category', data: shaped.series.map(y => valueText(table.dims[1], y)) }, s.yAxis, false),
    visualMap: {
      min: Math.min(...values), max: Math.max(...values), calculable: false, orient: 'horizontal', left: 'center', bottom: 0,
      itemHeight: 120, itemWidth: 10, text: [formatNumber(Math.max(...values), 'compact'), formatNumber(Math.min(...values), 'compact')],
    },
    series: [{ type: 'heatmap', name: primary(table)?.name ?? '', data, label: labelOption(s, data.length <= 60, 'inside'), progressive: 2000, emphasis: { itemStyle: { borderWidth: 1 } } }],
  };
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
  const band = Math.max(60, ((context.height ?? 220) - 54) / Math.max(1, years.length));
  const cell = Math.max(6, Math.floor((band - 20) / 7));
  return {
    tooltip: {
      trigger: 'item', confine: true,
      formatter: (p: { value: [string, number] }) => `${dayLabel(p.value[0])}<br>${formatNumber(p.value[1], s.tooltip?.format, unitOf(s))}`,
    },
    visualMap: {
      min: Math.min(...all), max: Math.max(...all), calculable: false, orient: 'horizontal', left: 'center', bottom: 0,
      itemHeight: 120, itemWidth: 10,
    },
    calendar: years.map((year, i) => ({
      range: year, top: 20 + i * band, left: 36, right: 12, cellSize: ['auto', cell], orient: 'horizontal',
      yearLabel: { show: years.length > 1, position: 'left' },
    })),
    series: years.map((year, i) => ({
      type: 'heatmap', coordinateSystem: 'calendar', calendarIndex: i,
      data: [...byDay].filter(([day]) => day.split('-')[0] === year),
    })),
  };
};

const funnel: Builder = (table0, s) => {
  const table = cut(table0, s);
  const xs = labels(table);
  const values = figures(table);
  const lg = legend(s, xs.length, false);
  return {
    legend: lg,
    tooltip: { trigger: 'item', confine: true, valueFormatter: (v: number) => formatNumber(v, s.tooltip?.format, unitOf(s)) },
    series: [{
      type: 'funnel', name: primary(table)?.name ?? '', sort: s.sort === 'asc' ? 'ascending' : s.sort === 'none' ? 'none' : 'descending',
      left: '10%', right: '10%', top: s.title?.text ? 44 : 8, bottom: 8, gap: 2, minSize: '8%',
      label: { ...labelOption(s, true, 'inside'), formatter: (p: { name: string; value: number }) => `${p.name}  ${formatNumber(p.value, s.labels?.format ?? 'compact')}` },
      itemStyle: { borderWidth: 0 },
      data: xs.map((name, i) => ({ name, value: values[i] })),
    }],
  };
};

/** A round number at or above a figure, for a gauge's end: 873 -> 1000, 0.42 -> 0.5. */
export function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (step * magnitude >= value) return step * magnitude;
  return 10 * magnitude;
}

const gauge: Builder = (table, s, theme) => {
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
    axisLabel: { distance: 18, fontSize: 11, color: theme.tokens.muted, formatter: axisNumber('compact', unit) },
    anchor: { show: false }, title: { show: true, offsetCenter: [0, '26%'], fontSize: 11, color: theme.tokens.muted },
    detail: {
      valueAnimation: true, offsetCenter: [0, '-4%'], fontSize: 18, fontWeight: 600, color: theme.tokens.text,
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
  return { tooltip: { trigger: 'item', confine: true, valueFormatter: (v: number) => formatNumber(v, s.tooltip?.format, unit) }, series };
};

const radar: Builder = (table, s) => {
  let indicators: { name: string; max: number }[];
  let series: { name: string; value: number[] }[];
  if (table.measures.length >= 3) {
    indicators = table.measures.map(measure => ({ name: measure.name, max: niceCeiling(Math.max(0, ...measure.values.map(v => v ?? 0))) }));
    series = Array.from({ length: table.length }, (_, row) => ({ name: rowLabel(table, row), value: table.measures.map(m => m.values[row] ?? 0) }));
  } else {
    const shaped = grid(table);
    const spokes = shaped.series;
    const max = niceCeiling(Math.max(0, ...figures(table)));
    indicators = spokes.map(name => ({ name: valueText(table.dims[1], name), max }));
    series = shaped.xs.map((x, xi) => ({ name: valueText(table.dims[0], x), value: spokes.map((_, si) => shaped.cell[si][xi] ?? 0) }));
  }
  const lg = legend(s, series.length, true);
  return {
    legend: lg,
    tooltip: { trigger: 'item', confine: true, valueFormatter: (v: number) => formatNumber(v, s.tooltip?.format, unitOf(s)) },
    radar: { indicator: indicators, radius: '66%', center: ['50%', lg && (s.legend?.position ?? 'top') === 'top' ? '56%' : '50%'], splitNumber: 4, axisName: { fontSize: 11 } },
    series: [{
      type: 'radar', symbolSize: 4, lineStyle: { width: s.line?.width ?? 2 }, areaStyle: { opacity: s.line?.areaOpacity ?? 0.12 },
      data: series,
    }],
  };
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
  return {
    tooltip: { trigger: 'item', confine: true },
    parallel: { left: 40, right: 60, top: s.title?.text ? 56 : 36, bottom: 24, parallelAxisDefault: { nameTextStyle: { fontSize: 11 }, axisLabel: { fontSize: 11 } } },
    parallelAxis: axes,
    series: [{
      type: 'parallel', lineStyle: { width: 1, opacity: table.length > 500 ? 0.15 : 0.45 }, data,
      progressive: 1000, progressiveThreshold: 3000, smooth: false,
      emphasis: { lineStyle: { width: 2, opacity: 1 } },
    }],
  };
};

const themeRiver: Builder = (table, s) => {
  const values = figures(table);
  const data: [number, number, string][] = [];
  for (let row = 0; row < table.length; row++) {
    const moment = instantOf(table.dims[0].values[row]);
    if (moment) data.push([moment.getTime(), values[row], valueText(table.dims[1], table.dims[1].values[row])]);
  }
  const lg = legend(s, distinct(data.map(d => d[2])).length, true);
  return {
    legend: lg,
    tooltip: { trigger: 'axis', confine: true, axisPointer: { type: 'line' } },
    singleAxis: { type: 'time', top: lg ? 44 : 16, bottom: 30, left: 24, right: 24, axisLabel: { fontSize: 11 }, splitLine: { show: true, lineStyle: { type: 'dashed' } } },
    series: [{ type: 'themeRiver', data, label: { show: false }, emphasis: { focus: 'series' } }],
  };
};

const candlestick: Builder = (table, s, theme) => {
  const find = (name: string) => table.measures.find(m => m.name.toLowerCase().includes(name))!;
  const [open, high, low, close] = ['open', 'high', 'low', 'close'].map(find);
  const xs = labels(table);
  const n = xs.length;
  const zoom = s.zoom ?? n > ZOOM_FROM.category;
  return {
    grid: gridBox(s, undefined, zoom),
    tooltip: { trigger: 'axis', confine: true, axisPointer: { type: 'cross' } },
    xAxis: axisFrom({ type: 'category', data: xs, boundaryGap: true }, s.xAxis, false),
    yAxis: axisFrom({ type: 'value', scale: true }, s.yAxis, true),
    dataZoom: dataZoom(zoom, 'x', n),
    series: [{
      type: 'candlestick', name: primary(table)?.name ?? '',
      data: xs.map((_, i) => [open.values[i], close.values[i], low.values[i], high.values[i]]),
      itemStyle: { color: theme.tokens.up, color0: theme.tokens.down, borderColor: theme.tokens.up, borderColor0: theme.tokens.down },
      ...bigData('bar', n), markLine: markLines(s),
    }],
  };
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
  quietLabels(out, theme.tokens);
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
  return out;
}

/**
 * A label written beside a mark rather than on it is text on the card: the card's secondary text
 * colour and no halo. ECharts 6 outlines such labels in a dark stroke by default, which read as
 * smudged bold type on the dark card. Labels inside a mark keep ECharts' own contrast choice.
 */
function quietLabels(option: EOption, tokens: ChartTokenSet): void {
  const inside = new Set(['inside', 'inner', 'insideTop', 'insideBottom', 'insideLeft', 'insideRight', 'middle', 'center']);
  for (const one of (option['series'] as Obj[] | undefined) ?? []) {
    const label = one['label'] as Obj | undefined;
    if (!label || one['type'] === 'treemap' || one['type'] === 'sunburst' || one['type'] === 'heatmap' || one['type'] === 'funnel') continue;
    if (inside.has(String(label['position'] ?? ''))) continue;
    if (label['color'] === undefined) label['color'] = tokens.textSecondary;
    label['textBorderWidth'] = 0;
  }
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
