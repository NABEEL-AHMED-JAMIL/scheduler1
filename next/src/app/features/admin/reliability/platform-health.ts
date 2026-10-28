import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { API_SUCCESS } from '../../../core/api/api.config';
import { StatTile } from '../../../shared/ui/stat-tile';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { refusal } from '../../../shared/ui/bulk/bulk.model';
import { AlertsApi, PlatformHealth, Probe, ServiceHealth } from '../../settings/alerts/alerts.api';
import { AlertRules } from '../../settings/alerts/alert-rules';
import { createTableSort } from '../../../shared/ui/sort';
import { SortHeader } from '../../../shared/ui/sort-header';
import { AppLoading, InlineStatus } from '../../../shared/ui/loading';
import { LoadError } from '../../../shared/ui/load-error';

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

/**
 * Owner 2026-10-19: what a service's newest deploy says on its row, when it says anything -- a deploy that failed, one that
 * never closed its window, or one running now. A deploy that went well says nothing beyond "deployed …".
 */
export function deployNote(s: ServiceHealth): { text: string; tone: 'crit' | 'warn' | 'info' } | null {
  const d = s.lastDeploy;
  if (!d) return null;
  if (d.outcome === 'failed') return { text: 'last deploy failed', tone: 'crit' };
  if (d.state === 'expired') return { text: 'last deploy never finished', tone: 'warn' };
  if (d.state === 'open') return { text: 'deploying now', tone: 'info' };
  return null;
}

/** One background check as the page lists it: a name, its result in words, what it found, and when it was read. */
export interface CheckRow { name: string; ok: boolean | null; tone: 'ok' | 'warn' | 'crit' | 'muted'; result: string; detail: string; readAt: string | null; every: string; }

const CHECK_NAMES: Record<string, { name: string; every: string }> = {
  'billing-reconcile': { name: 'Billing reconciliation', every: 'hourly' },
};

/**
 * Owner 2026-10-19: the checks Core runs on their own (Kafka consumer lag, the billing reconciliation, and any other probe)
 * as one short table instead of a box each. Kafka's groups are one row: caught up, or how many are behind and the worst.
 */
export function backgroundChecks(probes: Probe[]): CheckRow[] {
  const rows: CheckRow[] = [];
  const lag = probes.filter(p => p.probe.startsWith('kafka-lag:'));
  const latest = (list: Probe[]) => list.map(p => p.readAt).filter((t): t is string => !!t).sort().pop() ?? null;
  if (lag.length) {
    const behind = lag.filter(p => (p.reading ?? 0) > 0).sort((a, b) => (b.reading ?? 0) - (a.reading ?? 0));
    const worst = behind[0]?.reading ?? 0;
    rows.push({
      name: 'Kafka consumers', ok: !behind.length, tone: !behind.length ? 'ok' : worst >= 1000 ? 'crit' : 'warn',
      result: !behind.length ? 'Caught up' : `${behind.length} of ${lag.length} behind`,
      detail: !behind.length ? `${lag.length} consumer ${lag.length === 1 ? 'group' : 'groups'}, none behind`
        : behind.slice(0, 3).map(p => `${p.probe.replace(/^kafka-lag:/, '')} ${(p.reading ?? 0).toLocaleString('en-US')} behind`).join(' · ')
          + (behind.length > 3 ? ` · ${behind.length - 3} more` : ''),
      readAt: latest(lag), every: 'each minute',
    });
  } else {
    rows.push({ name: 'Kafka consumers', ok: null, tone: 'muted', result: 'Not read yet', detail: 'Read each minute once Core reaches Kafka.', readAt: null, every: 'each minute' });
  }
  for (const p of probes.filter(x => !x.probe.startsWith('kafka-lag:'))) {
    const known = CHECK_NAMES[p.probe];
    const billing = p.probe === 'billing-reconcile';
    rows.push({
      name: known?.name ?? p.probe, ok: p.ok, tone: p.ok ? 'ok' : 'crit',
      result: billing ? (p.ok ? 'Agrees' : 'Does not agree') : (p.ok ? 'OK' : 'Failing'),
      detail: p.detail ?? '', readAt: p.readAt, every: known?.every ?? '',
    });
  }
  if (!probes.some(p => p.probe === 'billing-reconcile')) {
    rows.push({ name: 'Billing reconciliation', ok: null, tone: 'muted', result: 'Not read yet', detail: 'Daily lines, invoices and usage events compared hourly.', readAt: null, every: 'hourly' });
  }
  return rows;
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
 * version it runs (and a deploy that failed or never finished, on its own row), when it started, its restarts in 24 hours --
 * planned (a deploy) or not -- and its error rate; the background checks (Kafka consumer lag, the billing reconciliation) as
 * one short table; then the platform's alerts and the rules that raise them. The separate list of planned deploys is gone
 * (owner 2026-10-19): each row already says its version and when it was deployed.
 * No heap, CPU or request charts: on AWS those are CloudWatch's (Container Insights). No disk box:
 * the disk rule still alerts.
 */
@Component({
  selector: 'app-platform-health',
  imports: [StatTile, ServerTimePipe, AlertRules, SortHeader, AppLoading, InlineStatus, LoadError],
  styles: `
    .dot { display: inline-block; width: 0.5rem; height: 0.5rem; border-radius: 999px; margin-right: 0.4rem; vertical-align: middle; }
    .dot-ok { background: var(--series-ok); }
    .dot-warn { background: var(--series-warn, var(--warn-text)); }
    .dot-crit { background: var(--series-crit); }
    .dot-info { background: var(--info-mark); }
    .note-info { color: var(--text-secondary); }
    .dot-muted { background: var(--border-strong); }
    .rel-table-wrap { overflow-x: auto; }
  `,
  template: `
    <section class="flex flex-col gap-4" aria-labelledby="health-title" data-test="platform-health">
      <div class="grid grid-cols-2 md:grid-cols-4 stat-strip stat-row is-md is-start" role="list" data-test="health-tiles">
        <app-stat-tile label="Services up" [value]="upCount() + ' of ' + services().length" icon="activity"
                       [tone]="upCount() === services().length ? 'ok' : 'crit'" [foot]="asOfFoot()"
                       [loading]="tilesLoading()" [failed]="tilesFailed()" />
        <app-stat-tile label="Unplanned restarts" [value]="'' + unplannedTotal()" icon="refresh"
                       [tone]="unplannedTotal() ? 'warn' : 'ok'" foot="in 24 hours; deploys are not counted"
                       [loading]="tilesLoading()" [failed]="tilesFailed()" />
        <app-stat-tile label="Errors" [value]="erroring().length ? erroring().length + ' services' : 'None'" icon="alert"
                       [tone]="erroring().length ? 'crit' : 'ok'" foot="answering 5xx in the last minutes"
                       [loading]="tilesLoading()" [failed]="tilesFailed()" />
        <app-stat-tile label="Background checks" [value]="checksFailing() ? checksFailing() + ' failing' : 'All OK'" icon="shield"
                       [tone]="checksFailing() ? 'crit' : 'ok'" foot="Kafka lag and billing reconciliation"
                       [loading]="tilesLoading()" [failed]="tilesFailed()" />
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-lg font-semibold m-0" id="health-title">Services</h2>
        <span class="text-sm text-[color:var(--text-secondary)]">{{ summary() }}</span>
      </div>
      <!-- Owner 2026-10-27: skeleton rows until the first sample answers; a failed first read says why with Try again; a
           failed minute's re-read keeps the rows and says so in a line above them. -->
      @if (error() && health()) { <app-inline-status [error]="error()" (retry)="load()" /> }

      <div class="card rel-table-wrap">
        @if (!health() && error()) {
          <app-load-error [message]="error()" (retry)="load()" />
        } @else if (!health()) {
          <app-loading shape="rows" [count]="5" label="Loading the services…" />
        } @else {
        <table class="table-modern" data-test="health-table">
          <thead>
            <tr>
              <th appSort="service" [sortBy]="sort">Service</th>
              <th appSort="status" [sortBy]="sort">Status</th>
              <th appSort="version" [sortBy]="sort">Version</th>
              <th appSort="started" [sortBy]="sort">Started</th>
              <th class="text-right" appSort="restarts" [sortBy]="sort" title="Restarts in 24 hours. A planned deploy's restart (scripts/deploy.sh) raises no alert and is counted apart.">Restarts (24 h)</th>
              <th class="text-right" appSort="errorRate" [sortBy]="sort" title="Answers 5xx, as a share of the requests a minute, from the latest sample">Error rate</th>
            </tr>
          </thead>
          <tbody>
            @for (s of sortedServices(); track s.service) {
              <tr [attr.data-service]="s.service" [attr.data-status]="s.status">
                <td class="font-medium">{{ s.service }}</td>
                <td class="whitespace-nowrap"><span class="dot" [class]="'dot dot-' + status(s).tone"></span>{{ status(s).word }}
                  @if (s.source === 'HEALTH' && s.status === 'UP') { <span class="text-[11px] text-[color:var(--text-muted)]" title="This service serves its health only: its port is public (the gateway) or its figures need a sign-in (identity)."> · health only</span> }</td>
                <td class="whitespace-nowrap" data-test="version">
                  @if (s.version) {
                    <span class="mono text-xs">{{ s.version }}</span>
                    @if (s.branch) { <span class="text-[11px] text-[color:var(--text-muted)]"> {{ s.branch }}</span> }
                    @if (s.deployedAt) { <div class="text-[11px] text-[color:var(--text-muted)]">deployed {{ s.deployedAt | serverTime:'recent' }}@if ((s.deploys24h ?? 0) > 1) { · {{ s.deploys24h }} deploys in 24 h }</div> }
                    @if (note(s); as n) { <div class="text-[11px] font-medium" [class.text-crit-500]="n.tone === 'crit'" [class.text-warn-500]="n.tone === 'warn'" [class.note-info]="n.tone === 'info'" data-test="deploy-note">{{ n.text }}</div> }
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
              <tr><td colspan="6" class="text-center text-[color:var(--text-muted)] py-4">No sample yet: the first comes within a minute of Core starting.</td></tr>
            }
          </tbody>
        </table>
        }
      </div>

      <div class="card rel-table-wrap" data-test="background-checks">
        <div class="px-4 py-3 border-b border-subtle">
          <h2 class="text-sm font-semibold m-0">Background checks</h2>
          <p class="text-xs text-[color:var(--text-muted)] m-0">Read on their own schedule; a failing check raises an alert through its rule below.</p>
        </div>
        <!-- Owner 2026-10-27: before the first answer the checks are not "Not read yet" (that is a real result): loading. -->
        @if (!health() && error()) {
          <p class="px-4 py-3 text-sm text-[color:var(--text-muted)] m-0">Not available right now.</p>
        } @else if (!health()) {
          <app-loading shape="rows" [count]="2" label="Loading the background checks…" />
        } @else {
        <table class="table-modern">
          <thead><tr><th>Check</th><th>Result</th><th>What it found</th><th class="text-right">Read</th></tr></thead>
          <tbody>
            @for (c of checks(); track c.name) {
              <tr [attr.data-check]="c.name">
                <td class="font-medium whitespace-nowrap">{{ c.name }}</td>
                <td class="whitespace-nowrap"><span class="dot" [class]="'dot dot-' + c.tone"></span>{{ c.result }}</td>
                <td class="text-[color:var(--text-secondary)]">{{ c.detail || '—' }}</td>
                <td class="text-right whitespace-nowrap text-[color:var(--text-secondary)]">{{ c.readAt ? (c.readAt | serverTime:'recent') : '—' }}@if (c.every) { <div class="text-[11px] text-[color:var(--text-muted)]">{{ c.every }}</div> }</td>
              </tr>
            }
          </tbody>
        </table>
        }
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
  /** Owner 2026-10-27: placeholders until the first sample, "Not available right now" when it could not be read. */
  readonly tilesLoading = computed(() => !this.health() && !this.error());
  readonly tilesFailed = computed(() => !this.health() && !!this.error());
  /**
   * Owner 2026-10-27: every column sorts; the rows keep the server's order until a heading is picked. The choice holds
   * through the minute's re-read, since it is applied to whatever the read brings.
   */
  readonly sort = createTableSort<ServiceHealth>({
    id: 'platform-services',
    columns: {
      service: s => s.service,
      status: { value: s => statusWord(s.status).word, kind: 'status', order: ['Down', 'Not answering', 'Out of service', 'Not sampled yet', 'Up'] },
      version: s => s.version,
      started: { value: s => s.startedAt, kind: 'date' },
      restarts: { value: s => s.restarts24h, kind: 'number' },
      errorRate: { value: s => s.errorPct, kind: 'number' },
    },
  });
  readonly sortedServices = computed(() => this.sort.apply(this.services()));
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
  readonly checks = computed(() => backgroundChecks(this.probes()));
  readonly checksFailing = computed(() => this.checks().filter(c => c.ok === false).length);

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

  note(s: ServiceHealth) { return deployNote(s); }
}
