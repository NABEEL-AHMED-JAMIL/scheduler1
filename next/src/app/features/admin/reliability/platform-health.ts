import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { Segmented, SegmentOption } from '../../../shared/ui/segmented';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { EChart } from '../../../shared/charts/echart/echart';
import { ChartThemes } from '../../../shared/charts/echart/chart-themes';
import { CONSOLE_THEME } from '../../../shared/charts/echart/echart-theme';
import { refusal } from '../../../shared/ui/bulk/bulk.model';
import { AlertsApi, PlannedDeploy, PlatformHealth, Probe, ServiceHealth } from '../../settings/alerts/alerts.api';
import { AlertRules } from '../../settings/alerts/alert-rules';

export type HealthMetric = 'requestsPerMin' | 'errorsPerMin' | 'meanMs' | 'heapUsedMb' | 'cpuPct';

const METRIC_LABEL: Record<HealthMetric, string> = {
  requestsPerMin: 'Requests a minute', errorsPerMin: 'Errors a minute', meanMs: 'Mean latency (ms)', heapUsedMb: 'Heap in use (MB)',
  cpuPct: 'CPU (%)',
};

/** A status as a person reads it, and the tone of its dot. */
export function statusWord(status: string | undefined): { word: string; tone: 'ok' | 'warn' | 'crit' | 'muted' } {
  switch (status) {
    case 'UP': return { word: 'Up', tone: 'ok' };
    case 'DOWN': return { word: 'Down', tone: 'crit' };
    case 'UNREACHABLE': return { word: 'Not answering', tone: 'crit' };
    case 'OUT_OF_SERVICE': return { word: 'Out of service', tone: 'warn' };
    default: return { word: 'Not sampled yet', tone: 'muted' };
  }
}

/** The series that marks the planned deploys: a dashed line at each start and a band to its end, in the muted text colour. */
export const PLANNED_DEPLOYS = 'Planned deploys';

function deployMarks(deploys: PlannedDeploy[], text: string): Record<string, unknown> {
  return {
    name: PLANNED_DEPLOYS, type: 'line', data: [], silent: true, color: text, lineStyle: { type: 'dashed', width: 1 },
    markLine: {
      silent: true, symbol: ['none', 'none'], label: { show: false }, lineStyle: { color: text, type: 'dashed', width: 1, opacity: 0.7 },
      data: deploys.map(d => ({ xAxis: d.start, name: `${d.service} deploy` })),
    },
    markArea: {
      silent: true, itemStyle: { color: text, opacity: 0.12 },
      data: deploys.map(d => [{ xAxis: d.start, name: `${d.service} deploy` }, { xAxis: d.closes }]),
    },
  };
}

/** A service's 24 hours as one line per service, for the picked figure, with the planned deploys marked: an ECharts option. */
export function healthOption(services: ServiceHealth[], metric: HealthMetric, palette: string[], text: string, border: string,
  asOf?: string, deploys: PlannedDeploy[] = []): Record<string, unknown> {
  const shown = services.filter(s => s.series && s.series.at.length);
  // The axis is the last 24 hours whatever the samples hold: a first hour of samples is drawn at the right end, not spread.
  const end = asOf ? Date.parse(asOf) : NaN;
  return {
    animation: false,
    color: palette,
    grid: { left: 8, right: 16, top: 36, bottom: 4, containLabel: true },
    legend: { type: 'scroll', top: 0, textStyle: { color: text, fontSize: 11 } },
    tooltip: { trigger: 'axis', valueFormatter: (v: number | null) => (v == null ? '—' : Number(v).toLocaleString('en-US')) },
    xAxis: { type: 'time', ...(Number.isNaN(end) ? {} : { min: end - 86_400_000, max: end }), axisLabel: { color: text, fontSize: 11, hideOverlap: true }, axisLine: { lineStyle: { color: border } } },
    yAxis: { type: 'value', min: 0, axisLabel: { color: text, fontSize: 11 }, splitLine: { lineStyle: { color: border, opacity: 0.5 } } },
    series: [
      ...shown.map(s => ({
        name: s.service, type: 'line', showSymbol: s.series!.at.length < 4, symbolSize: 4, smooth: false, connectNulls: false, lineStyle: { width: 1.5 },
        data: s.series!.at.map((at, i) => [at, (s.series![metric] as (number | null)[])[i]]),
      })),
      ...(deploys.length ? [deployMarks(deploys, text)] : []),
    ],
  };
}

/** How long a planned deploy's window was open, in words: "2 min", "45 s", or "running". */
export function deployLength(d: PlannedDeploy): string {
  if (d.state === 'open') return 'running';
  const seconds = Math.max(0, Math.round((Date.parse(d.closes) - Date.parse(d.start)) / 1000));
  return seconds < 90 ? `${seconds} s` : `${Math.round(seconds / 60)} min`;
}

/** A service's restarts in 24 hours that were not a planned deploy: the ones that alerted. */
export function unplannedRestarts(s: ServiceHealth): number {
  return Math.max(0, (s.restarts24h ?? 0) - (s.plannedRestarts24h ?? 0));
}

/**
 * MIG-355: Platform › Reliability's health view -- every service's status, heap, CPU, request and error rate, mean latency
 * and restarts in 24 hours, from Core's minute samples of what the services already serve (Actuator; nothing new runs);
 * the 24 hours as one chart per figure, the planned deploys marked on it (scripts/deploy.sh's windows: their restarts
 * raised no alert); Kafka lag, disk and the billing reconciliation; then the platform's alerts and the rules that raise them.
 */
@Component({
  selector: 'app-platform-health',
  imports: [Icon, Segmented, ServerTimePipe, DecimalPipe, EChart, AlertRules],
  styles: `
    .dot { display: inline-block; width: 0.5rem; height: 0.5rem; border-radius: 999px; margin-right: 0.4rem; vertical-align: middle; }
    .dot-ok { background: var(--series-ok); }
    .dot-warn { background: var(--series-warn, var(--warn-text)); }
    .dot-crit { background: var(--series-crit); }
    .dot-muted { background: var(--border-strong); }
    .rel-table-wrap { overflow-x: auto; }
    .probe-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); gap: 0.75rem; }
  `,
  template: `
    <section class="flex flex-col gap-4" aria-labelledby="health-title" data-test="platform-health">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-lg font-semibold m-0" id="health-title">Services</h2>
        <span class="text-sm text-[color:var(--text-secondary)]">{{ summary() }}</span>
        @if (health(); as h) { <span class="text-xs text-[color:var(--text-muted)]">as of {{ h.asOf | serverTime:'recentSec' }}, sampled each minute</span> }
        <button type="button" class="btn btn-ghost btn-sm ml-auto" (click)="load()" [disabled]="loading()"><app-icon name="refresh" [busy]="loading()" />Refresh</button>
      </div>
      @if (error()) { <p class="text-sm text-crit-500 m-0" role="alert">{{ error() }}</p> }

      <div class="card rel-table-wrap">
        <table class="table-modern" data-test="health-table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Status</th>
              <th class="text-right">Heap</th>
              <th class="text-right">After GC</th>
              <th class="text-right">CPU</th>
              <th class="text-right">Requests/min</th>
              <th class="text-right">Errors</th>
              <th class="text-right">Mean latency</th>
              <th class="text-right" title="Restarts in 24 hours; a planned deploy's restart (scripts/deploy.sh) raises no alert and is counted apart.">Restarts (24 h)</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            @for (s of services(); track s.service) {
              <tr [attr.data-service]="s.service" [attr.data-status]="s.status">
                <td class="font-medium">{{ s.service }}</td>
                <td class="whitespace-nowrap"><span class="dot" [class]="'dot dot-' + status(s).tone"></span>{{ status(s).word }}
                  @if (s.source === 'HEALTH' && s.status === 'UP') { <span class="text-[11px] text-[color:var(--text-muted)]" title="This service serves its health only: its port is public (the gateway) or its figures need a sign-in (identity)."> · health only</span> }</td>
                <td class="text-right tabular whitespace-nowrap">@if (s.heapUsedMb != null) { {{ s.heapUsedMb | number }}@if (s.heapMaxMb) { <span class="text-[color:var(--text-muted)]"> / {{ s.heapMaxMb | number }}</span> } MB } @else { — }</td>
                <td class="text-right tabular" [class.text-crit-500]="(s.heapAfterGcPct ?? 0) >= 85">{{ s.heapAfterGcPct != null ? (s.heapAfterGcPct | number:'1.0-0') + '%' : '—' }}</td>
                <td class="text-right tabular">{{ s.cpuPct != null ? (s.cpuPct | number:'1.0-1') + '%' : '—' }}</td>
                <td class="text-right tabular">{{ s.requestsPerMin != null ? (s.requestsPerMin | number:'1.0-1') : '—' }}</td>
                <td class="text-right tabular" [class.text-crit-500]="(s.errorsPerMin ?? 0) > 0">
                  {{ s.errorsPerMin != null ? (s.errorsPerMin | number:'1.0-2') : '—' }}@if (s.errorPct != null) { <span class="text-[color:var(--text-muted)]"> ({{ s.errorPct }}%)</span> }</td>
                <td class="text-right tabular">{{ s.meanMs != null ? (s.meanMs | number:'1.0-0') + ' ms' : '—' }}</td>
                <td class="text-right tabular whitespace-nowrap" [class.text-warn-500]="unplanned(s) > 0" [attr.data-planned]="s.plannedRestarts24h ?? 0">{{ s.restarts24h ?? '—' }}@if (s.plannedRestarts24h) { <span class="text-[11px] text-[color:var(--text-muted)]"> ({{ s.plannedRestarts24h }} planned)</span> }</td>
                <td class="whitespace-nowrap text-[color:var(--text-secondary)]">{{ s.startedAt ? (s.startedAt | serverTime:'recent') : '—' }}</td>
              </tr>
            } @empty {
              <tr><td colspan="10" class="text-center text-[color:var(--text-muted)] py-4">{{ loading() ? 'Reading the services…' : 'No sample yet: the first comes within a minute of Core starting.' }}</td></tr>
            }
          </tbody>
        </table>
      </div>

      <section class="card chart-card" aria-labelledby="health-chart-title" data-test="health-chart">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="chart-title m-0" id="health-chart-title">The last 24 hours</h3>
          <span class="chart-sub">{{ metricLabel() }}, every {{ health()?.bucketMinutes ?? 15 }} minutes, one line a service</span>
          <app-segmented class="ml-auto" ariaLabel="Figure" [options]="metricOptions" [value]="metric()" (valueChange)="metric.set($event)" />
        </div>
        <app-echart [option]="option()" [theme]="theme().ref" [height]="260" [label]="metricLabel() + ' over the last 24 hours'" />
        @if (deploys().length) {
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs mt-1" data-test="planned-deploys">
            <span class="font-medium text-[color:var(--text-secondary)]" title="Announced by scripts/deploy.sh: a restart or unhealthy minute of that service inside its window raises no alert. Dashed on the chart.">Planned deploys</span>
            @for (d of deploys(); track d.service + d.start) {
              <span class="whitespace-nowrap" [attr.data-service]="d.service" [attr.data-state]="d.state">
                <span class="font-medium">{{ d.service }}</span>
                <span class="text-[color:var(--text-secondary)]"> {{ d.start | serverTime:'recent' }}, {{ length(d) }}</span>
                @if (d.outcome === 'failed') { <span class="text-crit-500"> · failed</span> }
                @if (d.state === 'expired') { <span class="text-warn-500" title="The deploy never ended its window; it ran out at its maximum."> · expired</span> }
              </span>
            }
          </div>
        }
      </section>

      <div class="probe-grid" data-test="health-probes">
        <div class="card p-4">
          <h3 class="chart-title m-0">Disk</h3>
          @if (disk(); as d) {
            <p class="text-2xl font-semibold m-0 mt-1 tabular" [class.text-crit-500]="(d.reading ?? 100) < 10">{{ d.reading | number:'1.0-1' }}% free</p>
            <p class="text-xs text-[color:var(--text-secondary)] m-0 mt-1">{{ d.detail }}</p>
          } @else { <p class="text-sm text-[color:var(--text-muted)] m-0 mt-1">Not read yet.</p> }
        </div>
        <div class="card p-4">
          <h3 class="chart-title m-0">Kafka consumers</h3>
          @if (lagging().length) {
            <ul class="list-none m-0 mt-1 p-0 text-sm">
              @for (p of lagging(); track p.probe) {
                <li class="flex justify-between gap-2"><span class="truncate" [title]="p.probe">{{ group(p) }}</span>
                  <span class="tabular" [class.text-crit-500]="(p.reading ?? 0) >= 1000">{{ p.reading | number:'1.0-0' }} behind</span></li>
              }
            </ul>
          } @else { <p class="text-sm text-[color:var(--text-secondary)] m-0 mt-1">{{ kafkaRead() ? 'Every consumer group is caught up.' : 'Not read yet.' }}</p> }
        </div>
        <div class="card p-4">
          <h3 class="chart-title m-0">Billing reconciliation</h3>
          @if (billing(); as b) {
            <p class="text-sm font-medium m-0 mt-1" [class.text-crit-500]="!b.ok">{{ b.ok ? 'Agrees' : 'Does not agree' }}</p>
            <p class="text-xs text-[color:var(--text-secondary)] m-0 mt-1">{{ b.detail }}</p>
            <p class="text-xs text-[color:var(--text-muted)] m-0 mt-1">Read {{ b.readAt | serverTime:'recent' }}, hourly.</p>
          } @else { <p class="text-sm text-[color:var(--text-muted)] m-0 mt-1">Not read yet (hourly).</p> }
        </div>
      </div>

      <h2 class="text-lg font-semibold m-0 mt-2">Platform alerts</h2>
      <app-alert-rules scope="platform" />
    </section>
  `,
})
export class PlatformHealthView implements OnInit, OnDestroy {
  private readonly api = inject(AlertsApi);
  private readonly themes = inject(ChartThemes);
  private timer?: ReturnType<typeof setInterval>;

  readonly health = signal<PlatformHealth | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly metric = signal<HealthMetric>('requestsPerMin');
  readonly metricOptions: SegmentOption<HealthMetric>[] = (Object.keys(METRIC_LABEL) as HealthMetric[]).map(id => ({ id, label: METRIC_LABEL[id] }));
  readonly theme = computed(() => this.themes.resolve(CONSOLE_THEME));

  readonly services = computed(() => this.health()?.services ?? []);
  readonly deploys = computed(() => this.health()?.deploys ?? []);
  readonly metricLabel = computed(() => METRIC_LABEL[this.metric()]);
  readonly option = computed(() => {
    const t = this.theme();
    return healthOption(this.services(), this.metric(), t.palette, t.tokens.textSecondary, t.tokens.border, this.health()?.asOf, this.deploys());
  });
  readonly summary = computed(() => {
    const all = this.services();
    if (!all.length) return '';
    const up = all.filter(s => s.status === 'UP').length;
    return up === all.length ? `All ${all.length} up.` : `${up} of ${all.length} up.`;
  });
  private readonly probes = computed(() => this.health()?.probes ?? []);
  readonly disk = computed(() => this.probes().find(p => p.probe.startsWith('disk:')) ?? null);
  readonly billing = computed(() => this.probes().find(p => p.probe === 'billing-reconcile') ?? null);
  readonly kafkaRead = computed(() => this.probes().some(p => p.probe.startsWith('kafka-lag:')));
  readonly lagging = computed(() => this.probes().filter(p => p.probe.startsWith('kafka-lag:') && (p.reading ?? 0) > 0)
    .sort((a, b) => (b.reading ?? 0) - (a.reading ?? 0)).slice(0, 8));

  ngOnInit(): void {
    this.load();
    // The samples are a minute apart: reading them again each minute keeps an open page current, and costs five statements.
    this.timer = setInterval(() => this.load(), 60_000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  load(): void {
    this.loading.set(true);
    this.api.health(15).subscribe({
      next: r => {
        this.loading.set(false);
        if (r?.status === API_SUCCESS && r.data) { this.health.set(r.data); this.error.set(''); }
        else this.error.set(r?.message || 'The platform\'s health could not be read.');
      },
      error: err => { this.loading.set(false); this.error.set(refusal(err, 'The platform\'s health could not be read.')); },
    });
  }

  status(s: ServiceHealth) { return statusWord(s.status); }

  unplanned(s: ServiceHealth): number { return unplannedRestarts(s); }

  length(d: PlannedDeploy): string { return deployLength(d); }

  group(p: Probe): string { return p.probe.replace(/^kafka-lag:/, ''); }
}
