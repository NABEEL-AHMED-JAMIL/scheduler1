import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { JobRun } from './job-assistant.answers';
import { JobAssistant } from './job-assistant';

/**
 * Owner 2026-10-27: the run history is its own read. Until it answers -- or after it failed -- an answer built from
 * it says so rather than "0 runs", and an answer's runs block sorts by its headings.
 */
const JOB = 2395;
const ok = (data: unknown) => ({ status: 'SUCCESS', message: '', data });
const RUNS: JobRun[] = [
  { jobQueueId: 5530, jobStatus: 'Completed', startTime: '2026-09-14T15:54:59', endTime: '2026-09-14T15:55:08' },
  { jobQueueId: 5528, jobStatus: 'Failed', startTime: '2026-09-14T15:50:00', endTime: '2026-09-14T15:50:04' },
  { jobQueueId: 5529, jobStatus: 'Completed', startTime: '2026-09-14T15:52:00', endTime: '2026-09-14T15:52:09' },
];

describe('Schedule assistant -- the run history read (owner 2026-10-27)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    try { localStorage.clear(); } catch { /* none */ }
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  /** Builds the component and lands the schedule's record; the runs request is left to the case. */
  function mount() {
    const fixture = TestBed.createComponent(JobAssistant);
    fixture.componentRef.setInput('jobId', String(JOB));
    fixture.detectChanges();
    http.expectOne(r => r.url.includes('fetchSourceJobDetailWithSourceJobId'))
      .flush(ok({ jobId: JOB, jobName: 'Nightly', jobStatus: 'Active', execution: 'Manual', taskDetail: {} }));
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, runs: http.expectOne(r => r.url.includes('fetchSourceJobQueueListWithJobId')) };
  }

  it('is loading, and a stats answer waits instead of saying 0 runs', () => {
    const { component } = mount();
    expect(component.runsState.pending()).toBe(true);
    expect(component.runsState.loading()).toBe(true);
    component.askPreset('stats', 'Show the run statistics');
    const block = component.turns()[0].answer.blocks[0] as { text: string };
    expect(block.text).toContain('still being read');
  });

  it('answers from an empty history once it has arrived', () => {
    const { component, runs } = mount();
    runs.flush(ok({ jobQueues: [] }));
    expect(component.runsState.pending()).toBe(false);
    component.askPreset('stats', 'Show the run statistics');
    expect(component.turns()[0].answer.refused).toBeFalsy();
  });

  it('says the runs could not be read when the read fails, and the answer says so too', () => {
    const { component, runs } = mount();
    runs.flush('boom', { status: 500, statusText: 'Server Error' });
    expect(component.runsState.loading()).toBe(false);
    expect(component.runsState.error()).toBe("This schedule's runs could not be read.");
    component.askPreset('history', 'Show the recent run history');
    expect(component.turns()[0].answer.refused).toBe(true);
    // Try again reads the runs alone.
    component.loadRuns();
    http.expectOne(r => r.url.includes('fetchSourceJobQueueListWithJobId')).flush(ok({ jobQueues: RUNS }));
    expect(component.runsState.loaded()).toBe(true);
  });

  it('sorts an answer\'s runs block by run number both ways', () => {
    const { component, runs } = mount();
    runs.flush(ok({ jobQueues: RUNS }));
    expect(component.runSort.apply(RUNS).map(r => r.jobQueueId)).toEqual([5530, 5528, 5529]);
    component.runSort.toggle('run');
    expect(component.runSort.apply(RUNS).map(r => r.jobQueueId)).toEqual([5530, 5529, 5528]);
    component.runSort.toggle('run');
    expect(component.runSort.apply(RUNS).map(r => r.jobQueueId)).toEqual([5528, 5529, 5530]);
  });

  afterEach(() => {
    http.match(r => r.url.includes('fetchAllAgents')).forEach(r => r.flush(ok([])));
    http.verify({ ignoreCancelled: true });
  });
});
