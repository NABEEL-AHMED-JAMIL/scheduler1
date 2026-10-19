import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { API_SUCCESS } from '../../../core/api/api.config';
import { StatTile } from '../../../shared/ui/stat-tile';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { refusal } from '../../../shared/ui/bulk/bulk.model';
import { AlertsApi, PlannedDeploy, PlatformHealth, Probe, ServiceHealth } from '../../settings/alerts/alerts.api';
import { AlertRules } from '../../settings/alerts/alert-rules';

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

/** The error rate as the table says it: "0.4% · 1.2/min", "none", or "—" when nothing was asked. */
export function errorRate(s: ServiceHealth): { text: string; bad: boolean } {
  if (s.errorPct == null && (s.requestsPerMin == null || Number(s.requestsPerMin) === 0)) return { text: '—', bad: false };
  const pct = Number(s.errorPct ?? 0);
  const epm = Number(s.errorsPerMin ?? 0);
  if (!epm) return { text: 'none', bad: false };
  return { text: `${pct.toLocaleString('en-US', { maximumFractionDigits: 1 })}% · ${epm.toLocaleString('en-US', { maximumFractionDigits: 2 })}/min`, bad: true };
}

/**
 * Platform › Service health's services (owner #21, 2026-10-19; MIG-355's health view, slimmed): every service's status, the
 * version it runs, when it started, its restarts in 24 hours -- planned (a deploy) or not -- and its error rate; the planned
 * deploys; the Kafka consumers and the billing reconciliation, which have rules of their own; then the platform's alerts and
 * the rules that raise them. No heap, CPU or request charts: on AWS those are CloudWatch's (Container Insights). No disk box:
 * the disk rule still alerts.
 */
@Component({
  selector: 'app-platform-health',
  imports: [StatTile, ServerTimePipe, DecimalPipe, AlertRules],
  styles: `
    .dot { display: inline-block; width: 0.5rem; height: 0.5rem; border-radius: 999px; margin-right: 0.4rem; vertical-align: middle; }
    .dot-ok { background: var(--series-ok); }
    .dot-warn { background: var(--series-warn, var(--warn-text)); }
    .dot-crit { background: var(--series-crit); }
    .dot-muted { background: var(--border-strong); }
    .rel-table-wrap { overflow-x: auto; }
    .health-side { display: grid; grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr)); gap: 1rem; }
  `,
  template: `
    <section class="flex flex-col gap-4" aria-labelledby="health-title" data-test="platform-health">
      <div class="grid grid-cols-2 md:grid-cols-4 stat-strip stat-row is-md is-start" role="list" data-test="health-tiles">
        <app-stat-tile label="Services up" [value]="upCount() + ' of ' + services().length" icon="activity"
                       [tone]="upCount() === services().length ? 'ok' : 'crit'" [foot]="asOfFoot()" />
        <app-stat-tile label="Unplanned restarts" [value]="'' + unplannedTotal()" icon="refresh"
                       [tone]="unplannedTotal() ? 'warn' : 'ok'" foot="in 24 hours; deploys are not counted" />
        <app-stat-tile label="Errors" [value]="erroring().length ? erroring().length + ' services' : 'None'" icon="alert"
                       [tone]="erroring().length ? 'crit' : 'ok'" foot="answering 5xx in the last minutes" />
        <app-stat-tile label="Planned deploys" [value]="'' + deploys().length" icon="upload" tone="info" foot="in 24 hours" />
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-lg font-semibold m-0" id="health-title">Services</h2>
        <span class="text-sm text-[color:var(--text-secondary)]">{{ summary() }}</span>
      </div>
      @if (error()) { <p class="text-sm text-crit-500 m-0" role="alert">{{ error() }}</p> }

      <div class="card rel-table-wrap">
        <table class="table-modern" data-test="health-table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Status</th>
              <th>Version</th>
              <th>Started</th>
              <th class="text-right" title="Restarts in 24 hours. A planned deploy's restart (scripts/deploy.sh) raises no alert and is counted apart.">Restarts (24 h)</th>
              <th class="text-right" title="Answers 5xx, as a share of the requests a minute, from the latest sample">Error rate</th>
            </tr>
          </thead>
          <tbody>
            @for (s of services(); track s.service) {
              <tr [attr.data-service]="s.service" [attr.data-status]="s.status">
                <td class="font-medium">{{ s.service }}</td>
                <td class="whitespace-nowrap"><span class="dot" [class]="'dot dot-' + status(s).tone"></span>{{ status(s).word }}
                  @if (s.source === 'HEALTH' && s.status === 'UP') { <span class="text-[11px] text-[color:var(--text-muted)]" title="This service serves its health only: its port is public (the gateway) or its figures need a sign-in (identity)."> · health only</span> }</td>
                <td class="whitespace-nowrap" data-test="version">
                  @if (s.version) {
                    <span class="mono text-xs">{{ s.version }}</span>
                    @if (s.branch) { <span class="text-[11px] text-[color:var(--text-muted)]"> {{ s.branch }}</span> }
                    @if (s.deployedAt) { <div class="text-[11px] text-[color:var(--text-muted)]">deployed {{ s.deployedAt | serverTime:'recent' }}</div> }
                  } @else { <span class="text-[color:var(--text-muted)]" title="Recorded by scripts/deploy.sh from the service's next deploy">—</span> }
                </td>
                <td class="whitespace-nowrap text-[color:var(--text-secondary)]">{{ s.startedAt ? (s.startedAt | serverTime:'recent') : '—' }}</td>
                <td class="text-right tabular whitespace-nowrap" [class.text-warn-500]="unplanned(s) > 0" [attr.data-planned]="s.plannedRestarts24h ?? 0">
                  {{ s.restarts24h ?? '—' }}
                  @if (s.restarts24h) { <div class="text-[11px] text-[color:var(--text-muted)]">{{ s.plannedRestarts24h ?? 0 }} planned · {{ unplanned(s) }} unplanned</div> }
                </td>
                <td class="text-right tabular whitespace-nowrap" [class.text-crit-500]="rate(s).bad" data-test="error-rate">{{ rate(s).text }}</td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="text-center text-[color:var(--text-muted)] py-4">{{ loading() ? 'Reading the services…' : 'No sample yet: the first comes within a minute of Core starting.' }}</td></tr>
            }
          </tbody>
        </table>
      </div>

      <div class="health-side">
        <section class="card p-4" data-test="planned-deploys" aria-labelledby="deploys-title">
          <h3 class="chart-title m-0" id="deploys-title">Planned deploys</h3>
          <p class="chart-sub m-0">The last 24 hours, newest first. A restart inside one raises no alert.</p>
          @if (deploys().length) {
            <ul class="list-none m-0 mt-2 p-0 text-sm flex flex-col gap-1">
              @for (d of shownDeploys(); track d.service + d.start) {
                <li class="flex justify-between gap-2" [attr.data-service]="d.service" [attr.data-state]="d.state">
                  <span class="font-medium truncate">{{ d.service }}</span>
                  <span class="text-[color:var(--text-secondary)] whitespace-nowrap">{{ d.start | serverTime:'recent' }}, {{ length(d) }}
                    @if (d.outcome === 'failed') { <span class="text-crit-500"> · failed</span> }
                    @if (d.state === 'expired') { <span class="text-warn-500" title="The deploy never ended its window; it ran out at its maximum."> · expired</span> }
                  </span>
                </li>
              }
            </ul>
            @if (deploys().length > DEPLOYS_SHOWN) {
              <button type="button" class="btn btn-ghost btn-xs mt-1" data-test="deploys-more" (click)="allDeploys.set(!allDeploys())" [attr.aria-expanded]="allDeploys()">
                {{ allDeploys() ? 'Show fewer' : 'and ' + (deploys().length - DEPLOYS_SHOWN) + ' more' }}
              </button>
            }
          } @else { <p class="text-sm text-[color:var(--text-muted)] m-0 mt-2">No deploy in the last 24 hours.</p> }
        </section>
        <section class="card p-4" aria-labelledby="kafka-title">
          <h3 class="chart-title m-0" id="kafka-title">Kafka consumers</h3>
          @if (lagging().length) {
            <ul class="list-none m-0 mt-2 p-0 text-sm">
              @for (p of lagging(); track p.probe) {
                <li class="flex justify-between gap-2"><span class="truncate" [title]="p.probe">{{ group(p) }}</span>
                  <span class="tabular" [class.text-crit-500]="(p.reading ?? 0) >= 1000">{{ p.reading | number:'1.0-0' }} behind</span></li>
              }
            </ul>
          } @else { <p class="text-sm text-[color:var(--text-secondary)] m-0 mt-2">{{ kafkaRead() ? 'Every consumer group is caught up.' : 'Not read yet.' }}</p> }
        </section>
        <section class="card p-4" aria-labelledby="reconcile-title">
          <h3 class="chart-title m-0" id="reconcile-title">Billing reconciliation</h3>
          @if (billing(); as b) {
            <p class="text-sm font-medium m-0 mt-2" [class.text-crit-500]="!b.ok">{{ b.ok ? 'Agrees' : 'Does not agree' }}</p>
            <p class="text-xs text-[color:var(--text-secondary)] m-0 mt-1">{{ b.detail }}</p>
            <p class="text-xs text-[color:var(--text-muted)] m-0 mt-1">Read {{ b.readAt | serverTime:'recent' }}, hourly.</p>
          } @else { <p class="text-sm text-[color:var(--text-muted)] m-0 mt-2">Not read yet (hourly).</p> }
        </section>
      </div>

      <h2 class="text-lg font-semibold m-0 mt-2">Platform alerts</h2>
      <app-alert-rules scope="platform" />
    </section>
  `,
})
export class PlatformHealthView implements OnInit, OnDestroy {
  private readonly api = inject(AlertsApi);
  private timer?: ReturnType<typeof setInterval>;

  readonly health = signal<PlatformHealth | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');

  readonly services = computed(() => this.health()?.services ?? []);
  readonly deploys = computed(() => this.health()?.deploys ?? []);
  /** A busy day's deploys would push Kafka and billing off the screen: the newest eight, then "and N more". */
  readonly DEPLOYS_SHOWN = 8;
  readonly allDeploys = signal(false);
  readonly shownDeploys = computed(() => this.allDeploys() ? this.deploys() : this.deploys().slice(0, this.DEPLOYS_SHOWN));
  readonly upCount = computed(() => this.services().filter(s => s.status === 'UP').length);
  readonly unplannedTotal = computed(() => this.services().reduce((n, s) => n + unplannedRestarts(s), 0));
  readonly erroring = computed(() => this.services().filter(s => errorRate(s).bad));
  readonly summary = computed(() => {
    const all = this.services();
    if (!all.length) return '';
    return this.upCount() === all.length ? `All ${all.length} up.` : `${this.upCount()} of ${all.length} up.`;
  });
  readonly asOfFoot = computed(() => (this.health() ? 'sampled each minute' : 'not sampled yet'));
  private readonly probes = computed(() => this.health()?.probes ?? []);
  readonly billing = computed(() => this.probes().find(p => p.probe === 'billing-reconcile') ?? null);
  readonly kafkaRead = computed(() => this.probes().some(p => p.probe.startsWith('kafka-lag:')));
  readonly lagging = computed(() => this.probes().filter(p => p.probe.startsWith('kafka-lag:') && (p.reading ?? 0) > 0)
    .sort((a, b) => (b.reading ?? 0) - (a.reading ?? 0)).slice(0, 8));

  ngOnInit(): void {
    this.load();
    // The samples are a minute apart: reading them again each minute keeps an open page current.
    this.timer = setInterval(() => this.load(), 60_000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  load(): void {
    this.loading.set(true);
    this.api.health().subscribe({
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

  rate(s: ServiceHealth) { return errorRate(s); }

  length(d: PlannedDeploy): string { return deployLength(d); }

  group(p: Probe): string { return p.probe.replace(/^kafka-lag:/, ''); }
}
