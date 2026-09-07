import { EChartOption } from 'echarts';

export interface ColumnBarSegment {
  label: string;
  count: number;
  pct: number;
  color: string;
}

/**
 * Matches the run-status colours in app.less (.status-* and .pill-solid-*) and the next app's
 * status-color.ts, so a job's stage is the same colour in a chart as it is in its own pill.
 * Running and Failed use the brighter "solid" shade -- brand-500 and crit-500 -- to keep the
 * same weight distinction the pills give them over Start and Interrupt, which share their tone.
 */
export const JOB_STATUS_COLOR: { [key: string]: string } = {
  'queue': '#475569',
  'start': '#1e40af',
  'running': '#2563eb',
  'failed': '#bb2d48',
  'completed': '#1d7a44',
  'skip': '#b45309',
  'interrupt': '#f2748c',
  'missed': '#8a3d07',
  'inflight': '#1e40af'
};
export const JOB_STATUS_ORDER = ['Queue', 'Start', 'Running', 'Failed', 'Completed', 'Skip', 'Interrupt', 'Missed'];
export const PILL_SUCCESS_COLOR = '#1d7a44';
export const PILL_DANGER_COLOR = '#bb2d48';
export const FILL_COLOR = '#2563eb';
export const EMPTY_COLOR = '#d7dce1';

export const CATEGORY_PALETTE = ['#2563eb', '#0369a1', '#1d7a44', '#b45309', '#bb2d48', '#a21caf', '#475569', '#1d4ed8'];
export const JOB_ID_PIE_TOP_N = 8;

export function compactAxisNumber(value: number): string {
  if (Math.abs(value) >= 1000) {
    const thousands = value / 1000;
    return (Number.isInteger(thousands) ? thousands : Math.round(thousands * 10) / 10) + 'k';
  }
  return String(value);
}

export function formatDurationSeconds(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function rowDuration(row: any): string {
  if (!row || !row.startTime || !row.endTime) {
    return '-';
  }
  const start = new Date(row.startTime).getTime();
  const end = new Date(row.endTime).getTime();
  if (isNaN(start) || isNaN(end) || end < start) {
    return '-';
  }
  return formatDurationSeconds(Math.round((end - start) / 1000));
}

export function categoricalColumnStats(
  rows: any[], valueOf: (row: any) => any, categoryOrder: string[], colorOf: (label: string) => string
): ColumnBarSegment[] {
  const counts = new Map<string, number>();
  let total = 0;
  (rows || []).forEach((row: any) => {
    const raw = valueOf(row);
    if (raw === null || raw === undefined || raw === '') {
      return;
    }
    const label = String(raw);
    counts.set(label, (counts.get(label) || 0) + 1);
    total++;
  });
  if (!total) {
    return [];
  }
  return categoryOrder.map((label) => {
    const count = counts.get(label) || 0;
    return { label, count, pct: (count / total) * 100, color: colorOf(label) };
  });
}

export function toPieOptions(title: string, segments: ColumnBarSegment[]): EChartOption | null {
  const data = segments.filter((s) => s.count > 0);
  if (!data.length) {
    return null;
  }
  return {
    title: { text: title, left: 'center', top: 2, textStyle: { fontSize: 11, fontWeight: 600, color: '#36424d' } },
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: {
      orient: 'vertical', right: 4, top: 20, bottom: 4,
      type: data.length > 6 ? 'scroll' : 'plain',
      pageIconSize: 8, pageTextStyle: { fontSize: 8 },
      textStyle: { fontSize: 9 }, itemWidth: 8, itemHeight: 8, itemGap: 6
    },
    series: [{
      type: 'pie',
      center: ['32%', '56%'],
      radius: ['46%', '72%'],
      top: 20,
      bottom: 4,
      itemStyle: { borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      data: data.map((s) => ({ name: s.label, value: s.count, itemStyle: { color: s.color } }))
    }]
  };
}

export function toRankedBarOptions(title: string, segments: ColumnBarSegment[]): EChartOption | null {
  const data = segments.filter((s) => s.count > 0);
  if (!data.length) {
    return null;
  }
  const ordered = data.slice().reverse();
  return {
    title: { text: title, left: 'center', top: 2, textStyle: { fontSize: 11, fontWeight: 600, color: '#36424d' } },
    tooltip: { trigger: 'item', formatter: '{b}: {c}' },
    grid: { left: 4, right: 6, top: 22, bottom: 4, containLabel: true },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: ordered.map((s) => s.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { fontSize: 9, color: '#36424d' }
    },
    series: [{
      type: 'bar',
      barMaxWidth: 12,
      data: ordered.map((s) => ({ value: s.count, itemStyle: { color: s.color } })),
      label: { show: true, position: 'right', fontSize: 9, color: '#7b8794' }
    }]
  };
}

export function jobIdRankedBarOptions(rows: any[], excludeIfSingleJob: boolean): EChartOption | null {
  const counts = new Map<string, number>();
  (rows || []).forEach((row: any) => {
    if (row.jobId === null || row.jobId === undefined) {
      return;
    }
    const label = String(row.jobId);
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  if (!counts.size || (excludeIfSingleJob && counts.size === 1)) {
    return null;
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, JOB_ID_PIE_TOP_N);
  const rest = sorted.slice(JOB_ID_PIE_TOP_N);
  const restTotal = rest.reduce((sum, [, count]) => sum + count, 0);
  const segments: ColumnBarSegment[] = top.map(([label, count], i) => ({
    label: `Job ${label}`, count, pct: 0, color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]
  }));
  if (restTotal > 0) {
    segments.push({ label: `Other (${rest.length} jobs)`, count: restTotal, pct: 0, color: '#9aa5ac' });
  }
  return toRankedBarOptions('Job Id', segments);
}

export function booleanFieldsChartOptions(
  rows: any[], fields: { key: string; label: string }[]
): EChartOption | null {
  const labels: string[] = [];
  const trueData: number[] = [];
  const falseData: number[] = [];
  fields.forEach((f) => {
    const trueCount = (rows || []).filter((r: any) => r[f.key] === true).length;
    const falseCount = (rows || []).filter((r: any) => r[f.key] === false).length;
    if (trueCount + falseCount === 0) {
      return;
    }
    labels.push(f.label);
    trueData.push(trueCount);
    falseData.push(falseCount);
  });
  if (!labels.length) {
    return null;
  }
  return {
    title: { text: 'Run / Skip / Q Send', left: 'center', top: 2, textStyle: { fontSize: 11, fontWeight: 600, color: '#36424d' } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { bottom: 2, data: ['True', 'False'], textStyle: { fontSize: 9 }, itemWidth: 8, itemHeight: 8, itemGap: 10 },
    grid: { left: 66, right: 14, top: 30, bottom: 26, containLabel: true },
    xAxis: { type: 'value', splitNumber: 3, axisLabel: { fontSize: 8, formatter: compactAxisNumber } },
    yAxis: { type: 'category', data: labels, axisLabel: { fontSize: 9 } },
    series: [
      { name: 'True', type: 'bar', stack: 'total', barMaxWidth: 16, data: trueData, itemStyle: { color: PILL_SUCCESS_COLOR } },
      { name: 'False', type: 'bar', stack: 'total', barMaxWidth: 16, data: falseData, itemStyle: { color: PILL_DANGER_COLOR } }
    ]
  };
}

export function formatDateTime(value: any): string {
  if (!value) {
    return '-';
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    return '-';
  }
  const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
