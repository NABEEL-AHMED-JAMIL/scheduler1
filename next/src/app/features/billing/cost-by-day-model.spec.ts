import { describe, it, expect } from 'vitest';
import type { ChartTokenSet } from '../../shared/charts/echart/echart-theme';
import {
  CostDay, SERVICES, SERVICE_SLOT, costByDayOption, cumulative, dayOfClick, dayTooltip, forecastAtMonthEnd, forecastLine, forecastPace,
  monthDays, orderServices, previousCumulative, serviceColor, serviceCssColor,
} from './cost-by-day-model';
import { dayHeading, groupByDay, zonedDay, zonedTime } from './billing-format';

const TOKENS: ChartTokenSet = {
  mode: 'light', palette: ['#2563eb', '#be1d63', '#0f766e', '#7e22ce', '#c2410c', '#0e7490', '#4d7c0f', '#4338ca'],
  text: '#111', textSecondary: '#444', muted: '#777', border: '#ddd', surface: '#fff', sunken: '#f3f3f3', heat: '#f00',
  up: '#0a0', down: '#a00', font: 'sans-serif',
};

/** Riverside's October so far, as Billing answers it: usage on the 6th, 7th and 12th (today); the days between quiet. */
const OCTOBER: CostDay[] = [
  { day: '2026-10-06', amount: 10.13, byService: { 'Model calls': 9.0, 'Analytics & tools': 1.13 },
    byMeter: { 'ai.tokens.in': { quantity: 180000, amount: 9.0 }, 'analytics.queries': { quantity: 1130, amount: 1.13 } } },
  { day: '2026-10-07', amount: 18.07, byService: { 'Model calls': 15.0, 'Analytics & tools': 3.07 } },
  { day: '2026-10-12', amount: 49.25, byService: { 'Model calls': 45.0, 'Analytics & tools': 4.25, API: 0.0001 } },
];

const input = (over: Partial<Parameters<typeof costByDayOption>[0]> = {}) => {
  const days = monthDays('2026-10-01', OCTOBER, '2026-10-12');
  return {
    view: 'daily' as const, days, services: ['Model calls', 'Analytics & tools', 'API'], pace: 4, previous: null, previousLabel: 'September 2026',
    selected: null, money: (v: number) => `$${v.toFixed(2)}`, dayHeading: (d: string) => dayHeading(d), dayShort: (d: string) => d.slice(8),
    ...over,
  };
};

describe('Cost by day: the month', () => {
  it('draws every day of the month: the metered ones, the quiet ones as zero, the days to come as still to come', () => {
    const days = monthDays('2026-10-01', OCTOBER, '2026-10-12');
    expect(days).toHaveLength(31);
    expect(days[0]).toMatchObject({ day: '2026-10-01', date: 1, amount: 0, future: false, today: false });
    expect(days[5]).toMatchObject({ day: '2026-10-06', amount: 10.13 });
    expect(days.filter(d => d.amount > 0).map(d => d.date)).toEqual([6, 7, 12]);
    expect(days[11]).toMatchObject({ day: '2026-10-12', today: true, future: false });
    expect(days.filter(d => d.future).map(d => d.date)).toEqual([13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]);
    expect(days[30].day).toBe('2026-10-31');
    // A closed month (no today) has none to come; February has 28 days, a leap year's 29.
    expect(monthDays('2026-09-01', [], null).filter(d => d.future)).toHaveLength(0);
    expect(monthDays('2026-09-01', [], null)).toHaveLength(30);
    expect(monthDays('2027-02-01', [], null)).toHaveLength(28);
    expect(monthDays('2028-02-01', [], null)).toHaveLength(29);
  });

  it('adds up a day answered once per workspace (the platform\'s every-workspace read)', () => {
    const days = monthDays('2026-10-01', [
      { day: '2026-10-06', amount: 1, byService: { Storage: 1 }, byMeter: { 'storage.gb_hours': { quantity: 10, amount: 1 } } },
      { day: '2026-10-06', amount: 2, byService: { Storage: 0.5, API: 1.5 }, byMeter: { 'storage.gb_hours': { quantity: 5, amount: 0.5 } } },
    ], null);
    expect(days[5].amount).toBe(3);
    expect(days[5].byService).toEqual({ Storage: 1.5, API: 1.5 });
    expect(days[5].byMeter!['storage.gb_hours']).toEqual({ quantity: 15, amount: 1.5 });
  });

  // H9: a billing day is the workspace's: a run at 23:30 in Chicago on 12 October is 04:30 UTC on the 13th, and it is the
  // 12th's on the chart, in the day header and in the row's time.
  it('keeps the billing zone\'s day boundaries: 23:30 in Chicago is that Chicago day', () => {
    const late = new Date('2026-10-13T04:30:00Z');
    expect(zonedDay(late, 'America/Chicago')).toBe('2026-10-12');
    expect(zonedTime(late, 'America/Chicago')).toBe('23:30');
    expect(zonedDay(late, 'UTC')).toBe('2026-10-13');
    expect(zonedDay(new Date('2026-10-12T05:00:00Z'), 'America/Chicago')).toBe('2026-10-12');   // midnight there
    expect(zonedDay(new Date('2026-10-12T04:59:59Z'), 'America/Chicago')).toBe('2026-10-11');
    // Billing rolls that event into 2026-10-12; the chart draws it under the 12th, whatever the browser's zone.
    const days = monthDays('2026-10-01', [{ day: '2026-10-12', amount: 1, byService: { 'Model calls': 1 } }], '2026-10-12');
    expect(days.find(d => d.amount > 0)!.date).toBe(12);
    expect(dayHeading('2026-10-12')).toBe('Mon 12 Oct 2026');
    // Rows newest first, cut into days -- the 23:30 run under the 12th with the 22:50 one.
    const rows = ['2026-10-13T04:30:00Z', '2026-10-13T03:50:00Z', '2026-10-12T04:00:00Z'].map(at => ({ at }));
    const groups = groupByDay(rows, r => zonedDay(new Date(r.at), 'America/Chicago'));
    expect(groups.map(g => [g.day, g.rows.length])).toEqual([['2026-10-12', 2], ['2026-10-11', 1]]);
  });
});

describe('Cost by day: the running total and its forecast', () => {
  it('paces the forecast at the last seven calendar days, quiet ones as zero, as the Month to date tile does', () => {
    // 5..11 Oct: 18.07 (7th) + 10.13 (6th) = 28.20 over seven days; today (the 12th) is under way and not in the window.
    const pace = forecastPace(OCTOBER, '2026-10-12', '2026-10-01')!;
    expect(pace).toBeCloseTo(28.2 / 7, 9);
    // The window never reaches into last month: on the 3rd it is the 1st and 2nd.
    expect(forecastPace(OCTOBER, '2026-10-03', '2026-10-01')).toBe(0);
    expect(forecastPace(OCTOBER, '2026-10-01', '2026-10-01')).toBeNull();
    // The tile: what is spent plus the pace for each of the 19 days to come.
    expect(forecastAtMonthEnd(77.45, pace, '2026-10-12', '2026-10-01')).toBeCloseTo(77.45 + pace * 19, 9);
    expect(forecastAtMonthEnd(77.45, null, '2026-10-12', '2026-10-01')).toBeNull();
  });

  it('runs the total through today, then the forecast to month end, ending where the tile says when no allowance applies', () => {
    const days = monthDays('2026-10-01', OCTOBER, '2026-10-12');
    const running = cumulative(days);
    expect(running[4]).toBe(0);
    expect(running[5]).toBeCloseTo(10.13, 9);
    expect(running[11]).toBeCloseTo(77.45, 9);
    expect(running[12]).toBeNull();
    const pace = forecastPace(OCTOBER, '2026-10-12', '2026-10-01')!;
    const line = forecastLine(days, pace);
    expect(line.slice(0, 11).every(v => v === null)).toBe(true);
    expect(line[11]).toBeCloseTo(77.45, 9);                 // it starts at today's running total
    expect(line[12]).toBeCloseTo(77.45 + pace, 9);
    // The month's bars added up are the month to date when no allowance applies: the line ends on the tile's forecast.
    expect(line[30]).toBeCloseTo(forecastAtMonthEnd(77.45, pace, '2026-10-12', '2026-10-01')!, 9);
    // A closed month has no forecast.
    expect(forecastLine(monthDays('2026-09-01', [], null), 1).every(v => v === null)).toBe(true);
  });

  it('lays last month\'s running total under this month\'s by day of the month', () => {
    const september: CostDay[] = [{ day: '2026-09-02', amount: 3, byService: {} }, { day: '2026-09-30', amount: 1, byService: {} }];
    const previous = previousCumulative(september, '2026-09-01', 31)!;
    expect(previous).toHaveLength(30);                       // September has no 31st
    expect(previous[0]).toBe(0);
    expect(previous[1]).toBe(3);
    expect(previous[29]).toBe(4);
    // October's 31 days against a 30-day month that follows it: cut at 30.
    expect(previousCumulative([{ day: '2026-10-31', amount: 2, byService: {} }], '2026-10-01', 30)).toHaveLength(30);
    expect(previousCumulative([], '2026-09-01', 31)).toBeNull();
  });

  it('draws the cumulative view as this month, its forecast and last month', () => {
    const option = costByDayOption(input({ view: 'cumulative', previous: Array.from({ length: 30 }, (_, i) => i) }), TOKENS);
    const series = option['series'] as { name: string; type: string; data: unknown[]; lineStyle?: { type?: string } }[];
    expect(series.map(s => s.name)).toEqual(['September 2026', 'This month', 'Forecast']);
    expect(series.every(s => s.type === 'line')).toBe(true);
    expect(series[2].lineStyle?.type).toBe('dashed');
    expect(series[1].data).toHaveLength(31);
  });
});

describe('Cost by day: one colour per service', () => {
  it('gives each service its own fixed colour, the By service table\'s and the chart\'s, never two teals', () => {
    const slots = Object.values(SERVICE_SLOT);
    expect(new Set(slots).size).toBe(slots.length);
    expect(slots).not.toContain(5);                          // cyan, too close to the Pipelines teal
    expect(serviceCssColor('Storage')).toBe('var(--chart-0)');
    expect(serviceCssColor('API')).toBe('var(--chart-4)');
    expect(serviceCssColor('Something new')).toBe('var(--series-muted)');
    expect(serviceColor('Model calls', TOKENS)).toBe(TOKENS.palette[1]);
    expect(serviceColor('Other', TOKENS)).toBe(TOKENS.muted);
    // The same colour whatever else the month used: by position, a month without storage shifted every colour along.
    expect(serviceCssColor('Pipelines')).toBe('var(--chart-2)');
    expect(SERVICES).toContain('API');
    expect(orderServices(['Seats', 'API', 'Zeta', 'Storage'])).toEqual(['Storage', 'API', 'Seats', 'Zeta']);
  });

  it('stacks the services in their colours on a money axis, every day of the month on the axis', () => {
    const option = costByDayOption(input(), TOKENS);
    expect((option['xAxis'] as { data: string[] }).data).toHaveLength(31);
    expect((option['yAxis'] as { type: string }).type).toBe('value');
    const series = option['series'] as { name: string; stack?: string; itemStyle?: { color?: string }; data: unknown[] }[];
    const model = series.find(s => s.name === 'Model calls')!;
    expect(model.stack).toBe('cost');
    expect(model.itemStyle?.color).toBe(TOKENS.palette[1]);
    expect(series.find(s => s.name === 'API')!.itemStyle?.color).toBe(TOKENS.palette[4]);
    // The days to come: the forecast pace as a dashed outline on each of them.
    const forecast = series.find(s => s.name === 'Forecast') as unknown as { data: number[]; itemStyle: { borderType: string } };
    expect(forecast.itemStyle.borderType).toBe('dashed');
    expect(forecast.data.filter(v => v === 4)).toHaveLength(19);
    // A total above a day only where its bar is tall enough to read one.
    const total = series.find(s => s.name === 'Total') as unknown as { label: { formatter: (p: { dataIndex: number }) => string } };
    expect(total.label.formatter({ dataIndex: 11 })).toBe('$49.25');
    expect(total.label.formatter({ dataIndex: 7 })).toBe('');                 // a quiet day
    expect(total.label.formatter({ dataIndex: 20 })).toBe('');                // a day to come
  });

  it('says a day\'s breakdown and its total on hover, the services under a cent named as such', () => {
    const days = monthDays('2026-10-01', OCTOBER, '2026-10-12');
    const html = dayTooltip(days[11], input());
    expect(html).toContain('Mon 12 Oct 2026');
    expect(html).toContain('today so far');
    expect(html.indexOf('Model calls')).toBeLessThan(html.indexOf('Analytics &amp; tools'));
    expect(html).toContain('$45.00');
    expect(html).toContain('Day total');
    expect(html).toContain('$49.25');
    expect(html).toContain('API: under a cent');
    expect(html).toContain('Before the month');
    expect(dayTooltip(days[2], input())).toContain('Nothing metered');
    expect(dayTooltip(days[20], input())).toContain('Still to come');
  });
});

describe('Cost by day: a click picks a day', () => {
  it('reads the day a click stands for, and none for a day still to come', () => {
    const days = monthDays('2026-10-01', OCTOBER, '2026-10-12');
    expect(dayOfClick({ dataIndex: 11 }, days)).toBe('2026-10-12');
    expect(dayOfClick({ dataIndex: 2 }, days)).toBe('2026-10-03');        // a quiet day has (no) lines too
    expect(dayOfClick({ dataIndex: 20 }, days)).toBeNull();
    expect(dayOfClick({}, days)).toBeNull();
    expect(dayOfClick({ dataIndex: 99 }, days)).toBeNull();
  });

  it('shades the picked day\'s column and dims the others', () => {
    const option = costByDayOption(input({ selected: '2026-10-07' }), TOKENS);
    const series = option['series'] as { name: string; data: { itemStyle: { color?: string; opacity?: number } }[] }[];
    const hit = series.find(s => s.name === 'Day')!;
    expect(hit.data[6].itemStyle.color).toBe(TOKENS.sunken);
    expect(hit.data[5].itemStyle.color).toBe('transparent');
    const model = series.find(s => s.name === 'Model calls')!;
    expect(model.data[6].itemStyle.opacity).toBe(1);
    expect(model.data[5].itemStyle.opacity).toBeLessThan(1);
  });
});
