import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { EMPTY, of } from 'rxjs';
import { Jobs } from './jobs';
import { RunWithDialog } from './ai-models/run-with-dialog';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { JobEventsService } from '../../core/socket/job-events.service';

/**
 * MIG-251: the row menu gains "Run with…" beside Run now (every other action is where it was), and an expanded row says
 * when a file arriving in the inbox starts the job -- the Event start a Manual job's "On demand" would otherwise hide.
 */
function jobs(answers: Record<string, unknown> = {}, dialogAnswer = true) {
  const opened: { component: unknown; data: any }[] = [];
  const gets: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: {
        get: (url: string, options?: { params?: Record<string, string> }) => {
          const path = url.replace(/^.*\/api\/v1/, '');
          gets.push(`${path}?${new URLSearchParams(options?.params ?? {}).toString()}`);
          return of(path in answers ? answers[path] : { status: 'SUCCESS', data: [] });
        },
        post: () => of({ status: 'SUCCESS', data: [] }),
        request: () => of({ status: 'SUCCESS' }),
      } },
      { provide: Dialog, useValue: { open: (component: unknown, config: { data: unknown }) => {
        opened.push({ component, data: config?.data });
        return { closed: of(dialogAnswer) };
      } } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      { provide: Router, useValue: { navigate: () => {} } },
      { provide: AuthService, useValue: { user: signal(null), canManageTasks: () => true } },
      { provide: JobEventsService, useValue: { events: EMPTY, connected: signal(false) } },
    ],
  });
  const screen = TestBed.runInInjectionContext(() => new Jobs());
  return { screen, opened, gets };
}

const JOB = { jobId: 2849, jobName: 'UI-CHECK registry chain job 0929', jobStatus: 'Active', jobRunningStatus: 'Completed', execution: 'Manual' } as any;

describe('Schedules row: Run with…', () => {
  it('opens the Run with… dialog for the job', () => {
    const { screen, opened } = jobs({}, false);
    screen.runWith(JOB);
    expect(opened).toHaveLength(1);
    expect(opened[0].component).toBe(RunWithDialog);
    expect(opened[0].data).toEqual({ jobId: 2849, jobName: 'UI-CHECK registry chain job 0929' });
  });

  it('marks the row queued once a run has started, as Run now does', () => {
    const { screen } = jobs();
    screen.jobs.set([JOB]);
    screen.runWith(JOB);
    expect(screen.jobs()[0].jobRunningStatus).toBe('Queue');
  });

  it('is withheld exactly when Run now is', () => {
    const { screen, opened } = jobs();
    screen.runWith({ ...JOB, jobStatus: 'Inactive' });
    screen.runWith({ ...JOB, jobRunningStatus: 'Running' });
    expect(opened).toHaveLength(0);
  });
});

describe('Schedules row: the inbox trigger', () => {
  const TRIGGER = { status: 'SUCCESS', data: { jobId: 2849, configured: true, enabled: true, filePattern: '*.csv' } };

  it('reads the trigger once when the row opens, and says what it takes', () => {
    const { screen, gets } = jobs({ '/sourceJob.json/inboxTrigger': TRIGGER });
    screen.toggleRow(JOB);
    expect(gets.filter(g => g.startsWith('/sourceJob.json/inboxTrigger'))).toEqual(['/sourceJob.json/inboxTrigger?jobId=2849']);
    expect(screen.triggerNote(JOB)).toBe('Every file named like *.csv that arrives in the inbox starts this job.');
    screen.toggleRow(JOB);
    screen.toggleRow(JOB);
    expect(gets.filter(g => g.startsWith('/sourceJob.json/inboxTrigger'))).toHaveLength(1);
  });

  it('says nothing for a job with no trigger', () => {
    const { screen } = jobs({ '/sourceJob.json/inboxTrigger': { status: 'SUCCESS', data: { jobId: 2849, configured: false } } });
    screen.toggleRow(JOB);
    expect(screen.triggerNote(JOB)).toBe('');
  });
});
