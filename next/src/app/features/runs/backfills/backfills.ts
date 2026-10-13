import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { Subscription } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { Icon } from '../../../shared/ui/icon';
import { PageHeader } from '../../../shared/ui/page-header';
import { RefreshButton } from '../../../shared/ui/refresh-button';
import { EmptyState } from '../../../shared/ui/empty-state';
import { LoadError } from '../../../shared/ui/load-error';
import { SegmentOption, Segmented } from '../../../shared/ui/segmented';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { sidePanelConfig } from '../../../shared/ui/side-panel';
import { ToastService } from '../../../shared/ui/toast.service';
import { valuesText } from '../../jobs/run-parameters/run-parameters';
import {
  Backfill, BackfillStatus, BackfillsApi, STEP_WORDS, doneOf, durationText, isOpen, lookOf, periodsText, progressParts, refusalOf, statusWord,
} from './backfills.api';
import { BackfillDetail, BackfillDetailData } from './backfill-detail';

type Show = 'open' | 'all' | 'FAILED' | 'COMPLETED' | 'CANCELLED';

/** While a backfill is open the list is read again this often (and only while the tab is visible). */
const REFRESH_MS = 10_000;
const LIMIT = 25;

/**
 * MIG-347: Runs › Backfills -- the workspace's backfills, newest first: each one's schedule, range and step, a progress bar
 * (done, failed, running), what it waits for, when it should end, and Pause, Resume, Cancel and Retry failed. A row opens
 * its periods and their runs on the right. Read again every ten seconds while one is open. Schedules' page key: backfills
 * are a schedule's runs, started and steered by whoever runs the schedule.
 */
@Component({
  selector: 'app-backfills',
  imports: [PageHeader, RefreshButton, EmptyState, LoadError, Segmented, ServerTimePipe, Icon, RouterLink],
  styles: `
    .bf-list { display: flex; flex-direction: column; }
    .bf-row { display: grid; grid-template-columns: minmax(0, 2.2fr) minmax(0, 2fr) minmax(9rem, 0.9fr) auto; gap: 1rem; align-items: center;
      padding: 0.875rem 1rem; border-top: 1px solid var(--border-subtle); cursor: pointer; }
    .bf-row:first-child { border-top: 0; }
    .bf-row:hover { background: var(--surface-inset); }
    .bf-row:focus-visible { outline: 2px solid var(--focus-ring, var(--accent-text)); outline-offset: -2px; }
    @media (max-width: 1100px) { .bf-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
    .bf-bar { display: flex; height: 0.5rem; border-radius: 999px; overflow: hidden; background: var(--surface-sunken); }
    .bf-bar > span { display: block; height: 100%; }
    .bf-done { background: var(--color-ok-500); }
    .bf-failed { background: var(--color-crit-500); }
    .bf-running { background: var(--color-brand-500); }
    .bf-meta { font-size: 12px; color: var(--text-muted); }
    .bf-actions { display: flex; gap: 0.25rem; justify-content: flex-end; }
  `,
  template: `
    <div class="page" data-test="backfills">
      <app-page-header title="Backfills">
        <p subtitle class="page-subtitle">A schedule run once for each day of a past range, a few at a time. Start one from a schedule's
          <span class="whitespace-nowrap">⋮ › Backfill…</span></p>
        <div class="flex items-center gap-2">
          <app-segmented [options]="shows" [value]="show()" (valueChange)="pick($event)" ariaLabel="Show backfills" data-test="backfills-show" />
          <app-refresh-button [loading]="loading()" [live]="anyOpen()" (refresh)="load()" />
        </div>
      </app-page-header>

      @if (error()) {
        <app-load-error [message]="error()" (retry)="load()" />
      } @else if (!rows().length && !loading()) {
        <div class="card p-10">
          <app-empty-state icon="history" [title]="show() === 'open' ? 'No backfill is running' : 'No backfills'"
                           message="Pipelines › Schedules: a schedule's ⋮ menu › Backfill… runs it for each day of a past range.">
            <a class="btn btn-default btn-sm" routerLink="/pipelines/schedules"><app-icon name="calendar" />Schedules</a>
          </app-empty-state>
        </div>
      } @else {
        <div class="card bf-list" data-test="backfills-list">
          @for (b of rows(); track b.backfillId) {
            <div class="bf-row" role="button" tabindex="0" (click)="open(b)" (keydown.enter)="open(b)" [attr.data-backfill]="b.backfillId">
              <div class="min-w-0">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="mono text-xs text-[color:var(--text-muted)]">#{{ b.backfillId }}</span>
                  <span class="font-medium truncate">{{ b.jobName || ('Schedule #' + b.jobId) }}</span>
                </div>
                <div class="bf-meta truncate">{{ b.from }} to {{ b.to }} · {{ periodsText(b.total, b.step) }} · {{ b.concurrency }} at once
                  @if (paramText(b)) { · <span class="mono">{{ paramText(b) }}</span> }</div>
              </div>
              <div class="min-w-0">
                <div class="bf-bar" role="img" [attr.aria-label]="doneOf(b) + ' of ' + b.total + ' done'">
                  <span class="bf-done" [style.width.%]="parts(b).completed"></span>
                  <span class="bf-failed" [style.width.%]="parts(b).failed"></span>
                  <span class="bf-running" [style.width.%]="parts(b).running"></span>
                </div>
                <div class="bf-meta mt-1" data-test="backfill-progress">
                  <span class="text-[color:var(--text-secondary)] font-medium">{{ doneOf(b) }} of {{ b.total }}</span>
                  @if (b.counts.failed) { · <span class="text-crit-500">{{ b.counts.failed }} failed</span> }
                  @if (b.counts.queued) { · {{ b.counts.queued }} running }
                  @if (b.counts.skipped) { · {{ b.counts.skipped }} skipped }
                  @if (b.counts.cancelled) { · {{ b.counts.cancelled }} cancelled }
                  @if (b.holdReason) { · <span [title]="b.holdReason">waiting</span> }
                </div>
              </div>
              <div class="min-w-0">
                @if (lookOf(b.status); as l) {
                  <span class="pill pill-{{ l.tone }}" data-test="backfill-status"><app-icon [name]="l.icon" size="0.85em" />{{ l.word }}</span>
                }
                <div class="bf-meta mt-1">
                  @if (b.eta) { ends in {{ durationText(b.eta.seconds) }} }
                  @else if (b.endedAt) { {{ b.endedAt | serverTime:'recent' }} }
                  @else { started {{ b.dateCreated | serverTime:'recent' }} }
                </div>
              </div>
              <div class="bf-actions" (click)="$event.stopPropagation()" (keydown.enter)="$event.stopPropagation()">
                @if (canAct()) {
                  @if (b.status === 'RUNNING') {
                    <button type="button" class="btn btn-ghost btn-icon btn-sm" [disabled]="busy() === b.backfillId" (click)="act(b, 'pause')"
                            [attr.aria-label]="'Pause backfill #' + b.backfillId" title="Pause"><app-icon name="pause" /></button>
                  }
                  @if (b.status === 'PAUSED') {
                    <button type="button" class="btn btn-ghost btn-icon btn-sm" [disabled]="busy() === b.backfillId" (click)="act(b, 'resume')"
                            [attr.aria-label]="'Resume backfill #' + b.backfillId" title="Resume"><app-icon name="play" /></button>
                  }
                  @if (b.counts.failed && b.status !== 'CANCELLED' && b.status !== 'COMPLETED') {
                    <button type="button" class="btn btn-ghost btn-icon btn-sm" [disabled]="busy() === b.backfillId" (click)="act(b, 'retryFailed')"
                            [attr.aria-label]="'Retry the failed periods of backfill #' + b.backfillId" title="Retry failed"><app-icon name="refresh" /></button>
                  }
                  @if (isOpen(b.status)) {
                    <button type="button" class="btn btn-ghost btn-icon btn-sm" [disabled]="busy() === b.backfillId" (click)="act(b, 'cancel')"
                            [attr.aria-label]="'Cancel backfill #' + b.backfillId" title="Cancel"><app-icon name="stop" /></button>
                  }
                }
                <a class="btn btn-ghost btn-icon btn-sm" [routerLink]="['/pipelines/schedules', b.jobId, 'executions']"
                   [attr.aria-label]="'The runs of ' + (b.jobName || 'the schedule')" title="The schedule's runs"><app-icon name="history" /></a>
              </div>
            </div>
          }
        </div>
        @if (total() > rows().length || page() > 1) {
          <div class="flex items-center gap-2 text-sm">
            <button type="button" class="btn btn-ghost btn-sm" [disabled]="page() === 1" (click)="go(page() - 1)">Newer</button>
            <span class="text-[color:var(--text-muted)]">Page {{ page() }} of {{ pages() }}</span>
            <button type="button" class="btn btn-ghost btn-sm" [disabled]="page() >= pages()" (click)="go(page() + 1)">Older</button>
          </div>
        }
      }
    </div>
  `,
})
export class Backfills implements OnInit {
  private readonly api = inject(BackfillsApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(Dialog);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private request?: Subscription;
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly shows: SegmentOption<Show>[] = [
    { id: 'open', label: 'Open' }, { id: 'all', label: 'All' }, { id: 'FAILED', label: 'Failed' },
    { id: 'COMPLETED', label: 'Completed' }, { id: 'CANCELLED', label: 'Cancelled' },
  ];
  readonly show = signal<Show>('all');
  readonly rows = signal<Backfill[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly busy = signal<number | null>(null);

  /** Pausing, resuming, cancelling and retrying are running the schedule: whoever holds Schedules. */
  readonly canAct = computed(() => this.auth.canOpen('jobs'));
  readonly anyOpen = computed(() => this.rows().some(b => isOpen(b.status)));
  readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / LIMIT)));

  protected readonly statusWord = statusWord;
  protected readonly lookOf = lookOf;
  protected readonly doneOf = doneOf;
  protected readonly durationText = durationText;
  protected readonly periodsText = periodsText;
  protected readonly isOpen = isOpen;

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => {
      this.request?.unsubscribe();
      if (this.timer) clearInterval(this.timer);
    });
    this.load();
    this.timer = setInterval(() => {
      if (this.anyOpen() && !this.loading() && (typeof document === 'undefined' || document.visibilityState === 'visible')) this.load(true);
    }, REFRESH_MS);
    const asked = Number(this.route.snapshot.queryParamMap.get('backfill'));
    if (Number.isInteger(asked) && asked > 0) this.openId(asked);
  }

  statuses(): BackfillStatus[] {
    switch (this.show()) {
      case 'open': return ['RUNNING', 'PAUSED'];
      case 'all': return [];
      default: return [this.show() as BackfillStatus];
    }
  }

  load(quiet = false): void {
    this.request?.unsubscribe();
    if (!quiet) this.loading.set(true);
    this.request = this.api.list({ status: this.statuses(), page: this.page(), limit: LIMIT }).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status === API_SUCCESS && r.data) {
          this.error.set('');
          this.rows.set(r.data.rows ?? []);
          this.total.set(r.data.total ?? 0);
        } else {
          this.error.set(r.message || 'The backfills could not be read.');
        }
      },
      error: err => {
        this.loading.set(false);
        this.error.set(refusalOf(err, 'The backfills could not be read.'));
      },
    });
  }

  pick(show: Show): void {
    this.show.set(show);
    this.page.set(1);
    this.load();
  }

  go(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.pages()));
    this.load();
  }

  parts(b: Backfill) {
    return progressParts(b);
  }

  paramText(b: Backfill): string {
    return valuesText(b.parameters);
  }

  stepLabel(b: Backfill): string {
    return (STEP_WORDS[b.step] ?? STEP_WORDS.DAILY).label;
  }

  open(b: Backfill): void {
    this.openId(b.backfillId);
  }

  private openId(backfillId: number): void {
    const data: BackfillDetailData = { backfillId, canAct: this.canAct() };
    this.router.navigate([], { relativeTo: this.route, queryParams: { backfill: backfillId }, queryParamsHandling: 'merge', replaceUrl: true });
    this.dialog.open<boolean, BackfillDetailData, BackfillDetail>(BackfillDetail, sidePanelConfig(data, 'wide', 'right')).closed
      .subscribe(changed => {
        this.router.navigate([], { relativeTo: this.route, queryParams: { backfill: null }, queryParamsHandling: 'merge', replaceUrl: true });
        if (changed) this.load(true);
      });
  }

  act(b: Backfill, action: 'pause' | 'resume' | 'cancel' | 'retryFailed'): void {
    if (this.busy() !== null) return;
    this.busy.set(b.backfillId);
    this.api.act(action, b.backfillId).subscribe({
      next: r => {
        this.busy.set(null);
        if (r.status === API_SUCCESS) {
          this.toast.success(r.message || 'Done.');
          this.load(true);
        } else {
          this.toast.error(r.message || 'That could not be done.');
        }
      },
      error: err => {
        this.busy.set(null);
        this.toast.error(refusalOf(err, 'That could not be done.'));
      },
    });
  }
}
