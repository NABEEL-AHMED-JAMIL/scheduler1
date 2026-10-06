import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { JobAssistant } from './job-assistant';
import { ToastService } from '../../../shared/ui/toast.service';
import { DictationService } from '../../../shared/ui/dictation.service';
import { JobRun } from './job-assistant.answers';

/** The stats answer's four figures, drawn by app-stat-strip. */
function assistant() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: { get: () => of({ status: 'SUCCESS', data: {} }), post: () => of({ status: 'SUCCESS', data: {} }) } },
    { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
    { provide: DictationService, useValue: {} },
  ] });
  return TestBed.runInInjectionContext(() => new JobAssistant());
}

const run = (jobStatus: string, seconds?: number): JobRun => ({
  jobStatus,
  startTime: seconds === undefined ? undefined : '2026-09-24T09:00:00Z',
  endTime: seconds === undefined ? undefined : new Date(Date.UTC(2026, 8, 24, 9, 0, seconds)).toISOString(),
} as JobRun);

describe('the assistant stats strip', () => {
  it('shows runs, success rate, average and longest in that order', () => {
    const a = assistant();
    a.runs.set([run('Completed', 60), run('Completed', 120), run('Failed', 180), run('Queue')]);
    expect(a.statTiles().map(t => t.label)).toEqual(['Runs', 'Success rate', 'Average', 'Longest']);
    expect(a.statTiles()[0].value).toBe(4);
    expect(a.statTiles()[1].value).toBe('67%');
    expect(a.statTiles()[3].value).toBe(a.humanDuration(180));
  });

  it('shows a dash for the success rate when no run reached a verdict', () => {
    const a = assistant();
    a.runs.set([run('Queue'), run('Skip')]);
    expect(a.statTiles()[1].value).toBe('—');
  });
});
