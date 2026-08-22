import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import {
  AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators,
} from '@angular/forms';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { Field } from '../../../shared/ui/field';
import { Icon } from '../../../shared/ui/icon';

const FREQUENCIES = [
  { value: 'Mint',    label: 'Every N minutes', unit: 'minutes' },
  { value: 'Hr',      label: 'Hourly',          unit: 'hours' },
  { value: 'Daily',   label: 'Daily',           unit: 'days' },
  { value: 'Weekly',  label: 'Weekly',          unit: 'weeks' },
  { value: 'Monthly', label: 'Monthly',         unit: 'months' },
];

const DAYS = [
  { value: '1', label: 'Mon' }, { value: '2', label: 'Tue' }, { value: '3', label: 'Wed' },
  { value: '4', label: 'Thu' }, { value: '5', label: 'Fri' }, { value: '6', label: 'Sat' },
  { value: '7', label: 'Sun' },
];

/** An end date before the start date would silently never run. */
function endAfterStart(group: AbstractControl): ValidationErrors | null {
  const start = group.get('startDate')?.value;
  const end = group.get('endDate')?.value;
  return start && end && end < start ? { endBeforeStart: true } : null;
}

@Component({
  selector: 'app-job-edit',
  imports: [Icon, ReactiveFormsModule, RouterLink, Field],
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

  readonly frequencyValue = signal('Daily');
  readonly unit = computed(() =>
    FREQUENCIES.find(f => f.value === this.frequencyValue())?.unit ?? '');

  ngOnInit(): void {
    this.http.post<ApiResponse<any[]>>(`${API_BASE}/sourceTask.json/listSourceTask`, {}).subscribe({
      next: response => {
        if (response.status === API_SUCCESS) this.tasks.set(response.data ?? []);
      },
      error: () => this.toast.error('Could not load the task list.'),
    });

    this.form.get('executionType')!.valueChanges.subscribe(v => this.executionValue.set(v));
    this.scheduler.get('frequency')!.valueChanges.subscribe(v => this.frequencyValue.set(v));

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
          this.selectedDays.set((job.scheduler.daysOfWeek ?? '').split(',').filter(Boolean));
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
    const every = this.scheduler.get('intervalValue')?.value || '1';
    const time = this.scheduler.get('startTime')?.value || '00:00';
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
        const day = this.scheduler.get('dayOfMonth')?.value;
        text = day
          ? `Every ${every} month${plural} on day ${day} at ${time}`
          : `Every ${every} month${plural} at ${time} — pick a day`;
        break;
      }
      default: text = '';
    }
    const end = this.scheduler.get('endDate')?.value;
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
          this.router.navigate(['/jobs']);
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
