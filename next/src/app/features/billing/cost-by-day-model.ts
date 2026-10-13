/**
 * Cost by day, as data: the month's days (every one of them), the running total and its forecast, the colour each service is
 * drawn in, and the ECharts option the chart is handed. Pure, so the chart is tested as data -- which days, which series,
 * what the tooltip says -- without a canvas, and the KPI tile and the chart share one forecast.
 *
 * Every day here is a BILLING day: the yyyy-MM-dd the meter rolled the usage into, in the workspace's billing time zone (H9).
 * Days are compared and stepped as text and in UTC arithmetic, never through the browser's zone, so a Chicago evening is that
 * Chicago day on every screen, wherever the reader is.
 *
 * @author Nabeel Ahmed
 */
import type { ChartTokenSet } from '../../shared/charts/echart/echart-theme';
import { CHART_TYPE } from '../../shared/charts/chart-type';
import { shiftDay } from './billing-format';

/** A metered day: its flat amount (before the month's allowances and tiers), by service and by meter. */
export interface CostDay {
  day: string;
  amount: number;
  byService: Record<string, number>;
  byMeter?: Record<string, { quantity: number; amount: number }>;
}

/** A day of the month on the chart: metered, quiet (zero) or still to come. */
export interface MonthDay extends CostDay {
  /** 1-based day of the month. */
  date: number;
  future: boolean;
  today: boolean;
}

export type CostView = 'daily' | 'cumulative';

/** The forecast paces the rest of the month at the last week's daily average (calendar days, quiet ones included). */
export const FORECAST_WINDOW_DAYS = 7;

/**
 * The services a meter rolls up under (billing-service Rates.serviceOf), in the order the screens list them. API was missing
 * here, so API calls and webhook deliveries were drawn in the chart's legend but left out of the By service table.
 */
export const SERVICES = ['Storage', 'Model calls', 'Pipelines', 'Analytics & tools', 'API', 'Seats', 'Other'];

/**
 * One colour per service, fixed -- the --chart-N slot it is drawn in on the chart and beside it in the By service table, in
 * both themes. Fixed rather than by position: by position, a month without storage shifted every colour along, and the
 * chart's legend and the table disagreed. Chosen far apart: blue, rose, teal, violet, orange, lime; never teal beside cyan.
 * "Other" is the muted series colour.
 */
export const SERVICE_SLOT: Record<string, number> = {
  'Storage': 0, 'Model calls': 1, 'Pipelines': 2, 'Analytics & tools': 3, 'API': 4, 'Seats': 6,
};

/** A service's colour as a CSS value, for the console's own markup (the By service table, the legend). */
export function serviceCssColor(service: string): string {
  const slot = SERVICE_SLOT[service];
  return slot === undefined ? 'var(--series-muted)' : `var(--chart-${slot})`;
}

/** A service's colour resolved, for the canvas (which cannot read a CSS variable). */
export function serviceColor(service: string, tokens: Pick<ChartTokenSet, 'palette' | 'muted'>): string {
  const slot = SERVICE_SLOT[service];
  return slot === undefined ? tokens.muted : tokens.palette[slot] ?? tokens.muted;
}

/** Services in the screens' order, any the list does not know last (alphabetically). */
export function orderServices(services: Iterable<string>): string[] {
  const known = new Set(SERVICES);
  const all = [...new Set(services)];
  return [...SERVICES.filter(s => all.includes(s)), ...all.filter(s => !known.has(s)).sort()];
}

/** Under half a cent: what reads $0.00. */
export function roundsToZero(amount: number): boolean {
  return Math.abs(Number(amount) || 0) < 0.005;
}

/** How many days a month has, from its first day ("2026-10-01"), in UTC arithmetic. */
export function monthLength(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Every day of the month, in order: the metered ones with their amounts, the quiet ones as zero, and -- in the month under
 * way -- the days after `today` (the workspace's today, from Billing) marked as still to come. A day the meter answered twice
 * (every workspace's rows, one per workspace) is added up.
 */
export function monthDays(month: string, days: CostDay[], today: string | null): MonthDay[] {
  const first = month.slice(0, 7) + '-01';
  const length = monthLength(first);
  const byDay = new Map<string, CostDay>();
  for (const d of days) {
    const seen = byDay.get(d.day);
    byDay.set(d.day, seen ? merge(seen, d) : d);
  }
  const out: MonthDay[] = [];
  for (let i = 0; i < length; i++) {
    const day = shiftDay(first, i);
    const metered = byDay.get(day);
    out.push({
      day, date: i + 1,
      amount: metered?.amount ?? 0,
      byService: metered?.byService ?? {},
      byMeter: metered?.byMeter ?? {},
      future: !!today && day > today,
      today: day === today,
    });
  }
  return out;
}

function merge(a: CostDay, b: CostDay): CostDay {
  const byService = { ...a.byService };
  for (const [s, v] of Object.entries(b.byService)) byService[s] = (byService[s] ?? 0) + v;
  const byMeter = { ...(a.byMeter ?? {}) };
  for (const [m, v] of Object.entries(b.byMeter ?? {})) {
    const seen = byMeter[m];
    byMeter[m] = seen ? { quantity: seen.quantity + v.quantity, amount: seen.amount + v.amount } : v;
  }
  return { day: a.day, amount: a.amount + b.amount, byService, byMeter };
}

/**
 * The daily pace the forecast runs at: the last FORECAST_WINDOW_DAYS calendar days before today, quiet ones counted as zero
 * (one $5 burst in a quiet week is a $5/7 pace, not $5 a day), never reaching into last month. Null on the month's first day.
 */
export function forecastPace(days: CostDay[], today: string, month: string, window = FORECAST_WINDOW_DAYS): number | null {
  const first = month.slice(0, 7) + '-01';
  const amounts = new Map<string, number>();
  for (const d of days) amounts.set(d.day, (amounts.get(d.day) ?? 0) + d.amount);
  let spent = 0, counted = 0;
  for (let back = 1; back <= window; back++) {
    const day = shiftDay(today, -back);
    if (day < first) break;
    spent += amounts.get(day) ?? 0;
    counted++;
  }
  return counted ? spent / counted : null;
}

/**
 * The month's forecast at month end, as the Month to date tile says it: what is spent so far, and the pace for each day still
 * to come (today counts as under way, so as spent). `spent` is the figure the forecast continues -- the tile's after the
 * allowances, the chart's running total before them.
 */
export function forecastAtMonthEnd(spent: number, pace: number | null, today: string, month: string): number | null {
  if (pace === null) return null;
  const remaining = Math.max(0, monthLength(month.slice(0, 7) + '-01') - Number(today.slice(8, 10)));
  return spent + pace * remaining;
}

/** The running total by day; null for the days still to come. */
export function cumulative(days: MonthDay[]): (number | null)[] {
  let sum = 0;
  return days.map(d => d.future ? null : (sum += d.amount));
}

/**
 * The forecast line: from today's running total, the pace added for each day to come; null before today. Empty (all null)
 * in a closed month or without a pace.
 */
export function forecastLine(days: MonthDay[], pace: number | null): (number | null)[] {
  const running = cumulative(days);
  const at = days.findIndex(d => d.today);
  if (pace === null || at < 0 || !days.some(d => d.future)) return days.map(() => null);
  const start = running[at] ?? 0;
  return days.map((_, i) => i < at ? null : start + pace * (i - at));
}

/** Last month's running total by day of the month, cut to this month's length (a 31st has no counterpart in a 30-day month). */
export function previousCumulative(previous: CostDay[], previousMonth: string, length: number): number[] | null {
  if (!previous.length) return null;
  return cumulative(monthDays(previousMonth, previous, null)).slice(0, length).map(v => v ?? 0);
}

/** The day a click on the chart stands for: the category (day) index ECharts reported. */
export function dayOfClick(click: { dataIndex?: number | null } | null | undefined, days: MonthDay[]): string | null {
  const index = click?.dataIndex;
  if (index === undefined || index === null || index < 0 || index >= days.length) return null;
  const day = days[index];
  return day.future ? null : day.day;
}

// ---- the option ---------------------------------------------------------------------------------------------------

export interface CostByDayInput {
  view: CostView;
  days: MonthDay[];
  /** The services drawn, in order (those with usage this month). */
  services: string[];
  /** The forecast's daily pace (null: none, as on a closed month). */
  pace: number | null;
  /** Last month's running total by day, when there was usage. */
  previous: number[] | null;
  previousLabel: string;
  selected: string | null;
  money: (v: number) => string;
  /** "Mon 12 Oct 2026" for a day. */
  dayHeading: (day: string) => string;
  /** "12 Oct" for a day. */
  dayShort: (day: string) => string;
}

/** Bars this thin or thinner get no total above them: a label over every bar of a 31-day month only overlaps. */
const LABEL_SHARE = 0.06;

/** Text written into the tooltip's HTML. */
function esc(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/**
 * The tooltip is HTML ECharts writes into the chart's own box, styled by classes (cost-by-day.ts: .cbd-tip-*), never inline:
 * a series' swatch is the marker ECharts itself makes for it (`markers`, by series name), so its colour is the series'.
 */
export type Markers = Record<string, string>;

function row(label: string, value: string, marker = '', strong = false): string {
  return `<div class="cbd-tip-row${strong ? ' is-strong' : ''}"><span>${marker}${esc(label)}</span><span class="cbd-tip-num">${esc(value)}</span></div>`;
}

function head(text: string): string {
  return `<div class="cbd-tip-head">${esc(text)}</div>`;
}

/** The breakdown a day's tooltip shows: each service that day, the dearest first, and the day's total. */
export function dayTooltip(d: MonthDay, input: Pick<CostByDayInput, 'money' | 'dayHeading' | 'pace'>, markers: Markers = {}): string {
  const title = head(input.dayHeading(d.day) + (d.today ? ' · today so far' : ''));
  if (d.future) {
    return title + `<div class="cbd-tip-muted">Still to come${input.pace !== null ? ` · forecast pace ${esc(input.money(input.pace))} a day` : ''}</div>`;
  }
  const lines = Object.entries(d.byService).filter(([, v]) => !roundsToZero(v)).sort((a, b) => b[1] - a[1])
    .map(([s, v]) => row(s, input.money(v), markers[s] ?? ''));
  const tiny = Object.entries(d.byService).filter(([, v]) => v !== 0 && roundsToZero(v)).map(([s]) => s);
  const body = lines.length ? lines.join('') : `<div class="cbd-tip-muted">${d.amount ? 'Under a cent' : 'Nothing metered'}</div>`;
  const under = tiny.length && lines.length ? `<div class="cbd-tip-muted">${esc(tiny.join(', '))}: under a cent</div>` : '';
  const total = `<div class="cbd-tip-total">${row('Day total', input.money(d.amount), '', true)}</div>`;
  const hint = `<div class="cbd-tip-note">Before the month's allowances and tiers · click for this day's lines</div>`;
  return title + body + under + total + hint;
}

/** The cumulative view's tooltip: the month so far by this day, last month by the same day, the forecast after today. */
export function cumulativeTooltip(i: number, input: CostByDayInput, running: (number | null)[], forecast: (number | null)[],
    markers: Markers = {}): string {
  const d = input.days[i];
  const parts = [head(input.dayHeading(d.day) + (d.today ? ' · today so far' : ''))];
  if (running[i] !== null) parts.push(row('Month so far', input.money(running[i]!), markers['This month'] ?? ''));
  if (!d.future && running[i] !== null) parts.push(row('That day', input.money(d.amount)));
  if (d.future && forecast[i] !== null) parts.push(row('Forecast', input.money(forecast[i]!), markers['Forecast'] ?? ''));
  if (input.previous && input.previous[i] !== undefined) {
    parts.push(row(`${input.previousLabel} by day ${d.date}`, input.money(input.previous[i]), markers[input.previousLabel] ?? ''));
  }
  parts.push(`<div class="cbd-tip-note">Before the month's allowances and tiers</div>`);
  return parts.join('');
}

/** ECharts' own swatch for each series under the pointer, by series name. */
function markersOf(params: { seriesName?: string; marker?: unknown }[]): Markers {
  const out: Markers = {};
  for (const p of params ?? []) if (p.seriesName && typeof p.marker === 'string') out[p.seriesName] = p.marker;
  return out;
}

/** A money axis: "$0", "$20", "$1.5k" -- short, as an axis needs. */
export function axisMoney(value: number, money: (v: number) => string): string {
  if (value === 0) return money(0).replace(/[.,]00$/, '');
  if (Math.abs(value) >= 1000) return money(value / 1000).replace(/[.,]00$/, '') + 'k';
  const text = money(value);
  return Number.isInteger(value) ? text.replace(/[.,]00$/, '') : text;
}

/** The ECharts option for the day chart, in either view. */
export function costByDayOption(input: CostByDayInput, tokens: ChartTokenSet): Record<string, unknown> {
  const { days } = input;
  const categories = days.map(d => d.day);
  const base = {
    animationDuration: 240,
    grid: { left: 8, right: input.view === 'cumulative' ? 96 : 16, top: 24, bottom: 4, containLabel: true },
    xAxis: {
      type: 'category', data: categories,
      axisTick: { show: false },
      axisLabel: {
        // The 1st, then every few days by width (ECharts drops what would overlap); the day of the month and its month.
        hideOverlap: true, interval: 'auto',
        formatter: (day: string) => input.dayShort(day),
      },
    },
    yAxis: {
      type: 'value', min: 0,
      axisLabel: { formatter: (v: number) => axisMoney(v, input.money) },
      splitNumber: 4,
    },
  };
  if (input.view === 'cumulative') return cumulativeOption(input, tokens, base);

  const max = Math.max(0, ...days.map(d => d.amount));
  const dim = (d: MonthDay) => input.selected && input.selected !== d.day ? 0.3 : 1;
  const series: Record<string, unknown>[] = [{
    // The whole column of a day is its click target, not only its bar: a $0.88 day is a hairline beside a $49 one. Drawn
    // behind the stack (barGap -100%), transparent, as tall as the tallest day so it never moves the axis.
    name: 'Day', type: 'bar', barGap: '-100%', barMaxWidth: 36, z: 0, cursor: 'pointer',
    itemStyle: { color: 'transparent' }, emphasis: { disabled: true }, tooltip: { show: false },
    // The picked day's column is shaded, so the chart says which day the lines below are.
    data: days.map(d => ({ value: d.future ? 0 : Math.max(max, input.pace ?? 0),
      itemStyle: { color: d.day === input.selected ? tokens.sunken : 'transparent' } })),
  }];
  series.push(...input.services.map(service => ({
    name: service, type: 'bar', stack: 'cost', barMaxWidth: 36, barCategoryGap: '28%',
    itemStyle: { color: serviceColor(service, tokens) },
    emphasis: { focus: 'none' },
    data: days.map(d => ({ value: d.future ? 0 : d.byService[service] ?? 0, itemStyle: { opacity: dim(d) } })),
  })));
  // Days still to come: the forecast pace as a dashed outline, faint, so the month reads as a month and not as a week.
  if (input.pace !== null && days.some(d => d.future)) {
    series.push({
      name: 'Forecast', type: 'bar', stack: 'cost', barMaxWidth: 36, silent: false,
      itemStyle: { color: 'transparent', borderColor: tokens.muted, borderType: 'dashed', borderWidth: 1, opacity: 0.8 },
      data: days.map(d => d.future ? input.pace : 0),
    });
  }
  // The day's total above its stack, where the bar is tall enough to read it; ECharts hides what would overlap.
  series.push({
    name: 'Total', type: 'bar', stack: 'cost', silent: true, barMaxWidth: 36,
    itemStyle: { color: 'transparent' },
    label: {
      show: true, position: 'top', color: tokens.textSecondary, fontSize: CHART_TYPE.caption,
      formatter: (p: { dataIndex: number }) => {
        const d = days[p.dataIndex];
        return !d || d.future || max <= 0 || d.amount < max * LABEL_SHARE ? '' : input.money(d.amount);
      },
    },
    labelLayout: { hideOverlap: true },
    data: days.map(() => 0),
  });
  return {
    ...base,
    tooltip: {
      trigger: 'axis', confine: true, axisPointer: { type: 'shadow', z: 1 }, className: 'cbd-tip',
      formatter: (params: { dataIndex: number; seriesName?: string; marker?: unknown }[]) => {
        const d = days[params?.[0]?.dataIndex ?? -1];
        return d ? dayTooltip(d, input, markersOf(params)) : '';
      },
    },
    series,
  };
}

function cumulativeOption(input: CostByDayInput, tokens: ChartTokenSet, base: Record<string, unknown>): Record<string, unknown> {
  const running = cumulative(input.days);
  const forecast = forecastLine(input.days, input.pace);
  const selectedAt = input.selected ? input.days.findIndex(d => d.day === input.selected) : -1;
  const series: Record<string, unknown>[] = [];
  if (input.previous) {
    series.push({
      name: input.previousLabel, type: 'line', data: input.previous, symbol: 'none', smooth: false, z: 1,
      lineStyle: { width: 1.5, color: tokens.muted, opacity: 0.7 }, itemStyle: { color: tokens.muted },
      endLabel: { show: true, color: tokens.muted, fontSize: CHART_TYPE.caption, formatter: () => input.previousLabel.split(' ')[0] },
    });
  }
  series.push({
    name: 'This month', type: 'line', data: running, symbol: 'circle', symbolSize: 5, showSymbol: false, z: 3,
    lineStyle: { width: 2.5, color: tokens.text }, itemStyle: { color: tokens.text },
    areaStyle: { color: tokens.text, opacity: 0.06 },
    endLabel: { show: !forecast.some(v => v !== null), color: tokens.text, fontSize: CHART_TYPE.caption, fontWeight: 600,
      formatter: (p: { value: number }) => input.money(Number(p.value)) },
    markPoint: selectedAt >= 0 && running[selectedAt] !== null ? {
      symbol: 'circle', symbolSize: 9, itemStyle: { color: tokens.text, borderColor: tokens.surface, borderWidth: 2 }, label: { show: false },
      data: [{ coord: [selectedAt, running[selectedAt]] }],
    } : undefined,
  });
  if (forecast.some(v => v !== null)) {
    series.push({
      name: 'Forecast', type: 'line', data: forecast, symbol: 'none', z: 2,
      lineStyle: { width: 2, type: 'dashed', color: tokens.text, opacity: 0.7 }, itemStyle: { color: tokens.text },
      endLabel: { show: true, color: tokens.text, fontSize: CHART_TYPE.caption, fontWeight: 600,
        formatter: (p: { value: number }) => `${input.money(Number(p.value))} forecast` },
    });
  }
  return {
    ...base,
    xAxis: { ...(base['xAxis'] as object), boundaryGap: false },
    tooltip: {
      trigger: 'axis', confine: true, axisPointer: { type: 'line' }, className: 'cbd-tip',
      formatter: (params: { dataIndex: number; seriesName?: string; marker?: unknown }[]) => {
        const i = params?.[0]?.dataIndex ?? -1;
        return i >= 0 && i < input.days.length ? cumulativeTooltip(i, input, running, forecast, markersOf(params)) : '';
      },
    },
    series,
  };
}
