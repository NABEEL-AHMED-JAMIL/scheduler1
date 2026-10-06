import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { JobEdit } from './job-edit';
import { ToastService } from '../../../shared/ui/toast.service';

/**
 * Wave 4: the Cron frequency. Core (6f9261e) takes a 5-field Unix expression, or 6 fields with seconds exactly 0, in
 * SchedulerDto.cronExpression; a Cron schedule's start date and time are optional there (today, 00:00). Every other
 * frequency saves exactly as it did before Cron existed -- the payload carries no cronExpression at all.
 */
const CRON_JOB = { jobId: 2852, jobName: 'UI-CHECK cron daily 0300 B 0929', execution: 'Auto', priority: 1,
  jobStatus: 'Inactive', taskDetail: { taskDetailId: 1864 },
  scheduler: { schedulerId: 1316, startDate: '2026-09-29', startTime: '00:00:00', frequency: 'Cron', intervalValue: '1',
    cronExpression: '0 3 * * *', nextRunAt: '2026-09-30T03:00:00' } };
const DAILY_JOB = { ...CRON_JOB, jobId: 2800, scheduler: { schedulerId: 1300, startDate: '2026-09-01',
  startTime: '09:30:00', frequency: 'Daily', intervalValue: '2', cronExpression: null } };

const REFUSAL = 'SourceJob schedule: Schedules run at most once a minute: the seconds field must be 0.';

function editor(job: unknown, saveAnswer: unknown = { status: 'SUCCESS', message: 'Job save with jobId 2852.' }, id = '2852') {
  const bodies: any[] = [];
  const errors: unknown[] = [];
  const navigations: unknown[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: {
      get: (url: string) => of(url.includes('fetchSourceJobDetail') ? { status: 'SUCCESS', data: job } : { status: 'SUCCESS', data: null }),
      post: (url: string, body: unknown) => {
        if (url.includes('listSourceTask')) return of({ status: 'SUCCESS', data: [] });
        bodies.push(body);
        return of(saveAnswer);
      },
      put: (_url: string, body: unknown) => { bodies.push(body); return of(saveAnswer); },
    } },
    { provide: ToastService, useValue: { success: () => {}, error: (m: unknown) => errors.push(m), info: () => {} } },
    { provide: Router, useValue: { navigate: (to: unknown) => navigations.push(to) } },
  ] });
  const component = TestBed.runInInjectionContext(() => new JobEdit());
  (component as any).jobId = () => id;
  component.ngOnInit();
  return { component, bodies, errors, navigations };
}

describe('JobEdit: the Cron frequency', () => {
  it('offers Cron beside the other frequencies', () => {
    const { component } = editor(CRON_JOB);
    expect(component.frequencies.map(f => f.value)).toEqual(['Mint', 'Hr', 'Daily', 'Weekly', 'Monthly', 'Cron']);
  });

  it('reads a Cron job back with its expression', () => {
    const { component } = editor(CRON_JOB);
    expect(component.frequencyValue()).toBe('Cron');
    expect(component.isCron()).toBe(true);
    expect(component.scheduler.get('cronExpression')!.value).toBe('0 3 * * *');
    expect(component.summary()).toBe('On the cron schedule 0 3 * * * (server time).');
  });

  it('needs an expression, and neither a start date, a time nor an interval', () => {
    const { component } = editor(null, undefined, '');
    component.form.patchValue({ jobName: 'cron job', taskDetailId: 1864 });
    component.scheduler.patchValue({ frequency: 'Cron', startDate: '', startTime: '', intervalValue: '' });
    expect(component.scheduler.get('cronExpression')!.hasError('required')).toBe(true);
    expect(component.summary()).toBe('Enter a cron expression to see the schedule.');
    component.scheduler.patchValue({ cronExpression: '*/15 * * * *' });
    expect(component.form.valid).toBe(true);
  });

  it('asks for the start date again when the frequency leaves Cron', () => {
    const { component } = editor(null, undefined, '');
    component.scheduler.patchValue({ frequency: 'Cron', startDate: '' });
    expect(component.scheduler.get('startDate')!.valid).toBe(true);
    component.scheduler.patchValue({ frequency: 'Daily' });
    expect(component.scheduler.get('startDate')!.hasError('required')).toBe(true);
    expect(component.scheduler.get('cronExpression')!.valid).toBe(true);
  });

  it('saves the expression, and leaves out what Cron does not use', () => {
    const { component, bodies, navigations } = editor(null, undefined, '');
    component.form.patchValue({ jobName: 'cron job', taskDetailId: 1864 });
    component.scheduler.patchValue({ frequency: 'Weekly', startDate: '', startTime: '' });
    component.toggleDay('MON');
    component.scheduler.patchValue({ frequency: 'Cron', cronExpression: '  0 3 * * *  ' });
    component.save();
    const schedule = bodies[0].schedulers[0];
    expect(schedule).toMatchObject({ frequency: 'Cron', cronExpression: '0 3 * * *', startDate: null, startTime: null,
      daysOfWeek: null, dayOfMonth: null });
    expect(navigations).toEqual([['/pipelines/schedules']]);
  });

  it('keeps a start date and time that were given', () => {
    const { component, bodies } = editor(CRON_JOB);
    component.save();
    expect(bodies[0].schedulers[0]).toMatchObject({ frequency: 'Cron', cronExpression: '0 3 * * *',
      startDate: '2026-09-29', startTime: '00:00' });
  });

  it('shows the server\'s refusal under the field, and stays on the page', () => {
    const { component, navigations } = editor(CRON_JOB, { status: 'ERROR', message: REFUSAL });
    component.scheduler.patchValue({ cronExpression: '* * * * * *' });
    component.save();
    expect(component.cronError()).toBe(REFUSAL);
    expect(component.saving()).toBe(false);
    expect(navigations).toEqual([]);
    component.scheduler.patchValue({ cronExpression: '0 * * * * *' });
    expect(component.cronError()).toBe('');
  });

  it('reads a refusal that arrives as an HTTP error too', () => {
    const { component } = editor(CRON_JOB);
    (component as any).http.put = () => ({ subscribe: (o: any) => o.error({ error: { status: 'ERROR', message: REFUSAL } }) });
    component.save();
    expect(component.cronError()).toBe(REFUSAL);
  });

  it('saves every other frequency exactly as before: no cronExpression in the payload', () => {
    const { component, bodies } = editor(DAILY_JOB, undefined, '2800');
    expect(component.isCron()).toBe(false);
    component.save();
    expect(Object.keys(bodies[0].schedulers[0]).sort()).toEqual(
      ['dayOfMonth', 'daysOfWeek', 'endDate', 'frequency', 'intervalValue', 'schedulerId', 'startDate', 'startTime']);
    expect(bodies[0].schedulers[0]).toMatchObject({ frequency: 'Daily', intervalValue: '2', startTime: '09:30' });
  });
});
