import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import {
  AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators,
} from '@angular/forms';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { LIST_LIMIT } from '../../../core/api/list-limit';
import { ToastService } from '../../../shared/ui/toast.service';
import { Field } from '../../../shared/ui/field';
import { Icon } from '../../../shared/ui/icon';
import { Combobox, ComboboxOption } from '../../../shared/ui/combobox';

const FREQUENCIES = [
  { value: 'Mint',    label: 'Every N minutes', unit: 'minutes' },
  { value: 'Hr',      label: 'Hourly',          unit: 'hours' },
  { value: 'Daily',   label: 'Daily',           unit: 'days' },
  { value: 'Weekly',  label: 'Weekly',          unit: 'weeks' },
  { value: 'Monthly', label: 'Monthly',         unit: 'months' },
];

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
  imports: [Icon, ReactiveFormsModule, RouterLink, Field, Combobox],
  templateUrl: './job-edit.html',
})
export class JobEdit implements OnInit {
  readonly jobId = input<string>('');

  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly frequencies = FREQUENCIES;
  readonly days = DAYS;
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
    }, { validators: endAfterStart }),
  });

  get scheduler(): FormGroup { return this.form.get('scheduler') as FormGroup; }

  /** A manual job has no timetable, so the whole schedule section is irrelevant. */
  readonly isScheduled = computed(() => this.executionValue() !== 'Manual');
  private readonly executionValue = signal('Auto');

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

    this.form.get('executionType')!.valueChanges.subscribe(v => this.executionValue.set(v));
    this.scheduler.get('frequency')!.valueChanges.subscribe(v => this.frequencyValue.set(v));
    this.schedule.set(this.scheduler.getRawValue());
    this.scheduler.valueChanges.subscribe(() => this.schedule.set(this.scheduler.getRawValue()));
    this.form.get('maxAttempts')!.valueChanges.subscribe(v => this.maxAttemptsValue.set(Number(v)));

    if (this.isEdit()) this.loadJob();
  }

  private loadJob(): void {
    this.loading.set(true);
    this.http.get<ApiResponse<any>>(`${API_BASE}/sourceJob.json/fetchSourceJobDetailWithSourceJobId`,
      { params: { jobId: this.jobId() } }).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          this.toast.error(response.message || 'That job could not be loaded.');
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
        if (job.scheduler) {
          this.scheduler.patchValue({
            schedulerId: job.scheduler.schedulerId,
            startDate: job.scheduler.startDate,
            endDate: job.scheduler.endDate,
            startTime: (job.scheduler.startTime ?? '').slice(0, 5),
            frequency: job.scheduler.frequency,
            intervalValue: job.scheduler.intervalValue,
            dayOfMonth: job.scheduler.dayOfMonth,
          });
          this.frequencyValue.set(job.scheduler.frequency);
          this.selectedDays.set(((job.scheduler.daysOfWeek ?? '') as string).split(',')
            .filter(Boolean).map(normaliseDayCode)
            .filter((code: string) => DAYS.some(day => day.value === code)));
        }
      },
      error: err => {
        this.loading.set(false);
        this.toast.error(err?.error?.message || 'That job could not be loaded.');
      },
    });
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
    // A job read back from the server carries the interval as a number: 1, not '1'.
    const every = String(schedule['intervalValue'] || '1');
    const time = schedule['startTime'] || '00:00';
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
        const day = schedule['dayOfMonth'];
        text = day
          ? `Every ${every} month${plural} on day ${day} at ${time}`
          : `Every ${every} month${plural} at ${time} — pick a day`;
        break;
      }
      default: text = '';
    }
    const end = schedule['endDate'];
    return end ? `${text}, until ${end} inclusive.` : `${text}.`;
  });

  save(): void {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Check the highlighted fields.');
      return;
    }
    if (this.isScheduled() && this.frequencyValue() === 'Weekly' && !this.selectedDays().length) {
      this.toast.error('Pick at least one day of the week.');
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
      payload.schedulers = [{
        ...value.scheduler,
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
        this.saving.set(false);
        if (response.status === API_SUCCESS) {
          this.toast.success(this.isEdit() ? 'Job updated.' : 'Job created.');
          this.router.navigate(['/operations/jobs']);
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err?.error?.message || 'The job could not be saved.');
      },
    });
  }
}
