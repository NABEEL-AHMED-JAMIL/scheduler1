import type { WidgetVisualization } from '../analytics.service';
import { kindInfo } from '../widget-kinds';

/**
 * How one chart is drawn, beyond which kind it is: the "Chart settings" panel's model.
 *
 * Stored under `chart` in the widget's widget_config JSON (dashboard.ts, WidgetConfig), which the
 * server keeps as a well-formed JSON object and never reads. EVERY field is optional and absent
 * means the default, so a widget saved before settings existed -- or by a client that never
 * heard of them -- draws exactly as it always did, and a saved document carries only what the
 * author changed (compactSettings).
 *
 * parseSettings is total: whatever a row holds, a field of the wrong type or out of range is
 * dropped rather than trusted, because a tile that throws while being drawn takes the board with
 * it.
 *
 * @author Nabeel Ahmed
 */

export type NumberStyle = 'auto' | 'compact' | 'plain' | 'fixed0' | 'fixed2' | 'percent';
export type Side = 'top' | 'bottom' | 'left' | 'right';

export interface AxisSettings {
  name?: string;
  min?: number;
  max?: number;
  log?: boolean;
  rotate?: number;
  /** 'all' labels every category; absent lets ECharts skip the ones that collide. */
  interval?: 'auto' | 'all';
  splitLines?: boolean;
  format?: NumberStyle;
  unit?: string;
}

export interface ChartSettings {
  title?: { text?: string; subtext?: string };
  legend?: { show?: boolean; position?: Side; orient?: 'horizontal' | 'vertical'; scroll?: boolean };
  tooltip?: { trigger?: 'axis' | 'item'; format?: NumberStyle };
  grid?: { padding?: 'compact' | 'normal' | 'roomy'; fitLabels?: boolean };
  xAxis?: AxisSettings;
  yAxis?: AxisSettings;
  labels?: { show?: boolean; position?: 'auto' | 'inside' | 'outside' | 'top'; format?: NumberStyle };
  line?: { smooth?: boolean; step?: boolean; width?: number; symbols?: boolean; areaOpacity?: number };
  bar?: { stack?: 'none' | 'stack' | 'percent'; width?: number; radius?: number };
  pie?: { inner?: number; outer?: number; rose?: boolean };
  /** A theme id from echart-themes.json overriding the board's, and an order of its colours. */
  colors?: { theme?: string; order?: number[] };
  sort?: 'none' | 'asc' | 'desc';
  topN?: number;
  /** With topN: add the rest into one "Other" row (only where the figures add up). */
  other?: boolean;
  refLines?: { average?: boolean; min?: boolean; max?: boolean; target?: number; label?: string };
  zoom?: boolean;
  animation?: boolean;
  renderer?: 'canvas' | 'svg';
  toolbox?: { saveImage?: boolean; dataView?: boolean };
}

/** The board's presentation settings, in the dashboard's dashboard_config JSON. */
export interface BoardSettings {
  /** The theme every tile draws in, unless a widget overrides it. Absent: the console's own. */
  theme?: string;
}

/** The panel's sections. Each kind shows only the ones that change how IT is drawn. */
export type SettingGroup =
  | 'title' | 'legend' | 'tooltip' | 'grid' | 'axes' | 'labels' | 'line' | 'bar' | 'pie'
  | 'colors' | 'sortTop' | 'refLines' | 'zoom' | 'animation' | 'renderer' | 'toolbox';

const AXIS_KINDS = new Set<string>(['barH', 'waterfall', 'pareto', 'barLine', 'pictorialBar', 'lineSmooth', 'lineStep',
  'lineMarkers', 'areaStacked', 'areaShare', 'scatterTrend', 'bubble', 'effectScatter', 'boxplot', 'density',
  'heatmap', 'candlestick']);
const LINE_KINDS = new Set<string>(['lineSmooth', 'lineStep', 'lineMarkers', 'areaStacked', 'areaShare', 'barLine', 'density']);
const BAR_KINDS = new Set<string>(['barH', 'waterfall', 'pareto', 'barLine', 'polarBar', 'pictorialBar']);
const PIE_KINDS = new Set<string>(['rose', 'halfDonut', 'nestedPie']);
const SORTABLE = new Set<string>(['barH', 'polarBar', 'pictorialBar', 'funnel', 'rose', 'halfDonut', 'treemap', 'waterfall']);
const REF_LINES = new Set<string>(['barH', 'lineSmooth', 'lineStep', 'lineMarkers', 'barLine', 'scatterTrend', 'effectScatter', 'pictorialBar']);
const ZOOMABLE = new Set<string>(['barH', 'waterfall', 'pareto', 'barLine', 'lineSmooth', 'lineStep', 'lineMarkers',
  'areaStacked', 'areaShare', 'scatterTrend', 'bubble', 'effectScatter', 'candlestick', 'heatmap']);
const LEGENDLESS = new Set<string>(['gauge', 'calendar', 'waterfall', 'tree', 'treemap', 'sunburst', 'sankey', 'polarBar', 'pictorialBar', 'heatmap']);
const LABELLED = new Set<string>([...BAR_KINDS, ...PIE_KINDS, 'lineSmooth', 'lineStep', 'lineMarkers', 'funnel', 'treemap', 'sunburst', 'heatmap']);

/** The sections that apply to a kind. A kind the console's SVG components draw takes colours only. */
export function settingGroups(kind: WidgetVisualization | string): SettingGroup[] {
  const info = kindInfo(kind);
  if (!info) return [];
  if (info.engine === 'svg') return ['colors'];
  const groups: SettingGroup[] = ['title'];
  if (!LEGENDLESS.has(kind)) groups.push('legend');
  groups.push('tooltip');
  if (AXIS_KINDS.has(kind)) groups.push('grid', 'axes');
  if (LABELLED.has(kind)) groups.push('labels');
  if (LINE_KINDS.has(kind)) groups.push('line');
  if (BAR_KINDS.has(kind)) groups.push('bar');
  if (PIE_KINDS.has(kind)) groups.push('pie');
  groups.push('colors');
  if (SORTABLE.has(kind)) groups.push('sortTop');
  if (REF_LINES.has(kind)) groups.push('refLines');
  if (ZOOMABLE.has(kind)) groups.push('zoom');
  groups.push('animation', 'renderer', 'toolbox');
  return groups;
}

// ---- reading a stored document --------------------------------------------------------------

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const str = (value: unknown, max = 200): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
const bool = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined);
const num = (value: unknown, min: number, max: number): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : undefined;
const anyNum = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
  allowed.includes(value as T) ? (value as T) : undefined;

const STYLES = ['auto', 'compact', 'plain', 'fixed0', 'fixed2', 'percent'] as const;
const SIDES = ['top', 'bottom', 'left', 'right'] as const;

function axis(value: unknown): AxisSettings | undefined {
  if (!isObject(value)) return undefined;
  return prune({
    name: str(value['name'], 60), min: anyNum(value['min']), max: anyNum(value['max']), log: bool(value['log']),
    rotate: num(value['rotate'], -90, 90), interval: oneOf(value['interval'], ['auto', 'all'] as const),
    splitLines: bool(value['splitLines']), format: oneOf(value['format'], STYLES), unit: str(value['unit'], 12),
  });
}

/** Drops undefined fields, and the object itself when nothing is left. */
function prune<T extends object>(value: T): T | undefined {
  const kept = Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
  return Object.keys(kept).length ? kept : undefined;
}

/** Settings from whatever a widget_config's `chart` holds. Never throws. */
export function parseSettings(raw: unknown): ChartSettings {
  if (!isObject(raw)) return {};
  const sub = (key: string) => (isObject(raw[key]) ? raw[key] as Record<string, unknown> : {});
  const order = Array.isArray(sub('colors')['order'])
    ? (sub('colors')['order'] as unknown[]).filter((i): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < 64)
    : undefined;
  return prune<ChartSettings>({
    title: prune({ text: str(sub('title')['text'], 120), subtext: str(sub('title')['subtext'], 200) }),
    legend: prune({
      show: bool(sub('legend')['show']), position: oneOf(sub('legend')['position'], SIDES),
      orient: oneOf(sub('legend')['orient'], ['horizontal', 'vertical'] as const), scroll: bool(sub('legend')['scroll']),
    }),
    tooltip: prune({ trigger: oneOf(sub('tooltip')['trigger'], ['axis', 'item'] as const), format: oneOf(sub('tooltip')['format'], STYLES) }),
    grid: prune({ padding: oneOf(sub('grid')['padding'], ['compact', 'normal', 'roomy'] as const), fitLabels: bool(sub('grid')['fitLabels']) }),
    xAxis: axis(raw['xAxis']),
    yAxis: axis(raw['yAxis']),
    labels: prune({
      show: bool(sub('labels')['show']), position: oneOf(sub('labels')['position'], ['auto', 'inside', 'outside', 'top'] as const),
      format: oneOf(sub('labels')['format'], STYLES),
    }),
    line: prune({
      smooth: bool(sub('line')['smooth']), step: bool(sub('line')['step']), width: num(sub('line')['width'], 0.5, 8),
      symbols: bool(sub('line')['symbols']), areaOpacity: num(sub('line')['areaOpacity'], 0, 1),
    }),
    bar: prune({
      stack: oneOf(sub('bar')['stack'], ['none', 'stack', 'percent'] as const), width: num(sub('bar')['width'], 10, 100),
      radius: num(sub('bar')['radius'], 0, 12),
    }),
    pie: prune({ inner: num(sub('pie')['inner'], 0, 90), outer: num(sub('pie')['outer'], 20, 100), rose: bool(sub('pie')['rose']) }),
    colors: prune({ theme: str(sub('colors')['theme'], 40), order: order?.length ? order : undefined }),
    sort: oneOf(raw['sort'], ['none', 'asc', 'desc'] as const),
    topN: num(raw['topN'], 1, 500),
    other: bool(raw['other']),
    refLines: prune({
      average: bool(sub('refLines')['average']), min: bool(sub('refLines')['min']), max: bool(sub('refLines')['max']),
      target: anyNum(sub('refLines')['target']), label: str(sub('refLines')['label'], 60),
    }),
    zoom: bool(raw['zoom']),
    animation: bool(raw['animation']),
    renderer: oneOf(raw['renderer'], ['canvas', 'svg'] as const),
    toolbox: prune({ saveImage: bool(sub('toolbox')['saveImage']), dataView: bool(sub('toolbox')['dataView']) }),
  }) ?? {};
}

/** Settings as they should be stored: parsed (so only valid fields), or undefined when empty. */
export function compactSettings(settings: ChartSettings): ChartSettings | undefined {
  const parsed = parseSettings(settings);
  return Object.keys(parsed).length ? parsed : undefined;
}

export function parseBoardSettings(text: string | null | undefined): BoardSettings {
  if (!text) return {};
  try {
    const raw = JSON.parse(text);
    return isObject(raw) && str(raw['theme'], 40) ? { theme: str(raw['theme'], 40) } : {};
  } catch {
    return {};
  }
}

/** A board's settings as stored, or null when there is nothing to keep -- never '{}'. */
export function boardSettingsString(settings: BoardSettings): string | null {
  return settings.theme && settings.theme !== 'console' ? JSON.stringify({ theme: settings.theme }) : null;
}
