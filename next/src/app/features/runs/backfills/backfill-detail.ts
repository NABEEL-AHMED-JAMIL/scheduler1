import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { SidePanel } from '../../../shared/ui/side-panel';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { SegmentOption, Segmented } from '../../../shared/ui/segmented';
import { ToastService } from '../../../shared/ui/toast.service';
import { valuesText } from '../../jobs/run-parameters/run-parameters';
import {
  Backfill, BackfillPeriod, BackfillsApi, STEP_WORDS, durationText, isOpen, lookOf, money, periodLabel, progressParts, refusalOf, statusWord,
} from './backfills.api';

export interface BackfillDetailData {
  backfillId: number;
  /** The reader may pause, resume, cancel and retry (Schedules). */
  canAct: boolean;
}

type PeriodFilter = '' | 'FAILED' | 'QUEUED' | 'PENDING' | 'COMPLETED' | 'SKIPPED';

/**
 * MIG-347: one backfill over the right of Runs › Backfills -- its progress, why it waits (a paused workspace, a schedule
 * switched off), its parameters, the estimate against what its runs were billed so far (administrators), and every period
 * with its run (a link to the run's page), state, tries and note; Pause, Resume, Cancel and Retry failed. Closes with true
 * when it changed.
 */
@Component({
  selector: 'app-backfill-detail',
  imports: [SidePanel, Icon, RouterLink, ServerTimePipe, Segmented],
  styles: `
    .bf-bar { display: flex; height: 0.5rem; border-radius: 999px; overflow: hidden; background: var(--surface-sunken); }
    .bf-bar > span { display: block; height: 100%; }
    .bf-done { background: var(--color-ok-500); }
    .bf-failed { background: var(--color-crit-500); }
    .bf-running { background: var(--color-brand-500); }
    .bf-periods { width: 100%; border-collapse: collapse; font-size: 13px; }
    .bf-periods th { text-align: left; font-size: 11px; font-weight: 600; color: var(--text-muted); padding: 0.375rem 0.5rem;
      border-bottom: 1px solid var(--border-subtle); }
    .bf-periods td { padding: 0.375rem 0.5rem; border-bottom: 1px solid var(--border-subtle); vertical-align: top; }
    .bf-note { color: var(--text-muted); font-size: 12px; max-width: 22rem; overflow-wrap: anywhere; }
  `,
  template: `
    <app-side-panel [heading]="'Backfill #' + data.backfillId" [subtitle]="subtitle()" data-test="backfill-detail">
      @if (error()) {
        <p class="text-sm text-crit-500 m-0" role="alert">{{ error() }}</p>
      } @else if (backfill(); as b) {
        <div class="flex flex-col gap-4">
          <div class="flex items-center gap-2 flex-wrap">
            @if (lookOf(b.status); as l) {
              <span class="pill pill-{{ l.tone }}" data-test="backfill-status"><app-icon [name]="l.icon" size="0.85em" />{{ l.word }}</span>
            }
            <span class="text-sm text-[color:var(--text-secondary)]">{{ b.done }} of {{ b.total }} done
              @if (b.counts.failed) { · <span class="text-crit-500">{{ b.counts.failed }} failed</span> }
              @if (b.counts.queued) { · {{ b.counts.queued }} running }
              @if (b.counts.skipped) { · {{ b.counts.skipped }} skipped }</span>
            @if (b.eta) { <span class="text-xs text-[color:var(--text-muted)] ml-auto">Ends in {{ durationText(b.eta.seconds) }}</span> }
          </div>
          <div class="bf-bar" role="img" [attr.aria-label]="b.done + ' of ' + b.total + ' done'">
            <span class="bf-done" [style.width.%]="parts().completed"></span>
            <span class="bf-failed" [style.width.%]="parts().failed"></span>
            <span class="bf-running" [style.width.%]="parts().running"></span>
          </div>
          @if (b.holdReason) {
            <p class="text-sm m-0 flex items-start gap-1.5" data-test="backfill-hold"><app-icon name="clock" class="mt-0.5 shrink-0 icon-warn" />{{ b.holdReason }}</p>
          }

          <dl class="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm m-0">
            <dt class="text-[color:var(--text-muted)]">Schedule</dt>
            <dd class="m-0"><a class="link-inline" [routerLink]="['/pipelines/schedules', b.jobId, 'executions']" (click)="ref.close(changed)">{{ b.jobName || ('#' + b.jobId) }}</a></dd>
            <dt class="text-[color:var(--text-muted)]">Range</dt>
            <dd class="m-0">{{ b.from }} to {{ b.to }}, one run per {{ stepUnit() }} ({{ b.zone }})</dd>
            <dt class="text-[color:var(--text-muted)]">At once</dt>
            <dd class="m-0">{{ b.concurrency }}</dd>
            <dt class="text-[color:var(--text-muted)]">Completed days</dt>
            <dd class="m-0">{{ b.rerunCompleted ? 'Run again' : 'Skipped' }}</dd>
            <dt class="text-[color:var(--text-muted)]">Parameters</dt>
            <dd class="m-0 mono text-xs" data-test="backfill-parameters">{{ valuesText(b.parameters) || 'The pipeline\\'s defaults' }}</dd>
            <dt class="text-[color:var(--text-muted)]">Started</dt>
            <dd class="m-0">{{ b.dateCreated | serverTime:'recent' }}@if (b.createdVia === 'api') { <span> through the API</span> }</dd>
            @if (b.endedAt) {
              <dt class="text-[color:var(--text-muted)]">Ended</dt>
              <dd class="m-0">{{ b.endedAt | serverTime:'recent' }}</dd>
            }
            @if (b.estimate; as e) {
              <dt class="text-[color:var(--text-muted)]">Estimate</dt>
              <dd class="m-0" data-test="backfill-estimate">@if (e.perRun !== null && e.perRun !== undefined) {
                ≈ {{ money(e.total, e.currency) }} <span class="text-xs text-[color:var(--text-muted)]">({{ money(e.perRun, e.currency) }} a run)</span>
              } @else { <span class="text-[color:var(--text-muted)]">{{ e.unavailable || 'None' }}</span> }</dd>
            }
            @if (b.billed; as billed) {
              <dt class="text-[color:var(--text-muted)]">Billed so far</dt>
              <dd class="m-0" data-test="backfill-billed">@if (billed.unavailable) { <span class="text-[color:var(--text-muted)]">{{ billed.unavailable }}</span> }
                @else { {{ money(billed.total ?? 0, billed.currency || b.estimate?.currency) }}
                  <span class="text-xs text-[color:var(--text-muted)]">({{ billed.billedRuns ?? 0 }} of {{ billed.runs }} runs priced; usage is rolled up every few minutes)</span> }</dd>
            }
          </dl>

          @if (data.canAct) {
            <div class="flex flex-wrap gap-2">
              @if (b.status === 'RUNNING') {
                <button type="button" class="btn btn-default btn-sm" [disabled]="busy()" (click)="act('pause')" data-test="backfill-pause"><app-icon name="pause" />Pause</button>
              }
              @if (b.status === 'PAUSED') {
                <button type="button" class="btn btn-default btn-sm" [disabled]="busy()" (click)="act('resume')" data-test="backfill-resume"><app-icon name="play" />Resume</button>
              }
              @if (b.counts.failed && (b.status === 'RUNNING' || b.status === 'PAUSED' || b.status === 'FAILED')) {
                <button type="button" class="btn btn-default btn-sm" [disabled]="busy()" (click)="act('retryFailed')" data-test="backfill-retry">
                  <app-icon name="refresh" />Retry {{ b.counts.failed }} failed</button>
              }
              @if (open()) {
                <button type="button" class="btn btn-ghost btn-sm text-crit-500" [disabled]="busy()" (click)="act('cancel')" data-test="backfill-cancel">
                  <app-icon name="stop" />Cancel</button>
              }
            </div>
          }

          <section>
            <div class="flex items-center gap-2 flex-wrap mb-2">
              <h3 class="text-sm font-semibold m-0">Periods</h3>
              <app-segmented class="ml-auto" [options]="filters" [value]="filter()" (valueChange)="pick($event)" ariaLabel="Show periods" />
            </div>
            <table class="bf-periods" data-test="backfill-periods">
              <thead><tr><th>{{ stepUnit() === 'hour' ? 'Hour' : 'Date' }}</th><th>State</th><th>Run</th><th>Tries</th><th>Note</th></tr></thead>
              <tbody>
                @for (p of b.periods || []; track p.start) {
                  <tr>
                    <td class="whitespace-nowrap tabular-nums">{{ periodLabel(p) }}</td>
                    <td>@if (lookOf(p.state); as l) { <span class="status-quiet"><span class="status-dot dot-{{ l.tone }}"></span>{{ l.word }}</span> }</td>
                    <td>@if (p.jobQueueId) {
                      <a class="link-inline mono text-xs" [routerLink]="['/pipelines/schedules', b.jobId, 'runs', p.jobQueueId]" (click)="ref.close(changed)">#{{ p.jobQueueId }}</a>
                    } @else { <span class="text-[color:var(--text-muted)]">—</span> }</td>
                    <td class="tabular-nums">{{ p.tries || '' }}</td>
                    <td class="bf-note">{{ p.note || '' }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="5" class="text-[color:var(--text-muted)]">No period is {{ filterWord() }}.</td></tr>
                }
              </tbody>
            </table>
            @if ((b.periods?.length ?? 0) === 100) {
              <div class="flex gap-2 mt-2">
                @if (page() > 1) { <button type="button" class="btn btn-ghost btn-sm" (click)="go(page() - 1)">Earlier</button> }
                <button type="button" class="btn btn-ghost btn-sm" (click)="go(page() + 1)">Later</button>
              </div>
            }
          </section>
        </div>
      } @else {
        <p class="text-sm text-[color:var(--text-muted)] m-0">Reading the backfill…</p>
      }
      <div foot class="flex items-center gap-2 w-full">
        <a class="btn btn-ghost btn-sm" [routerLink]="['/pipelines/schedules', backfill()?.jobId ?? 0, 'executions']" (click)="ref.close(changed)"
           [class.invisible]="!backfill()" data-test="backfill-runs-link"><app-icon name="history" />The schedule's runs</a>
        <button type="button" class="btn btn-default btn-sm ml-auto" (click)="ref.close(changed)">Close</button>
      </div>
    </app-side-panel>
  `,
})
export class BackfillDetail implements OnInit {
  readonly ref = inject<DialogRef<boolean, BackfillDetail>>(DialogRef);
  readonly data = inject<BackfillDetailData>(DIALOG_DATA);
  private readonly api = inject(BackfillsApi);
  private readonly toast = inject(ToastService);

  readonly backfill = signal<Backfill | null>(null);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly filter = signal<PeriodFilter>('');
  readonly page = signal(1);
  changed = false;

  readonly filters: SegmentOption<PeriodFilter>[] = [
    { id: '', label: 'All' }, { id: 'FAILED', label: 'Failed' }, { id: 'QUEUED', label: 'Running' }, { id: 'PENDING', label: 'Waiting' },
    { id: 'COMPLETED', label: 'Completed' }, { id: 'SKIPPED', label: 'Skipped' },
  ];
  readonly parts = computed(() => {
    const b = this.backfill();
    return b ? progressParts(b) : { completed: 0, failed: 0, running: 0, waiting: 100 };
  });
  readonly open = computed(() => isOpen(this.backfill()?.status));
  readonly stepUnit = computed(() => (STEP_WORDS[this.backfill()?.step ?? 'DAILY'] ?? STEP_WORDS.DAILY).unit);
  readonly subtitle = computed(() => {
    const b = this.backfill();
    return b ? `${b.jobName || 'Schedule #' + b.jobId} · ${b.from} to ${b.to}` : '';
  });
  readonly filterWord = computed(() => this.filters.find(f => f.id === this.filter())?.label.toLowerCase() ?? '');

  protected readonly statusWord = statusWord;
  protected readonly lookOf = lookOf;
  protected readonly money = money;
  protected readonly durationText = durationText;
  protected readonly valuesText = valuesText;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.detail(this.data.backfillId, this.filter() || null, this.page()).subscribe({
      next: r => {
        if (r.status === API_SUCCESS && r.data) {
          this.error.set('');
          this.backfill.set(r.data);
        } else {
          this.error.set(r.message || 'The backfill could not be read.');
        }
      },
      error: err => this.error.set(refusalOf(err, 'The backfill could not be read.')),
    });
  }

  pick(filter: PeriodFilter): void {
    this.filter.set(filter);
    this.page.set(1);
    this.load();
  }

  go(page: number): void {
    this.page.set(Math.max(1, page));
    this.load();
  }

  /** A day as 6 Oct, an hour with its time in the backfill's zone. */
  periodLabel(p: BackfillPeriod): string {
    const b = this.backfill();
    return periodLabel(p.date, p.start, b?.step, b?.zone);
  }

  act(action: 'pause' | 'resume' | 'cancel' | 'retryFailed'): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.api.act(action, this.data.backfillId).subscribe({
      next: r => {
        this.busy.set(false);
        if (r.status === API_SUCCESS) {
          this.changed = true;
          this.toast.success(r.message || 'Done.');
          this.load();
        } else {
          this.toast.error(r.message || 'That could not be done.');
        }
      },
      error: err => {
        this.busy.set(false);
        this.toast.error(refusalOf(err, 'That could not be done.'));
      },
    });
  }
}
