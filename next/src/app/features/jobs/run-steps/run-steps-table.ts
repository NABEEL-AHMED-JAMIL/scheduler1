import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { Icon } from '../../../shared/ui/icon';
import { StatusPill } from '../../../shared/ui/status-pill';
import { SegmentOption, Segmented } from '../../../shared/ui/segmented';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { Avatar } from '../../../shared/ui/avatar';
import { sidePanelConfig } from '../../../shared/ui/side-panel';
import { RetryDialog, RetryDialogData } from '../retry/retry-dialog';
import { RetryFrom, attemptSentence, backfillLink, backfillRetryNote, stepLabel } from '../retry/run-retry';
import { DATASET_FORMATS, PDF_FORMAT, StepApproval, approvalOutcome, failedStep } from './run-steps.model';
import { OutputChip, StepRow, stepRows } from './run-page.model';
import { RunApprovalStore } from './run-approval.store';
import { RunTimelineStore } from './run-timeline.store';
import { RunStepLogData, RunStepLogPanel } from './run-step-log-panel';

/**
 * The run page's Steps tab (UX review 2026-10-12, run page fix): every step in one compact row, in the plan map's
 * spirit -- # · Step (its name, its key and task beneath) · Status · Started · Duration (a bar against the slowest
 * step, which is marked) · Rows in → out · Output (its files, each downloadable) · Log (the step's own lines in the
 * side panel). A failed or warned step is tinted, its error on its own line. It replaces a timeline whose steps were a
 * hundred pixels each and a Timeline / Console / Map toggle inside the tab.
 */
@Component({
  selector: 'app-run-steps-table',
  imports: [Icon, StatusPill, Segmented, ServerTimePipe, CdkMenu, CdkMenuItem, CdkMenuTrigger, Avatar, RouterLink],
  styles: `
    :host { display: block; }
    .rs-table { width: 100%; border-spacing: 0; font-size: 0.8125rem; }
    .rs-table thead th { position: sticky; top: 0; z-index: 1; background: var(--surface-raised); text-align: left; white-space: nowrap;
      font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted);
      padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border-subtle); }
    .rs-table td { padding: 0.1875rem 0.75rem; border-bottom: 1px solid var(--border-subtle); vertical-align: middle;
      font-variant-numeric: tabular-nums; }
    .rs-table tbody tr:last-child td { border-bottom: 0; }
    .rs-table tbody tr:hover { background: var(--surface-sunken); }
    .rs-row { height: 2.625rem; }
    .rs-bar-wrap { display: flex; align-items: center; gap: 0.5rem; }
    .rs-row.is-crit { background: color-mix(in srgb, var(--crit-text) 7%, transparent); }
    .rs-row.is-warn { background: color-mix(in srgb, var(--warn-text) 8%, transparent); }
    .rs-row.is-crit td:first-child { box-shadow: inset 3px 0 0 var(--crit-text); }
    .rs-row.is-warn td:first-child { box-shadow: inset 3px 0 0 var(--warn-text); }
    .rs-no { width: 2.5rem; color: var(--text-muted); text-align: right; }
    .rs-name { font-weight: 500; color: var(--text-primary); line-height: 1.15rem; max-width: 34rem; }
    .rs-dot { display: inline-block; width: 0.5rem; height: 0.5rem; border-radius: 9999px; vertical-align: middle; margin-right: 0.25rem; background: var(--color-warn-500); }
    .rs-sub { font-size: 11px; line-height: 0.875rem; color: var(--text-muted); }
    .rs-problem { font-size: 11px; line-height: 1rem; margin-top: 0.125rem; white-space: normal; overflow-wrap: anywhere; }
    .rs-bar { height: 0.25rem; border-radius: 9999px; background: var(--surface-sunken); overflow: hidden; margin-top: 0.1875rem; width: 4.5rem; }
    .rs-fill { height: 100%; border-radius: 9999px; background: var(--accent-mark); }
    .rs-row.is-slowest .rs-fill { background: var(--color-warn-500); }
    .rs-chip { display: inline-flex; align-items: center; gap: 0.25rem; max-width: 100%; min-width: 0; padding: 0.0625rem 0.375rem;
      border-radius: var(--radius-md); background: var(--surface-sunken); font-size: 11px; color: var(--text-secondary); }
    .rs-step-col { min-width: 16rem; }
    .rs-chip-detail { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .rs-out-col { min-width: 13rem; max-width: 24rem; }
    /* ZT-P14: after the rules it narrows -- placed before them, they won (same specificity) and a 1024 tablet scrolled sideways.
       At a laptop's width (1187) the table fits without a sideways scroll: the step and its files take less room. */
    @media (max-width: 1439px) {
      .rs-table thead th, .rs-table td { padding-left: 0.5rem; padding-right: 0.5rem; }
      .rs-name, .rs-sub { max-width: 18rem; } .rs-out-col { min-width: 0; max-width: 13rem; } .rs-step-col { min-width: 12rem; }
    }
    /* ZT-P14: a 1024 tablet (958 px of card) needs the step column narrower still. */
    @media (max-width: 1279px) {
      .rs-name, .rs-sub { max-width: 14rem; } .rs-step-col { min-width: 10rem; }
    }
  `,
  template: `
    @if (store.timeline(); as t) {
      <section class="card overflow-clip" aria-labelledby="run-steps-heading" data-test="run-steps">
        <div class="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-subtle">
          <h2 id="run-steps-heading" class="text-sm font-semibold mr-auto">
            Steps <span class="font-normal text-[color:var(--text-muted)]">· {{ completed() }} of {{ t.steps.length }} completed</span>
          </h2>
          @if (slowest(); as s) {
            <span class="text-xs text-[color:var(--text-secondary)]" data-test="slowest-note">
              <span class="rs-dot"></span>Slowest: {{ s.name }} · {{ s.duration }}
            </span>
          }
          @if (t.attempts.length > 1) {
            <app-segmented [value]="String(t.attempt)" (valueChange)="chooseAttempt($event)" [options]="attemptOptions()" ariaLabel="Attempt" />
          }
        </div>

        <!-- MIG-345: a run that failed on its latest attempt is retried as its next attempt, from the failed step or the start. -->
        @if (retryStep(); as failed) {
          <div class="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-subtle" data-test="run-retry">
            <app-icon name="alert" class="text-crit-500 shrink-0" />
            @if (backfillId(); as backfill) {
              <!-- UX review 2026-10-13: a backfill's run is retried by its backfill (Core refuses both retries here). -->
              <span class="text-xs text-[color:var(--text-secondary)] mr-auto" data-test="retry-backfill">
                Failed at step {{ failed.index + 1 }} <span class="mono">&lt;{{ failed.key }}&gt;</span>. {{ backfillNote(backfill) }}
              </span>
              <a class="btn btn-default btn-sm" [routerLink]="backfillAt(backfill).link" [queryParams]="backfillAt(backfill).query"
                 data-test="retry-open-backfill"><app-icon name="layers" />Open backfill #{{ backfill }}</a>
            } @else {
              <span class="text-xs text-[color:var(--text-secondary)] mr-auto">
                Failed at step {{ failed.index + 1 }} <span class="mono">&lt;{{ failed.key }}&gt;</span>.
                Fix the cause, then retry: the steps before it are not run again.
              </span>
              <button type="button" class="btn btn-default btn-sm" (click)="retry('start')" data-test="retry-from-start">
                <app-icon name="refresh" />Run again from the start
              </button>
              <button type="button" class="btn btn-primary btn-sm" (click)="retry('failed_step')" data-test="retry-from-step">
                <app-icon name="play" />Retry from {{ retryLabel() }}
              </button>
            }
          </div>
        }
        @if (attemptDetail(); as detail) {
          <p class="flex items-start gap-1.5 px-4 py-2 border-b border-subtle text-xs text-[color:var(--text-secondary)]" data-test="attempt-detail">
            <app-icon name="history" size="0.9em" class="icon-muted mt-px shrink-0" />
            <span>{{ attemptSentence(detail) }}@if (detail.requestedAt) {<span>, {{ detail.requestedAt | serverTime:'recentSec' }}</span>}.</span>
          </p>
        }

        <div class="overflow-x-auto">
          <table class="rs-table" aria-describedby="run-steps-heading">
            <thead>
              <tr>
                <th class="rs-no" scope="col">#</th>
                <th scope="col" class="rs-step-col">Step</th>
                <th scope="col">Status</th>
                <th scope="col">Started</th>
                <th scope="col">Duration</th>
                <th scope="col" class="num">Rows in → out</th>
                <th scope="col" class="rs-out-col">Output</th>
                <th scope="col" class="w-12"><span class="sr-only">Log</span></th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.step.index) {
                <tr class="rs-row exec-step" [class.is-crit]="r.tone === 'crit'" [class.is-warn]="r.tone === 'warn'" [class.is-slowest]="r.slowest"
                    [attr.data-step]="r.step.key" [attr.data-tone]="r.tone">
                  <td class="rs-no tabular">{{ r.no }}</td>
                  <td class="rs-step-col">
                    <div class="rs-name truncate" [title]="r.name">{{ r.name }}</div>
                    <div class="rs-sub truncate">
                      @if (r.named) { <span class="mono">{{ r.step.key }}</span> · }<span class="mono">{{ r.step.task }}</span>
                      @if ((r.step.tries ?? 1) > 1) { · {{ r.step.tries }} tries }
                      @if (r.step.onError && r.step.onError !== 'fail') { · on error: {{ r.step.onError }} }
                    </div>
                    @if (r.problem) {
                      <div class="rs-problem flex items-start gap-1" [class.text-crit-500]="r.tone === 'crit'" [class.text-warn-600]="r.tone === 'warn'" data-test="step-problem">
                        <app-icon [name]="r.tone === 'crit' ? 'xCircle' : 'alert'" size="0.9em" class="mt-0.5 shrink-0" />{{ r.problem }}
                      </div>
                    }
                    @if (r.step.approval; as a) {
                      <div class="rs-problem flex items-center gap-1.5 text-[color:var(--text-secondary)]" data-test="step-approval">
                        @if (!a.waiting && a.decidedByUserId) { <app-avatar [appUserId]="a.decidedByUserId" [name]="a.decidedBy" [size]="1.1" [decorative]="true" /> }
                        @else { <app-icon [name]="a.waiting ? 'inbox' : a.status === 'APPROVED' ? 'checkCircle' : 'xCircle'" size="0.9em" class="shrink-0" /> }
                        <span>{{ outcome(a) }}@if (a.waiting && a.expiresAt) {<span>, until {{ a.expiresAt | serverTime:'recentSec' }}</span>}@if (!a.waiting && a.decidedAt) {<span>, {{ a.decidedAt | serverTime:'recentSec' }}</span>}.</span>
                      </div>
                    }
                  </td>
                  <td class="whitespace-nowrap">
                    @if (r.step.approval?.waiting && r.step.status === 'Running') {
                      <span class="pill pill-warn" data-test="step-waiting-approval"><app-icon name="clock" size="0.85em" />Waiting for approval</span>
                    } @else {
                      <app-status [label]="r.step.status" />
                    }
                    @if (r.step.reusedFromAttempt) {
                      <span class="block rs-sub mt-0.5" data-test="step-reused" [title]="'Not run again: its kept output from attempt ' + r.step.reusedFromAttempt + ' was reused'">
                        Reused from attempt {{ r.step.reusedFromAttempt }}</span>
                    }
                  </td>
                  <td class="whitespace-nowrap text-[color:var(--text-secondary)]">
                    {{ r.step.startedAt ? (r.step.startedAt | serverTime:'timeSec') : r.step.reusedFromAttempt ? 'Not run again' : '—' }}
                  </td>
                  <td class="whitespace-nowrap" [title]="r.slowest ? 'The slowest step of this run' : ''">
                    <span [class.font-semibold]="r.slowest">{{ r.duration }}</span>
                    <div class="rs-bar" aria-hidden="true"><div class="rs-fill" [style.width.%]="r.share * 100"></div></div>
                  </td>
                  <td class="num whitespace-nowrap" [title]="r.rowsHint">{{ r.rows }}</td>
                  <td class="rs-out-col">
                    <div class="flex flex-wrap gap-1">
                      @for (o of r.outputs; track $index) {
                        <span class="flex items-center gap-0.5 min-w-0 max-w-full" data-test="step-output">
                          <span class="rs-chip" [title]="o.name + (o.detail ? ' · ' + o.detail : '')">
                            <app-icon [name]="o.kind === 'bucket' ? 'upload' : o.pdf ? 'file' : 'table'" size="0.85em" class="shrink-0" />
                            <span class="truncate">{{ o.name }}</span>
                            @if (o.detail) { <span class="rs-chip-detail text-[color:var(--text-muted)] whitespace-nowrap">· {{ o.detail }}</span> }
                          </span>
                          @if (o.kind === 'bucket') {
                            <button type="button" class="btn btn-ghost btn-xs shrink-0" [disabled]="store.busy() !== ''"
                                    [attr.aria-label]="'Download ' + o.name + ' from step ' + r.step.key" title="Download from storage"
                                    (click)="o.output && store.downloadUpload(o.output)"><app-icon name="download" /></button>
                          } @else if (o.pdf) {
                            <button type="button" class="btn btn-ghost btn-xs shrink-0" [disabled]="store.busy() !== '' || !!o.output?.expired"
                                    [attr.aria-label]="'Download ' + o.name + ' from step ' + r.step.key" title="Download the PDF"
                                    (click)="store.downloadDataset(o.runDatasetId!, 'pdf', o.name)"><app-icon name="download" /></button>
                          } @else {
                            <button type="button" class="btn btn-ghost btn-xs shrink-0" [cdkMenuTriggerFor]="formatMenu" [disabled]="store.busy() !== '' || !!o.output?.expired"
                                    [attr.aria-label]="'Download ' + o.name + ' from step ' + r.step.key" title="Download as CSV, JSON or JSONL">
                              <app-icon name="download" /></button>
                            <ng-template #formatMenu>
                              <div cdkMenu class="card shadow-xl py-1 min-w-36 text-sm">
                                @for (f of formats; track f.id) {
                                  <button cdkMenuItem class="menu-item" [attr.data-format]="f.id"
                                          (cdkMenuItemTriggered)="store.downloadDataset(o.runDatasetId!, f.id, o.name)"><app-icon name="download" />{{ f.label }}</button>
                                }
                              </div>
                            </ng-template>
                          }
                        </span>
                      } @empty { <span class="text-[color:var(--text-muted)]">—</span> }
                    </div>
                  </td>
                  <td class="text-right">
                    @if (r.canLog) {
                      <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="'Show the log of step ' + r.step.key"
                              title="This step's own lines" data-test="step-log" (click)="openLog(r)"><app-icon name="terminal" /></button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    } @else if (store.readError()) {
      <p class="card p-4 text-sm text-[color:var(--text-muted)]">The run's steps could not be read. Refresh to try again.</p>
    } @else if (store.legacy()) {
      <p class="card p-4 text-sm text-[color:var(--text-muted)]" data-test="legacy-steps">This run was not taken by the step engine, so it has no steps to list. Its entries are on the Log tab.</p>
    } @else {
      <p class="card p-4 text-sm text-[color:var(--text-muted)]">Reading the run's steps…</p>
    }
  `,
})
export class RunStepsTable {
  readonly store = inject(RunTimelineStore);
  /** The run page's approvals, for the groups' names; absent where the table stands alone. */
  private readonly approvals = inject(RunApprovalStore, { optional: true });
  private readonly dialog = inject(Dialog);
  /** The step whose lines the reader wants in the Log tab ("Open in Log" in the panel). */
  readonly showInLog = output<string>();
  /** MIG-345: the run was queued again (a retry); the page re-reads the run. */
  readonly retried = output<void>();
  /** UX review 2026-10-13: the backfill this run is part of; its retries are the backfill's (Runs › Backfills, Retry failed). */
  readonly backfillId = input<number | null>(null);
  readonly backfillNote = backfillRetryNote;
  readonly backfillAt = backfillLink;

  readonly String = String;
  readonly formats = DATASET_FORMATS;
  readonly pdfFormat = PDF_FORMAT;
  readonly attemptSentence = attemptSentence;

  readonly rows = computed<StepRow[]>(() => stepRows(this.store.timeline(), this.store.outputList()));
  readonly completed = computed(() => (this.store.timeline()?.steps ?? []).filter(s => s.status === 'Completed').length);
  readonly slowest = computed(() => this.rows().find(r => r.slowest) ?? null);
  readonly attemptOptions = computed<SegmentOption<string>[]>(() =>
    (this.store.timeline()?.attempts ?? []).map(n => ({ id: String(n), label: `Attempt ${n}` })));
  readonly retryStep = computed(() => failedStep(this.store.timeline()));
  readonly retryLabel = computed(() => {
    const step = this.retryStep();
    return step ? stepLabel(step.index, step.key, step.name) : '';
  });
  readonly attemptDetail = computed(() => {
    const t = this.store.timeline();
    return t?.attemptDetails?.find(detail => detail.attempt === t.attempt) ?? null;
  });

  outcome(approval: StepApproval): string { return approvalOutcome(approval, this.approvals?.groupNames()); }

  chooseAttempt(value: string): void {
    const attempt = Number(value);
    if (!Number.isInteger(attempt) || attempt === this.store.timeline()?.attempt) return;
    this.store.chooseAttempt(attempt);
  }

  /** The step's own lines in the side panel over the right; "Open in Log" there shows them in the Log tab. */
  openLog(row: StepRow): void {
    const data: RunStepLogData = { store: this.store, step: row.step, name: row.name };
    this.dialog.open<'log' | undefined>(RunStepLogPanel, sidePanelConfig(data, 'wide', 'right')).closed.subscribe(choice => {
      if (choice === 'log') this.showInLog.emit(row.step.key);
    });
  }

  /** MIG-345: "Retry from <step>" or "Run again from the start": the dialog reads what Core would do and asks. */
  retry(from: RetryFrom): void {
    const t = this.store.timeline();
    if (!t) return;
    const data: RetryDialogData = { jobQueueId: t.jobQueueId, from };
    this.dialog.open<boolean>(RetryDialog, { data }).closed.subscribe(queued => {
      if (!queued) return;
      this.store.chooseAttempt(null);
      this.retried.emit();
    });
  }

  chipTitle(o: OutputChip): string { return o.detail ? `${o.name} · ${o.detail}` : o.name; }
}
