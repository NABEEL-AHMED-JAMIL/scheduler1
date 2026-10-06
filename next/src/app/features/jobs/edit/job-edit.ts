import { Component, ElementRef, Injector, OnInit, computed, inject, input, signal } from '@angular/core';
import { focusFirstInvalid } from '../../../shared/ui/focus-first-invalid';
import { isMissingRecord, isRecordId } from '../../../core/api/missing-record';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import {
  AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators,
} from '@angular/forms';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { LIST_LIMIT } from '../../../core/api/list-limit';
import { ToastService } from '../../../shared/ui/toast.service';
import { Field } from '../../../shared/ui/field';
import { DateField } from '../../../shared/ui/date-field';
import { TimeField } from '../../../shared/ui/time-field';
import { Icon } from '../../../shared/ui/icon';
import { LoadError } from '../../../shared/ui/load-error';
import { NOTIFY_OPTIONS } from '../notify-summary';
import { SERVER_ZONE } from '../../../core/instant';
import { dayLabel } from '../../../shared/ui/time-format';
import { clockTime } from '../schedule-labels';
import { Combobox, ComboboxOption } from '../../../shared/ui/combobox';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { InboxTrigger, patternProblem, triggerOf } from '../inbox/inbox-trigger';
import { AiStepChoice, ModelPicks, choiceBody, picksChanged, picksOf, stepsOf } from '../ai-models/ai-model-choice';
import { AiModelPicks } from '../ai-models/ai-model-picks';
import { ManagedBanner } from '../../../shared/ui/managed-banner';
import { AuthService } from '../../../core/auth/auth.service';

const FREQUENCIES = [
  { value: 'Mint',    label: 'Every N minutes', unit: 'minutes' },
  { value: 'Hr',      label: 'Hourly',          unit: 'hours' },
  { value: 'Daily',   label: 'Daily',           unit: 'days' },
  { value: 'Weekly',  label: 'Weekly',          unit: 'weeks' },
  { value: 'Monthly', label: 'Monthly',         unit: 'months' },
  // Wave 4 (Core 6f9261e): the expression is the cadence, so there is no interval and no unit.
  { value: 'Cron',    label: 'Cron expression', unit: '' },
];

/** Worked examples under the Cron field: minute hour day-of-month month day-of-week. */
const CRON_EXAMPLES = [
  { expression: '0 3 * * *',    means: '03:00 every day' },
  { expression: '*/15 * * * *', means: 'every 15 minutes' },
  { expression: '30 8 * * 1-5', means: '08:30 on weekdays' },
];

/** The start fields a Cron schedule may leave blank: Core then starts it today, 00:00 (SourceJobServiceImpl). */
const CRON_OPTIONAL = ['startDate', 'startTime', 'intervalValue'];

/**
 * The day codes the engine actually parses.
 *
 * These were '1'..'7'. Nothing else in the system speaks that: ProcessTimeUtil maps MON..SUN,
 * the legacy console writes MON..SUN, and the jobs list renders MON..SUN. So every weekly
 * schedule created here stored days the engine read as none at all and ran once a week on
 * whatever weekday its start date fell on -- while this screen, matching values against its own
 * private table, went on displaying the days that were picked. The console was the only thing
 * that believed them.
 */
const DAYS = [
  { value: 'MON', label: 'Mon' }, { value: 'TUE', label: 'Tue' }, { value: 'WED', label: 'Wed' },
  { value: 'THU', label: 'Thu' }, { value: 'FRI', label: 'Fri' }, { value: 'SAT', label: 'Sat' },
  { value: 'SUN', label: 'Sun' },
];

/**
 * Reads a stored days_of_week entry in either vocabulary.
 *
 * Rows written by this screen before the fix above hold '1'..'7', and they are not going to be
 * migrated away underneath a running scheduler, so opening one has to re-select the right chips
 * rather than silently clearing them and saving an empty week back.
 */
const LEGACY_DAY_CODES: Record<string, string> = {
  '1': 'MON', '2': 'TUE', '3': 'WED', '4': 'THU', '5': 'FRI', '6': 'SAT', '7': 'SUN',
};

function normaliseDayCode(code: string): string {
  const trimmed = code.trim().toUpperCase();
  return LEGACY_DAY_CODES[trimmed] ?? trimmed;
}

/** An end date before the start date would silently never run. */
function endAfterStart(group: AbstractControl): ValidationErrors | null {
  const start = group.get('startDate')?.value;
  const end = group.get('endDate')?.value;
  return start && end && end < start ? { endBeforeStart: true } : null;
}

@Component({
  selector: 'app-job-edit',
  imports: [Icon, ReactiveFormsModule, RouterLink, Field, Combobox, LoadError, AiModelPicks, ManagedBanner, DateField, TimeField],
  templateUrl: './job-edit.html',
  /*
   * The weekday picker is the one multi-select .seg: several days can be on at once, so "on" has
   * to stand out from the track by itself (WCAG 1.4.11), not by being the one chip that differs.
   * The shared .seg-on -- a white chip on a grey track -- measured 1.06:1 in light and 1.13:1 in
   * dark. The filled primary-button colours are defined for both themes.
   */
  styles: `
    /* The form and, on a wide screen, its summary beside it: the summary stays in view while the form scrolls. */
    .schedule-layout { display: grid; gap: 1.25rem; align-items: start; }
    @media (min-width: 80rem) {
      .schedule-layout { grid-template-columns: minmax(0, 1fr) 22rem; }
      .schedule-summary { position: sticky; top: 1rem; }
    }
    .seg-multi .seg-btn[aria-pressed="true"] {
      background: var(--btn-primary-bg);
      color: var(--btn-primary-fg);
      box-shadow: none;
    }
    .seg-multi .seg-btn[aria-pressed="true"]:hover:not(:disabled) {
      background: var(--btn-primary-hover);
      color: var(--btn-primary-fg);
    }
  `,
})
export class JobEdit implements OnInit {
  readonly jobId = input<string>('');
  /** A new schedule for this task (?taskDetailId=, from the step builder's Schedule, MIG-249). */
  readonly taskDetailId = input<string>('');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef, { optional: true });
  private readonly injector = inject(Injector);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  /** MIG-254: a MANAGED workspace's schedules are our team's to change: shown, not saved. */
  readonly locked = computed(() => this.injector.get(AuthService).builderLocked());

  readonly frequencies = FREQUENCIES;
  /** When it runs, in the words of a person choosing: the engine's Auto and Manual. */
  readonly executionOptions = [
    { value: 'Auto', label: 'On a timetable' },
    { value: 'Manual', label: 'Only when started' },
  ];
  readonly days = DAYS;
  readonly notifyOptions = NOTIFY_OPTIONS;
  readonly monthDays = Array.from({ length: 31 }, (_, i) => i + 1);

  readonly tasks = signal<any[]>([]);
  /** Tasks as searchable rows: name first, the topic and pipeline as the hint so either finds it. */
  readonly taskOptions = computed<ComboboxOption[]>(() => this.tasks().map(t => ({
    value: String(t.taskDetailId),
    label: t.taskName,
    hint: [t.sourceTaskType?.serviceName, t.pipelineId, `#${t.taskDetailId}`].filter(Boolean).join(' · '),
  })));
  readonly saving = signal(false);
  readonly loading = signal(false);
  /**
   * Why the job could not be read. While it is set the page shows the reason and Try again
   * instead of the form: an empty "Edit job" form would save as an update with no job id.
   */
  readonly loadError = signal('');
  /** The job is not there to load, so Try again cannot help: the page offers Back to jobs instead. */
  readonly loadMissing = signal(false);
  readonly submitted = signal(false);
  readonly selectedDays = signal<string[]>([]);

  readonly isEdit = computed(() => !!this.jobId());

  readonly form: FormGroup = this.fb.group({
    jobId: [null],
    jobName: ['', Validators.required],
    taskDetailId: [null, Validators.required],
    executionType: ['Auto', Validators.required],
    priority: [1, [Validators.required, Validators.min(1), Validators.max(9)]],
    // Both mirror the CHECK constraints the database enforces and the ranges SourceJobServiceImpl
    // validates. 1 attempt means no retry, which is what every job created before this existed
    // carries, so the default here leaves behaviour unchanged unless somebody opts in.
    maxAttempts: [1, [Validators.required, Validators.min(1), Validators.max(10)]],
    retryBackoffSeconds: [60, [Validators.required, Validators.min(1), Validators.max(3600)]],
    jobStatus: ['Active', Validators.required],
    completeJob: [false],
    failJob: [false],
    skipJob: [false],
    scheduler: this.fb.group({
      schedulerId: [null],
      startDate: ['', Validators.required],
      endDate: [''],
      startTime: ['00:00', Validators.required],
      frequency: ['Daily', Validators.required],
      intervalValue: ['1', Validators.required],
      dayOfMonth: [null],
      cronExpression: [''],
    }, { validators: endAfterStart }),
  });

  get scheduler(): FormGroup { return this.form.get('scheduler') as FormGroup; }

  /**
   * MIG-251 on MIG-239: the Event start -- run when a file arrives in the workspace's inbox, the file's name matching a
   * pattern (blank: every file). Core keeps it apart from the job (sourceJob.json/inboxTrigger), so it is saved after
   * the job, and only when it changed. Off keeps the pattern: it is saved as a trigger that is off, not removed.
   */
  readonly onArrival = signal(false);
  readonly filePattern = signal('');
  readonly patternError = computed(() => (this.onArrival() ? patternProblem(this.filePattern()) : ''));
  private readonly savedTrigger = signal<InboxTrigger | null>(null);

  /**
   * MIG-251 on MIG-242: the model each AI step runs on when this schedule runs it (sourceJob.json/aiModelChoice). Only
   * for a saved job whose pipeline has AI steps; the section is not drawn otherwise.
   */
  readonly aiSteps = signal<AiStepChoice[]>([]);
  readonly modelPicks = signal<ModelPicks>({});

  /** A manual job has no timetable, so the whole schedule section is irrelevant. */
  readonly isScheduled = computed(() => this.executionValue() !== 'Manual');
  readonly executionValue = signal('Auto');

  /** The rest of the form as a signal, for the summary beside it (form values are not signals). */
  private readonly values = signal<Record<string, any>>({});
  readonly jobStatusValue = computed(() => String(this.values()['jobStatus'] ?? 'Active'));
  readonly pipelineName = computed(() => {
    const id = this.values()['taskDetailId'];
    return id == null ? '' : (this.tasks().find(t => String(t.taskDetailId) === String(id))?.taskName ?? `Pipeline #${id}`);
  });
  /** The first run as set, for a timetable; nothing for Cron (the expression decides) or a job only started by hand. */
  readonly startsLine = computed(() => {
    if (!this.isScheduled() || this.isCron()) return '';
    const schedule = this.schedule();
    const date = schedule['startDate'];
    if (!date) return '';
    return `Starting ${dayLabel(date)} at ${clockTime(schedule['startTime']) || '00:00'}, server time.`;
  });
  readonly retryLine = computed(() => {
    const v = this.values();
    const attempts = Number(v['maxAttempts'] ?? 1);
    const priority = `Priority ${v['priority'] ?? 1}`;
    if (!(attempts > 1)) return `${priority}; a failed run is not retried.`;
    return `${priority}; up to ${attempts} attempts, ${v['retryBackoffSeconds'] ?? 60} s apart at first.`;
  });
  readonly emailLine = computed(() => {
    const v = this.values();
    const on = this.notifyOptions.filter(o => !!v[o.control]).map(o => o.label.toLowerCase());
    return on.length ? `When ${on.join(', ')}.` : 'Nobody is emailed.';
  });

  setExecution(value: string): void {
    if (this.locked()) return;
    this.form.get('executionType')!.setValue(value);
  }

  /** Backoff only means anything once there is a second attempt to wait before. */
  readonly retryEnabled = computed(() => Number(this.maxAttemptsValue()) > 1);
  private readonly maxAttemptsValue = signal(1);

  readonly frequencyValue = signal('Daily');
  /**
   * The schedule group's values as a signal, for the summary. Form values are not signals, so a
   * computed() reading them directly only re-ran when something it DID track changed -- the
   * frequency -- and went on describing the old interval, time, day or end date.
   */
  private readonly schedule = signal<Record<string, any>>({});
  readonly unit = computed(() =>
    FREQUENCIES.find(f => f.value === this.frequencyValue())?.unit ?? '');

  /** Wave 4: a Cron schedule -- the expression replaces the interval, the weekdays and the day of the month. */
  readonly isCron = computed(() => this.frequencyValue() === 'Cron');
  readonly cronExamples = CRON_EXAMPLES;
  /** Core's refusal of the expression ("SourceJob schedule: ..."), shown under the field until it is edited. */
  readonly cronError = signal('');

  ngOnInit(): void {
    // Explicitly limited, because the endpoint's own default is ten: this dropdown is the only
    // way to attach a job to a task, so without the limit the eleventh task onwards could not
    // be chosen at all -- and the control gave no hint that anything was missing.
    this.http.post<ApiResponse<any[]>>(`${API_BASE}/sourceTask.json/listSourceTask`, {},
      { params: { limit: LIST_LIMIT } }).subscribe({
      next: response => {
        if (response.status === API_SUCCESS) this.tasks.set(response.data ?? []);
      },
      error: () => this.toast.error('Could not load the task list.'),
    });

    // A Manual job has no schedule: the section is hidden, and its required fields (start date...) must not
    // hold the form invalid with nothing on screen to fix -- a Manual job could not be created or saved.
    this.form.get('executionType')!.valueChanges.subscribe(v => {
      this.executionValue.set(v);
      this.applyExecution(v);
    });
    this.scheduler.get('frequency')!.valueChanges.subscribe(v => {
      this.frequencyValue.set(v);
      this.applyFrequency(v);
    });
    this.scheduler.get('cronExpression')!.valueChanges.subscribe(() => this.cronError.set(''));
    this.schedule.set(this.scheduler.getRawValue());
    this.scheduler.valueChanges.subscribe(() => this.schedule.set(this.scheduler.getRawValue()));
    this.form.get('maxAttempts')!.valueChanges.subscribe(v => this.maxAttemptsValue.set(Number(v)));
    this.values.set(this.form.getRawValue());
    this.form.valueChanges.subscribe(() => this.values.set(this.form.getRawValue()));

    if (this.isEdit()) {
      this.loadJob();
      if (isRecordId(this.jobId())) this.loadExtras();
    }
    else {
      // A new schedule starts today (the server's calendar) unless someone picks another day.
      this.scheduler.patchValue({ startDate: new Intl.DateTimeFormat('en-CA', { timeZone: SERVER_ZONE }).format(new Date()) });
      if (isRecordId(this.taskDetailId())) this.form.patchValue({ taskDetailId: Number(this.taskDetailId()) });
    }
  }

  retryLoad(): void { this.loadJob(); }

  private loadJob(): void {
    this.loadError.set('');
    this.loadMissing.set(false);
    // An id that is not a number cannot name a job; asking anyway only earned the server's refusal.
    if (!isRecordId(this.jobId())) {
      this.missing('That link does not point to a job.');
      return;
    }
    this.loading.set(true);
    this.http.get<ApiResponse<any>>(`${API_BASE}/sourceJob.json/fetchSourceJobDetailWithSourceJobId`,
      { params: { jobId: this.jobId() } }).subscribe({
      next: response => {
        this.loading.set(false);
        // Another person's job reads exactly like a missing one for a tenant user (JobOwnership).
        if (isMissingRecord(response) || (response.status === API_SUCCESS && !response.data)) {
          this.missing(`Job #${String(this.jobId()).trim()} does not exist or was deleted.`);
          return;
        }
        if (response.status !== API_SUCCESS) {
          this.loadError.set(response.message || 'That job could not be loaded.');
          return;
        }
        const job = response.data;
        this.form.patchValue({
          jobId: job.jobId,
          jobName: job.jobName,
          taskDetailId: job.taskDetail?.taskDetailId ?? null,
          executionType: job.execution,
          priority: job.priority,
          // Older jobs predate these columns and come back without them; falling back to the
          // no-retry default keeps the form showing what the job actually does.
          maxAttempts: job.maxAttempts ?? 1,
          retryBackoffSeconds: job.retryBackoffSeconds ?? 60,
          jobStatus: job.jobStatus,
          completeJob: job.completeJob,
          failJob: job.failJob,
          skipJob: job.skipJob,
        });
        this.executionValue.set(job.execution);
        this.applyExecution(job.execution);
        if (job.scheduler) {
          this.scheduler.patchValue({
            schedulerId: job.scheduler.schedulerId,
            startDate: job.scheduler.startDate,
            endDate: job.scheduler.endDate,
            startTime: (job.scheduler.startTime ?? '').slice(0, 5),
            frequency: job.scheduler.frequency,
            intervalValue: job.scheduler.intervalValue,
            dayOfMonth: job.scheduler.dayOfMonth,
            cronExpression: job.scheduler.cronExpression ?? '',
          });
          this.frequencyValue.set(job.scheduler.frequency);
          this.selectedDays.set(((job.scheduler.daysOfWeek ?? '') as string).split(',')
            .filter(Boolean).map(normaliseDayCode)
            .filter((code: string) => DAYS.some(day => day.value === code)));
        }
      },
      error: err => {
        this.loading.set(false);
        if (isMissingRecord(err)) this.missing(`Job #${String(this.jobId()).trim()} does not exist or was deleted.`);
        else this.loadError.set(err?.error?.message || 'That job could not be loaded.');
      },
    });
  }

  /** The job's trigger and AI steps. Neither is the point of the page, so a failed read leaves its section as for none. */
  private loadExtras(): void {
    const params = { jobId: String(this.jobId()) };
    this.http.get<ApiResponse<unknown>>(`${API_BASE}/sourceJob.json/inboxTrigger`, { params }).subscribe({
      next: response => {
        const trigger = response.status === API_SUCCESS ? triggerOf(response.data) : null;
        this.savedTrigger.set(trigger);
        this.onArrival.set(!!trigger?.configured && trigger.enabled !== false);
        this.filePattern.set(trigger?.filePattern ?? '');
      },
      error: () => {},
    });
    this.http.get<ApiResponse<unknown>>(`${API_BASE}/sourceJob.json/aiModelChoice`, { params }).subscribe({
      next: response => {
        const steps = response.status === API_SUCCESS ? stepsOf(response.data) : [];
        this.aiSteps.set(steps);
        this.modelPicks.set(picksOf(steps));
      },
      error: () => {},
    });
  }

  /** The trigger request the form asks for, or null when it asks for what is already saved. */
  private triggerRequest(jobId: number): { jobId: number; enabled: boolean; filePattern: string } | null {
    const saved = this.savedTrigger();
    const savedOn = !!saved?.configured && saved.enabled !== false;
    const pattern = this.filePattern().trim();
    if (this.onArrival()) {
      if (savedOn && (saved?.filePattern ?? '') === pattern) return null;
      return { jobId, enabled: true, filePattern: pattern };
    }
    return savedOn ? { jobId, enabled: false, filePattern: saved?.filePattern ?? '' } : null;
  }

  /**
   * The trigger and the models, saved once the job is: each answers '' or why it was refused. A new job's id is the one
   * its creation answered with ("Job save with jobId 2901."), as Duplicate reads it.
   */
  private saveExtras(jobId: number | null): Observable<string[]> {
    if (jobId === null || !Number.isFinite(jobId)) {
      return of(this.triggerRequest(0) ? ['the job\'s id did not come back, so its inbox trigger was not set.'] : []);
    }
    const asks: Observable<string>[] = [];
    const reason = (fallback: string) => (response: ApiResponse) =>
      response.status === API_SUCCESS ? '' : (response.message || fallback);
    const trigger = this.triggerRequest(jobId);
    if (trigger) {
      asks.push(this.http.post<ApiResponse>(`${API_BASE}/sourceJob.json/inboxTrigger/save`, trigger).pipe(
        map(reason('the inbox trigger was not saved.')),
        catchError(err => of(err?.error?.message || 'the inbox trigger was not saved.'))));
    }
    if (this.isEdit() && this.aiSteps().length && picksChanged(this.aiSteps(), this.modelPicks())) {
      asks.push(this.http.post<ApiResponse>(`${API_BASE}/sourceJob.json/aiModelChoice/save`, choiceBody(jobId, this.modelPicks())).pipe(
        map(reason('the AI models were not saved.')),
        catchError(err => of(err?.error?.message || 'the AI models were not saved.'))));
    }
    return asks.length ? forkJoin(asks).pipe(map(answers => answers.filter(Boolean))) : of([]);
  }

  private missing(reason: string): void {
    this.loading.set(false);
    this.loadError.set(reason);
    this.loadMissing.set(true);
  }

  toggleDay(day: string): void {
    this.selectedDays.update(list =>
      list.includes(day) ? list.filter(d => d !== day) : [...list, day]);
  }

  /** Plain-language restatement of the schedule, so the timetable is checkable before saving. */
  readonly summary = computed(() => {
    if (!this.isScheduled()) return 'Runs only when you trigger it.';
    const frequency = this.frequencyValue();
    const schedule = this.schedule();
    if (frequency === 'Cron') {
      const expression = String(schedule['cronExpression'] ?? '').trim();
      if (!expression) return 'Enter a cron expression to see the schedule.';
      const end = schedule['endDate'];
      return `On the cron schedule ${expression} (server time)${end ? `, until ${dayLabel(end)} inclusive` : ''}.`;
    }
    // A job read back from the server carries the interval as a number: 1, not '1'. One the field
    // refuses (0, empty, a fraction) is not described at all: "Every 1" claimed a schedule the
    // form would not save, and the field's own error is the message that matters.
    const interval = Number(schedule['intervalValue'] ?? 1);
    if (schedule['intervalValue'] === '' || !Number.isInteger(interval) || interval < 1) {
      return 'Set how often it repeats to see the schedule.';
    }
    const every = String(interval);
    const time = clockTime(schedule['startTime']) || '00:00';
    const plural = every === '1' ? '' : 's';
    let text: string;
    switch (frequency) {
      case 'Mint':  text = `Every ${every} minute${plural}`; break;
      case 'Hr':    text = `Every ${every} hour${plural}`; break;
      case 'Daily': text = `Every ${every} day${plural} at ${time}`; break;
      case 'Weekly': {
        const names = this.selectedDays()
          .map(d => DAYS.find(day => day.value === d)?.label).filter(Boolean);
        text = names.length
          ? `Every ${every} week${plural} on ${names.join(', ')} at ${time}`
          : `Every ${every} week${plural} at ${time} — pick at least one day`;
        break;
      }
      case 'Monthly': {
        // The day is optional: without one the scheduler adds whole months to the start date
        // (ProcessTimeUtil's plusMonths), so the job keeps the start date's day.
        const day = schedule['dayOfMonth'];
        const startDay = Number(String(schedule['startDate'] ?? '').slice(8, 10)) || null;
        text = day ? `Every ${every} month${plural} on day ${day} at ${time}`
          : startDay ? `Every ${every} month${plural} on day ${startDay} (the start date's day) at ${time}`
          : `Every ${every} month${plural} at ${time}, on the start date's day`;
        break;
      }
      default: text = '';
    }
    const end = schedule['endDate'];
    // Written as the rest of the console writes a day; the field itself keeps the ISO value.
    return end ? `${text}, until ${dayLabel(end)} inclusive.` : `${text}.`;
  });

  /**
   * An end date already behind the server's today: the job saves, and then never runs again. The
   * list says "Expired — no further runs" for it; the editor said nothing. Compared in the
   * server's zone, because that is the calendar the scheduler checks the end date against.
   */
  readonly endPassed = computed(() => {
    if (!this.isScheduled()) return false;
    const end = this.schedule()['endDate'];
    if (!end) return false;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: SERVER_ZONE }).format(new Date());
    return end < today;
  });

  /**
   * Cron needs its expression and nothing else of the timetable; every other frequency keeps exactly the validators it
   * had before Cron existed. Only the required rule moves: the start fields have no other validator to preserve.
   */
  private applyFrequency(frequency: string): void {
    const cron = frequency === 'Cron';
    for (const name of CRON_OPTIONAL) {
      const control = this.scheduler.get(name)!;
      control.setValidators(cron ? null : Validators.required);
      control.updateValueAndValidity({ emitEvent: false });
    }
    const expression = this.scheduler.get('cronExpression')!;
    expression.setValidators(cron ? Validators.required : null);
    expression.updateValueAndValidity({ emitEvent: false });
  }

  /** The schedule only counts for a scheduled job; disabled controls are skipped by validation. */
  private applyExecution(execution: string): void {
    const scheduler = this.form.get('scheduler')!;
    if (execution === 'Manual') scheduler.disable({ emitEvent: false });
    else scheduler.enable({ emitEvent: false });
  }

  save(): void {
    // Nothing was read, so there is nothing to update (the form is not shown either).
    if (this.loadError() || this.locked()) return;
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Check the highlighted fields.');
      // Focus stayed on Save, so a keyboard or screen-reader user had to go looking for the field.
      if (this.host) focusFirstInvalid(this.host.nativeElement, this.injector);
      return;
    }
    if (this.isScheduled() && this.frequencyValue() === 'Weekly' && !this.selectedDays().length) {
      this.toast.error('Pick at least one day of the week.');
      return;
    }
    if (this.patternError()) {
      this.toast.error(this.patternError());
      return;
    }

    const value = this.form.getRawValue();
    const payload: any = {
      jobId: value.jobId,
      jobName: value.jobName,
      taskDetail: { taskDetailId: value.taskDetailId },
      execution: value.executionType,
      priority: value.priority,
      maxAttempts: value.maxAttempts,
      retryBackoffSeconds: value.retryBackoffSeconds,
      jobStatus: value.jobStatus,
      completeJob: value.completeJob,
      failJob: value.failJob,
      skipJob: value.skipJob,
    };

    if (this.isScheduled()) {
      const { cronExpression, ...timetable } = value.scheduler;
      payload.schedulers = [this.isCron()
        // Cron: the expression is the cadence. A blank start is left out for Core to default (today, 00:00), and the
        // weekdays or day of the month a previous frequency picked are not carried along.
        ? { ...timetable, startDate: timetable.startDate || null, startTime: timetable.startTime || null,
          cronExpression: String(cronExpression ?? '').trim(), daysOfWeek: null, dayOfMonth: null }
        : {
          ...timetable,
          daysOfWeek: this.selectedDays().length ? this.selectedDays().join(',') : null,
          dayOfMonth: value.scheduler.dayOfMonth === '' ? null : value.scheduler.dayOfMonth,
        }];
    }

    this.saving.set(true);
    const request = this.isEdit()
      ? this.http.put<ApiResponse>(`${API_BASE}/sourceJob.json/updateSourceJob`, payload)
      : this.http.post<ApiResponse>(`${API_BASE}/sourceJob.json/addSourceJob`, payload);

    request.subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) {
          this.saving.set(false);
          if (this.refusedCron(response.message)) return;
          this.toast.error(response.message || 'The job could not be saved.');
          return;
        }
        const jobId = this.isEdit() ? Number(value.jobId ?? this.jobId())
          : Number(/jobId (\d+)/.exec(response.message ?? '')?.[1] ?? NaN);
        this.saveExtras(jobId).subscribe(problems => {
          this.saving.set(false);
          if (!problems.length) {
            this.toast.success(this.isEdit() ? 'Schedule updated.' : 'Schedule created.');
            this.router.navigate(['/pipelines/schedules']);
            return;
          }
          this.toast.error(`${this.isEdit() ? 'The job was updated' : 'The job was created'}, but ${problems.join(' ')}`);
          // A new job is saved already: staying on "New schedule" would offer to create it again.
          if (!this.isEdit()) this.router.navigate(['/pipelines/schedules']);
        });
      },
      error: err => {
        this.saving.set(false);
        if (this.refusedCron(err?.error?.message)) return;
        this.toast.error(err?.error?.message || 'The job could not be saved.');
      },
    });
  }

  /**
   * Core refuses a Cron schedule it will not run with "SourceJob schedule: ..." (SourceJobServiceImpl.cronScheduleError).
   * That sentence is about the expression, so it goes under the field, which takes the focus, rather than a toast.
   */
  private refusedCron(message: string | undefined): boolean {
    if (!this.isCron() || !message?.startsWith('SourceJob schedule:')) return false;
    this.cronError.set(message);
    this.host?.nativeElement.querySelector<HTMLInputElement>('#cronExpression')?.focus();
    return true;
  }
}
