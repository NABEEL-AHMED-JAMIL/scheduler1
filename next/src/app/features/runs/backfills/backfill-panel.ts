import { Component, DestroyRef, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Subject, debounceTime, switchMap, catchError, of } from 'rxjs';
import { API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { SidePanel } from '../../../shared/ui/side-panel';
import { Section } from '../../../shared/ui/section';
import { SegmentOption, Segmented } from '../../../shared/ui/segmented';
import { DateRange, DateRangePicker, rangeText } from '../../../shared/ui/date-range';
import { localIsoDay } from '../../../shared/ui/local-day';
import { RunParameterFields } from '../../jobs/run-parameters/run-parameter-fields';
import { ParameterValues, RunParameter, initialValues, valueProblems, valuesBody } from '../../jobs/run-parameters/run-parameters';
import {
  Backfill, BackfillPreview, BackfillRequest, BackfillStep, BackfillsApi, STEP_WORDS, money, periodLabel, periodsText, refusalOf,
} from './backfills.api';

export interface BackfillPanelData {
  jobId: number;
  jobName: string;
  /** The reader is a workspace administrator: the cost estimate is theirs to read. */
  readsCosts: boolean;
}

/** The dates shown before "and N more". */
const SHOWN_DATES = 120;

/**
 * MIG-347: "Backfill…" -- a schedule run once for each day (hour, week) of a past range, a few at a time. The range (the
 * shared date-range control), the step, how many run at once, whether days that already have a completed run are run again,
 * the pipeline's parameters; below them the server's preview -- every period in the workspace's billing zone, the ones
 * already done, what start would refuse -- and the cost estimate; then Start. Closes with the started backfill.
 */
@Component({
  selector: 'app-backfill-panel',
  imports: [SidePanel, Icon, Section, Segmented, DateRangePicker, RunParameterFields],
  styles: `
    .bf-dates { display: flex; flex-wrap: wrap; gap: 0.25rem; max-height: 9.5rem; overflow-y: auto; padding: 0.125rem 0; }
    .bf-date { font-size: 12px; line-height: 1.375rem; padding: 0 0.45rem; border-radius: 999px; border: 1px solid var(--border-subtle);
      color: var(--text-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .bf-date.is-done { color: var(--text-muted); text-decoration: line-through; background: var(--surface-inset); }
    .bf-figure { font-size: 1.25rem; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1.2; }
    .bf-cost { border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 0.75rem; background: var(--surface-inset); }
  `,
  template: `
    <app-side-panel [heading]="'Backfill ' + data.jobName" subtitle="Run this schedule once for each period of a past range, a few at a time."
                    data-test="backfill-panel">
      <div class="form-lock flex flex-col gap-1">
        <app-section title="Range" sub="Days are counted in the workspace's billing time zone." [level]="3">
          <div class="flex flex-col gap-3">
            <div>
              <span class="label">Dates</span>
              <app-date-range [value]="range()" [presets]="['7d', '30d']" [maxDay]="today" [maxSpanDays]="366"
                              label="Dates to backfill" (rangeChange)="range.set($event)" data-test="backfill-range" />
            </div>
            <div>
              <span class="label">One run per</span>
              <app-segmented [options]="steps" [(value)]="step" ariaLabel="One run per" data-test="backfill-step" />
            </div>
          </div>
        </app-section>

        <app-section title="How it runs" [level]="3">
          <div class="flex flex-col gap-3">
            <div>
              <span class="label">At once</span>
              <app-segmented [options]="concurrencyOptions()" [(value)]="concurrency" ariaLabel="Runs at once" data-test="backfill-concurrency" />
              <p class="field-note text-[color:var(--text-muted)]">How many of its runs are in flight together. Each run has its own memory
                budget, and the schedule's own runs keep going beside them.</p>
            </div>
            <label class="flex items-start gap-2 text-sm">
              <input type="checkbox" class="checkbox mt-0.5" [checked]="rerun()" (change)="rerun.set($any($event.target).checked)"
                     data-test="backfill-rerun" />
              <span>Run again the periods that already have a completed run<br />
                <span class="text-xs text-[color:var(--text-muted)]">Off: they are skipped.</span></span>
            </label>
          </div>
        </app-section>

        @if (parameters().length) {
          <app-section title="Parameters" [sub]="parametersHint" [level]="3">
            <app-run-parameter-fields [parameters]="parameters()" [(values)]="values" idPrefix="backfill-param" />
          </app-section>
        }

        <app-section title="Preview" [level]="3">
          @if (problem()) {
            <p class="text-sm text-crit-500 m-0 flex items-start gap-1.5" role="alert" data-test="backfill-problem">
              <app-icon name="alert" class="mt-0.5 shrink-0" />{{ problem() }}</p>
          } @else if (preview(); as p) {
            <div class="flex flex-col gap-3" data-test="backfill-preview" [class.opacity-60]="loading()">
              <div class="grid grid-cols-3 gap-3">
                <div><div class="bf-figure" data-test="backfill-will-run">{{ p.willRun }}</div>
                  <div class="text-xs text-[color:var(--text-muted)]">will run</div></div>
                <div><div class="bf-figure">{{ p.alreadyCompleted }}</div>
                  <div class="text-xs text-[color:var(--text-muted)]">{{ p.rerunCompleted ? 'run again' : 'already done, skipped' }}</div></div>
                <div><div class="bf-figure">{{ p.periods }}</div>
                  <div class="text-xs text-[color:var(--text-muted)]">{{ stepWords().units }} in all</div></div>
              </div>
              <p class="text-sm text-[color:var(--text-secondary)] m-0">
                {{ periodsText(p.periods, p.step) }}, {{ rangeLabel() }}, in {{ p.zone }}; {{ p.concurrency }} at a time.
              </p>
              <div class="bf-dates" role="list" aria-label="The periods">
                @for (d of shownDates(); track d.start) {
                  <span class="bf-date" role="listitem" [class.is-done]="d.completed && !p.rerunCompleted"
                        [title]="d.completed ? 'Already has a completed run' : d.start">{{ dateLabel(d.date, d.start) }}</span>
                }
                @if (p.dates.length > shownDates().length) {
                  <span class="bf-date">and {{ p.dates.length - shownDates().length }} more</span>
                }
              </div>
              @for (w of p.warnings; track w) {
                <p class="text-sm m-0 flex items-start gap-1.5 text-[color:var(--warn-text,inherit)]" data-test="backfill-warning">
                  <app-icon name="alert" class="mt-0.5 shrink-0 icon-warn" />{{ w }}</p>
              }
              <div class="bf-cost" data-test="backfill-estimate">
                <div class="text-xs font-medium text-[color:var(--text-muted)] uppercase tracking-wide">Cost estimate</div>
                @if (p.estimate; as e) {
                  @if (e.perRun !== null && e.perRun !== undefined) {
                    <div class="bf-figure mt-1">≈ {{ money(e.total, e.currency) }}</div>
                    <p class="text-xs text-[color:var(--text-muted)] m-0 mt-1">{{ money(e.perRun, e.currency) }} a run on average. {{ e.basis }}
                      Billed like any run.</p>
                  } @else {
                    <p class="text-sm text-[color:var(--text-secondary)] m-0 mt-1">{{ e.unavailable }}</p>
                  }
                } @else {
                  <p class="text-sm text-[color:var(--text-secondary)] m-0 mt-1">{{ p.estimateNote || 'No estimate.' }} Its runs are billed like any run.</p>
                }
              </div>
            </div>
          } @else {
            <p class="text-sm text-[color:var(--text-muted)] m-0">{{ loading() ? 'Working out the periods…' : 'Pick the dates.' }}</p>
          }
        </app-section>
        @if (startError()) { <p class="text-sm text-crit-500 m-0" role="alert" data-test="backfill-start-error">{{ startError() }}</p> }
      </div>
      <div foot class="flex items-center gap-2 w-full">
        <button type="button" class="btn btn-ghost btn-sm" (click)="ref.close(null)">Cancel</button>
        <button type="button" class="btn btn-primary btn-sm ml-auto" [disabled]="!canStart()" (click)="start()" data-test="backfill-start">
          <app-icon name="play" [busy]="starting()" />{{ startLabel() }}</button>
      </div>
    </app-side-panel>
  `,
})
export class BackfillPanel implements OnInit {
  readonly ref = inject<DialogRef<Backfill | null, BackfillPanel>>(DialogRef);
  readonly data = inject<BackfillPanelData>(DIALOG_DATA);
  private readonly api = inject(BackfillsApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly today = localIsoDay(new Date());
  readonly parametersHint = 'Every run of the backfill takes these values; its steps read them as {{param.name}}.';
  readonly steps: SegmentOption<BackfillStep>[] = [
    { id: 'DAILY', label: 'Day' }, { id: 'HOURLY', label: 'Hour' }, { id: 'WEEKLY', label: 'Week' },
  ];
  readonly range = signal<DateRange>(defaultRange());
  readonly step = signal<BackfillStep>('DAILY');
  readonly concurrency = signal<string>('2');
  readonly maxConcurrency = signal(4);
  readonly rerun = signal(false);
  readonly parameters = signal<RunParameter[]>([]);
  readonly values = signal<ParameterValues>({});

  readonly preview = signal<BackfillPreview | null>(null);
  readonly loading = signal(false);
  readonly problem = signal('');
  readonly starting = signal(false);
  readonly startError = signal('');
  private readonly asks = new Subject<BackfillRequest>();
  private parametersRead = false;
  private lastAsked = '';

  readonly concurrencyOptions = computed<SegmentOption<string>[]>(() =>
    Array.from({ length: this.maxConcurrency() }, (_, i) => ({ id: String(i + 1), label: String(i + 1) })));
  readonly stepWords = computed(() => STEP_WORDS[this.step()]);
  readonly rangeLabel = computed(() => rangeText(this.range().from, this.range().to));
  readonly shownDates = computed(() => (this.preview()?.dates ?? []).slice(0, SHOWN_DATES));
  readonly valueProblems = computed(() => valueProblems(this.parameters(), this.values()));
  readonly canStart = computed(() => {
    const p = this.preview();
    return !!p && !this.loading() && !this.starting() && !this.problem() && p.willRun > 0
      && !Object.keys(this.valueProblems()).length && p.openBackfills < p.maxOpen;
  });
  readonly startLabel = computed(() => {
    const p = this.preview();
    if (this.starting()) return 'Starting…';
    return p && p.willRun > 0 ? `Start: ${periodsText(p.willRun, p.step)}` : 'Start';
  });

  protected readonly money = money;
  protected readonly periodsText = periodsText;

  constructor() {
    // Any change asks the server again, a moment after the last one.
    effect(() => {
      const request = this.request();
      const key = JSON.stringify(request);
      untracked(() => {
        // The first answer sets the parameters' inputs to their defaults: the same request, not asked twice.
        if (key === this.lastAsked) return;
        this.lastAsked = key;
        this.loading.set(true);
        this.asks.next(request);
      });
    });
  }

  ngOnInit(): void {
    const sub = this.asks.pipe(
      debounceTime(250),
      switchMap(request => this.api.preview(request).pipe(catchError(err => of({ status: 'ERROR', message: refusalOf(err,
        'The backfill could not be worked out just now.') } as ApiResponse<BackfillPreview>)))),
    ).subscribe(answer => this.answered(answer));
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  /** What the inputs ask for now. */
  request(): BackfillRequest {
    const params = this.parameters();
    return {
      jobId: this.data.jobId, from: this.range().from, to: this.range().to, step: this.step(), concurrency: Number(this.concurrency()),
      rerunCompleted: this.rerun(), parameters: valuesBody(params, this.values()),
    };
  }

  private answered(answer: ApiResponse<BackfillPreview>): void {
    this.loading.set(false);
    if (answer.status !== API_SUCCESS || !answer.data) {
      this.problem.set(answer.message || 'The backfill could not be worked out just now.');
      this.preview.set(null);
      return;
    }
    const p = answer.data;
    this.problem.set('');
    this.preview.set(p);
    this.maxConcurrency.set(Math.max(1, p.maxConcurrency || 1));
    if (Number(this.concurrency()) > p.maxConcurrency) this.concurrency.set(String(p.maxConcurrency));
    if (!this.parametersRead) {
      // The first answer names the pipeline's parameters; their inputs start at the defaults.
      this.parametersRead = true;
      this.parameters.set(p.parameters ?? []);
      this.values.set(initialValues(p.parameters ?? []));
    }
  }

  /** "6 Oct", or "6 Oct 14:00" for an hour. */
  dateLabel(day: string, start: string): string {
    return periodLabel(day, start, this.preview()?.step, this.preview()?.zone);
  }

  start(): void {
    if (!this.canStart()) return;
    this.starting.set(true);
    this.startError.set('');
    this.api.start(this.request()).subscribe({
      next: answer => {
        this.starting.set(false);
        if (answer.status === API_SUCCESS && answer.data) {
          this.ref.close(answer.data);
        } else {
          this.startError.set(answer.message || 'The backfill could not be started.');
        }
      },
      error: err => {
        this.starting.set(false);
        this.startError.set(refusalOf(err, 'The backfill could not be started.'));
      },
    });
  }
}

/** The fourteen days before today. */
export function defaultRange(today: Date = new Date()): DateRange {
  const back = (days: number) => { const d = new Date(today); d.setDate(d.getDate() - days); return localIsoDay(d); };
  return { from: back(14), to: back(1), preset: 'custom' };
}
