import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { EMPTY, of } from 'rxjs';
import { Jobs } from './jobs';
import { BackfillPanel } from '../runs/backfills/backfill-panel';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { JobEventsService } from '../../core/socket/job-events.service';

/**
 * MIG-347: a schedule's row offers "Backfill…" (beside its own runs, so a run in flight does not stop it; a switched-off
 * schedule cannot), and "Run with…" for a pipeline with run parameters as well as for one with an AI step.
 */
function jobs(answers: Record<string, unknown> = {}, dialogAnswer: unknown = null) {
  const opened: { component: unknown; data: any; config: any }[] = [];
  const navigate = vi.fn();
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: {
        get: (url: string) => {
          const path = url.replace(/^.*\/api\/v1/, '');
          return of(path in answers ? answers[path] : { status: 'SUCCESS', data: [] });
        },
        post: () => of({ status: 'SUCCESS', data: [] }),
        request: () => of({ status: 'SUCCESS' }),
      } },
      { provide: Dialog, useValue: { open: (component: unknown, config: { data: unknown }) => {
        opened.push({ component, data: config?.data, config });
        return { closed: of(dialogAnswer) };
      } } },
      { provide: ToastService, useValue: toast },
      { provide: Router, useValue: { navigate } },
      { provide: AuthService, useValue: { user: signal(null), canManageTasks: () => true, isTenantAdmin: () => true } },
      { provide: JobEventsService, useValue: { events: EMPTY, connected: signal(false) } },
    ],
  });
  const screen = TestBed.runInInjectionContext(() => new Jobs());
  return { screen, opened, navigate, toast };
}

const JOB = { jobId: 51, jobName: 'Synthetic daily intake', jobStatus: 'Active', jobRunningStatus: 'Running', execution: 'Auto' } as any;

describe('Schedules row: Backfill…', () => {
  it('opens the backfill panel over the right, even while a run is in flight', async () => {
    const { screen, opened } = jobs();
    screen.backfill(JOB);
    await Promise.resolve();
    expect(opened).toHaveLength(1);
    expect(opened[0].component).toBe(BackfillPanel);
    expect(opened[0].data).toEqual({ jobId: 51, jobName: 'Synthetic daily intake', readsCosts: true });
    expect(opened[0].config.panelClass).toContain('side-panel-right');
  });

  it('opens the started backfill in Runs › Backfills', async () => {
    const { screen, navigate, toast } = jobs({}, { backfillId: 12, total: 14 });
    screen.backfill(JOB);
    await new Promise(resolve => setTimeout(resolve));
    expect(toast.success).toHaveBeenCalledWith('Backfill #12 of Synthetic daily intake started: 14 period(s).');
    expect(navigate).toHaveBeenCalledWith(['/runs/backfills'], { queryParams: { backfill: 12 } });
  });

  it('is not offered for a switched-off schedule', async () => {
    const { screen, opened } = jobs();
    screen.backfill({ ...JOB, jobStatus: 'Inactive' });
    await Promise.resolve();
    expect(opened).toHaveLength(0);
  });
});

describe('Schedules row: Run with… for a pipeline with run parameters', () => {
  it('is offered, and named for what it chooses, once the menu has read the pipeline', () => {
    const { screen } = jobs({ '/sourceJob.json/aiModelChoice': { status: 'SUCCESS', data: { steps: [], parameters: [{ name: 'region', type: 'text' }] } } });
    expect(screen.hasRunWith(JOB)).toBe(false);
    screen.checkAiSteps(JOB);
    expect(screen.hasAiSteps(JOB)).toBe(false);
    expect(screen.hasRunWith(JOB)).toBe(true);
    expect(screen.runWithLabel(JOB)).toBe('Run with…');
  });

  it('keeps the AI wording for a pipeline whose only choice is a model', () => {
    const { screen } = jobs({ '/sourceJob.json/aiModelChoice': { status: 'SUCCESS', data: { steps: [{ stepKey: 'summary' }] } } });
    screen.checkAiSteps(JOB);
    expect(screen.runWithLabel(JOB)).toBe('Run with a different AI model…');
  });
});
