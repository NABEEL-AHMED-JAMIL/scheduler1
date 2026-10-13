import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { Observable, Subscription, map } from 'rxjs';
import { API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { Icon } from '../../../shared/ui/icon';
import { PageHeader } from '../../../shared/ui/page-header';
import { RefreshButton } from '../../../shared/ui/refresh-button';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { DateRange, DateRangePicker, rangeKey, rangeText, restoreRange } from '../../../shared/ui/date-range';
import { sidePanelConfig } from '../../../shared/ui/side-panel';
import { BulkBar } from '../../../shared/ui/bulk/bulk-bar';
import { BulkAnswer, BulkRequest, BulkSelection, BulkSource } from '../../../shared/ui/bulk/bulk.model';
import { refusal } from '../../../shared/ui/bulk/bulk.model';
import {
  ErrorGroup, FacetValue, FailedQuery, FailedRun, FailedRunsAnswer, FailedRunsApi, dayLabel, windowOf,
} from './failed-runs.api';
import { FailedRunPanel, FailedRunPanelData } from './failed-run-panel';

/** The facets of the rail, in the order a reader narrows: where, what, which step, why, when. */
type FacetName = 'tenantIds' | 'taskDetailIds' | 'jobIds' | 'tasks' | 'kinds' | 'days';

interface RailSection { name: FacetName; title: string; values: FacetValue[]; picked: string[]; }

const SHOWN = 8;
const RETRY_CAP = 50;

/**
 * MIG-355: Runs › Failed -- every failed or timed-out run of the dates, across the workspace's pipelines (a platform
 * administrator's: across workspaces). Facets on the left with the server's counts (workspace, pipeline, schedule, the
 * failing step's task, error kind, day); the error patterns above the list, grouped as log tools group lines, each with its
 * count and when it was first and last seen; the list, a page at a time. A row opens its detail on the right: the step that
 * failed, the whole error, the run, and Retry from failed step (MIG-345). A workspace administrator picks runs and retries
 * them together (at most 50, a dry run first, an answer per run).
 */
@Component({
  selector: 'app-failed-runs',
  imports: [PageHeader, RefreshButton, DateRangePicker, Icon, ServerTimePipe, DecimalPipe, BulkBar],
  templateUrl: './failed-runs.html',
  styles: `
    .failed-explorer { display: grid; grid-template-columns: 15rem minmax(0, 1fr); gap: 1rem; align-items: start; }
    .failed-rail { position: sticky; top: 1rem; max-height: calc(100vh - 2rem); overflow-y: auto; display: flex; flex-direction: column; gap: 1rem; }
    @media (max-width: 1023px) { .failed-explorer { grid-template-columns: minmax(0, 1fr); } .failed-rail { position: static; max-height: none; } }
    .facet-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; }
    .facet-title { font-size: 12px; font-weight: 600; color: var(--text-primary); }
    .facet-clear, .facet-more { margin-left: auto; font-size: 11px; color: var(--accent-text); background: none; border: 0; padding: 0; cursor: pointer; }
    .facet-more { margin: 0; padding: 0.25rem 0.375rem; font-size: 12px; }
    .facet-row { display: flex; align-items: center; gap: 0.5rem; width: 100%; padding: 0.25rem 0.375rem; border-radius: var(--radius-sm);
      font-size: 13px; line-height: 1.25rem; color: var(--text-secondary); cursor: pointer; min-width: 0; }
    .facet-row:hover { background: var(--surface-inset); }
    .facet-row.is-on { color: var(--text-primary); font-weight: 500; }
    .facet-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .facet-count { flex: none; font-variant-numeric: tabular-nums; font-size: 12px; color: var(--text-muted); }
    .pattern-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .pattern-row { display: grid; grid-template-columns: 3.5rem minmax(0, 1fr) auto; gap: 0.75rem; align-items: center; padding: 0.5rem 0.25rem;
      border-top: 1px solid var(--border-subtle); cursor: pointer; text-align: left; width: 100%; background: none; border-left: 0; border-right: 0;
      border-bottom: 0; color: inherit; font: inherit; }
    .pattern-row:first-child { border-top: 0; }
    .pattern-row:hover { background: var(--surface-inset); }
    .pattern-row.is-on { background: var(--accent-soft, var(--surface-inset)); }
    .pattern-count { font-variant-numeric: tabular-nums; font-weight: 600; text-align: right; }
    .pattern-text { font-family: var(--font-mono, ui-monospace, monospace); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap; }
    .pattern-meta { font-size: 12px; color: var(--text-muted); white-space: nowrap; }
    .kind-chip { display: inline-flex; align-items: center; padding: 0 0.4rem; border-radius: 999px; font-size: 11px; line-height: 1.25rem;
      border: 1px solid var(--border-subtle); color: var(--text-secondary); white-space: nowrap; }
    .error-cell { max-width: 0; width: 100%; min-width: 14rem; }
  `,
})
export class FailedRuns implements OnInit {
  private readonly api = inject(FailedRunsApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(Dialog);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private request?: Subscription;

  /** A platform administrator sees every workspace's failed runs, read only. */
  readonly platform = computed(() => this.auth.role() === 'PLATFORM_ADMIN');
  /** Retry is a workspace's: the run's own page rules (Schedules), and bulk retry its administrator's. */
  readonly canRetry = computed(() => !this.platform() && this.auth.canOpen('jobs'));
  readonly canBulkRetry = computed(() => this.auth.role() === 'TENANT_ADMIN' && !this.auth.builderLocked());

  readonly rangeStore = rangeKey('runs-failed', typeof this.auth?.user === 'function' ? this.auth.user()?.appUserId : null);
  readonly range = signal<DateRange>(restoreRange(this.rangeStore, '7d'));
  readonly rangeLabel = computed(() => rangeText(this.range().from, this.range().to));

  readonly filter = signal<Record<FacetName, string[]>>({ tenantIds: [], taskDetailIds: [], jobIds: [], tasks: [], kinds: [], days: [] });
  readonly signature = signal<string | null>(null);
  readonly page = signal(0);
  readonly answer = signal<FailedRunsAnswer | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly expanded = signal<Set<FacetName>>(new Set());

  readonly items = computed(() => this.answer()?.items ?? []);
  readonly groups = computed(() => this.answer()?.groups ?? []);
  readonly total = computed(() => this.answer()?.total ?? 0);
  readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / (this.answer()?.pageSize ?? 50))));
  readonly pickedGroup = computed(() => this.groups().find(g => g.signature === this.signature()) ?? null);

  readonly sections = computed<RailSection[]>(() => {
    const f = this.answer()?.facets;
    const picked = this.filter();
    const out: RailSection[] = [];
    if (this.platform()) out.push({ name: 'tenantIds', title: 'Workspace', values: f?.workspaces ?? [], picked: picked.tenantIds });
    out.push({ name: 'taskDetailIds', title: 'Pipeline', values: f?.pipelines ?? [], picked: picked.taskDetailIds });
    out.push({ name: 'jobIds', title: 'Schedule', values: f?.schedules ?? [], picked: picked.jobIds });
    out.push({ name: 'tasks', title: 'Failing step', values: f?.steps ?? [], picked: picked.tasks });
    out.push({ name: 'kinds', title: 'Error kind', values: f?.kinds ?? [], picked: picked.kinds });
    out.push({ name: 'days', title: 'Day', values: (f?.days ?? []).map(d => ({ ...d, name: dayLabel(d.key) })), picked: picked.days });
    return out;
  });

  readonly anyFilter = computed(() => Object.values(this.filter()).some(v => v.length) || !!this.signature());

  /** The rows picked for a bulk retry; cleared whenever the list changes under them. */
  readonly source: BulkSource<FailedRun> = {
    idOf: row => row.runId,
    cap: RETRY_CAP,
    noun: ['run', 'runs'],
    groupNoun: 'schedule',
    send: (rows: FailedRun[], request: BulkRequest): Observable<ApiResponse<BulkAnswer>> =>
      this.api.bulkRetry(rows.map(r => r.runId), request.bulkId, request.dryRun).pipe(map(r => r)),
  };
  readonly selection = new BulkSelection<FailedRun>(this.source);
  readonly retryableOnPage = computed(() => this.items().filter(r => r.retryable));

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    const pipeline = q.get('pipeline');
    if (pipeline && /^\d+$/.test(pipeline)) this.filter.update(f => ({ ...f, jobIds: [pipeline] }));
    const signature = q.get('signature');
    if (signature && /^[0-9a-f]{12}$/.test(signature)) this.signature.set(signature);
    this.destroyRef.onDestroy(() => this.request?.unsubscribe());
    this.load();
  }

  query(): FailedQuery {
    const w = windowOf(this.range().from, this.range().to);
    const f = this.filter();
    const ids = (values: string[]) => values.filter(v => /^\d+$/.test(v)).map(Number);
    return {
      from: w.from, to: w.to, tenantIds: ids(f.tenantIds), taskDetailIds: ids(f.taskDetailIds), jobIds: ids(f.jobIds),
      tasks: f.tasks, kinds: f.kinds, days: f.days, signature: this.signature(), page: this.page(),
    };
  }

  load(): void {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    this.request = this.api.search(this.query()).subscribe({
      next: r => {
        this.loading.set(false);
        if (r?.status === API_SUCCESS && r.data) {
          this.answer.set(r.data);
        } else {
          this.error.set(r?.message || 'The failed runs could not be read.');
        }
      },
      error: err => {
        this.loading.set(false);
        this.error.set(refusal(err, 'The failed runs could not be read.'));
      },
    });
  }

  applyRange(range: DateRange): void {
    this.range.set(range);
    this.reset();
  }

  toggle(name: FacetName, key: string): void {
    this.filter.update(f => {
      const on = f[name].includes(key);
      return { ...f, [name]: on ? f[name].filter(v => v !== key) : [...f[name], key] };
    });
    this.reset();
  }

  clear(name: FacetName): void {
    this.filter.update(f => ({ ...f, [name]: [] }));
    this.reset();
  }

  clearAll(): void {
    this.filter.set({ tenantIds: [], taskDetailIds: [], jobIds: [], tasks: [], kinds: [], days: [] });
    this.signature.set(null);
    this.reset();
  }

  pickGroup(group: ErrorGroup): void {
    this.signature.set(this.signature() === group.signature ? null : group.signature);
    this.reset();
  }

  goTo(page: number): void {
    if (page < 0 || page >= this.pages()) return;
    this.page.set(page);
    this.selection.clear();
    this.load();
  }

  private reset(): void {
    this.page.set(0);
    this.selection.clear();
    this.load();
  }

  shown(section: RailSection): FacetValue[] {
    if (this.expanded().has(section.name)) return section.values;
    const picked = new Set(section.picked);
    return section.values.filter((v, i) => i < SHOWN || picked.has(v.key));
  }

  more(section: RailSection): number {
    return this.expanded().has(section.name) ? 0 : Math.max(0, section.values.length - SHOWN);
  }

  expand(name: FacetName): void {
    this.expanded.update(s => new Set([...s, name]));
  }

  open(run: FailedRun): void {
    const data: FailedRunPanelData = { run, canRetry: this.canRetry() && run.retryable, canRestart: this.auth.role() === 'TENANT_ADMIN' };
    const ref = this.dialog.open<boolean, FailedRunPanelData, FailedRunPanel>(FailedRunPanel, sidePanelConfig(data, 'wide', 'right'));
    ref.closed.subscribe(retried => { if (retried) this.load(); });
  }

  toggleRow(run: FailedRun, event: Event): void {
    event.stopPropagation();
    this.selection.toggle(run);
  }

  togglePage(on: boolean): void {
    this.selection.setPage(this.retryableOnPage(), on);
  }

  retried(): void {
    this.load();
  }

  stepOf(run: FailedRun): string {
    if (run.stepIndex == null) return run.status === 'Interrupt' ? 'The run (stopped responding)' : 'The run';
    return `Step ${run.stepIndex + 1}${run.stepKey ? ' <' + run.stepKey + '>' : ''}`;
  }
}
