import { describe, it, expect, vi, afterEach } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { StepsApi } from './steps.service';
import { FOLLOW_MS, RunDrawer } from './run-drawer';
import { SampleDialog } from './sample-dialog';

/**
 * MIG-249: what Run now started, followed until it ends -- the run's status, each step's status, time, rows in and
 * out and datasets, and a step's own log on request. And Test with sample's rows, checked before they are used.
 */
const step = (key: string, index: number, status: string) => ({
  stepExecutionId: 1000 + index, index, key, task: index ? 'select' : 'sample', status, durationMs: 18, recordsIn: index ? 2 : 0,
  recordsOut: 2, tries: 1, statusMessage: `Completed in 0.0 s: ${index ? 2 : 0} in, 2 out.`, error: null,
  datasets: [{ runDatasetId: 1000 + index, name: 'output', rowCount: 2, columns: ['id', 'name'] }], log: 'step',
});

function drawer(answers: unknown[]) {
  const timeline = vi.fn();
  for (const a of answers) timeline.mockReturnValueOnce(of(a));
  timeline.mockReturnValue(of(answers[answers.length - 1]));
  const api = {
    timeline,
    stepLog: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { stepExecutionId: 1000, stepKey: 'read', attempt: 1, lines: [
      { lineNo: 1, level: 'INFO', message: '2 sample row(s).', loggedAt: '2026-09-28T23:15:02.837348' },
    ] } })),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [RunDrawer],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: StepsApi, useValue: api },
      { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: DIALOG_DATA, useValue: { jobQueueId: 7401, jobId: 2848, jobName: 'UI-CHECK step engine job 0928' } },
    ],
  });
  const fixture = TestBed.createComponent(RunDrawer);
  fixture.detectChanges();
  return { fixture, api, el: fixture.nativeElement as HTMLElement, drawer: fixture.componentInstance };
}

describe('RunDrawer', () => {
  afterEach(() => vi.useRealTimers());

  it('follows a run until it and its steps are done', () => {
    vi.useFakeTimers();
    const { fixture, api, el, drawer: d } = drawer([
      { status: 'SUCCESS', message: '', data: { jobQueueId: 7401, jobId: 2848, runStatus: 'Queue', attempt: 1, attempts: [1], legacy: false, steps: [] } },
      { status: 'SUCCESS', message: '', data: { jobQueueId: 7401, jobId: 2848, runStatus: 'Running', attempt: 1, attempts: [1], legacy: false, steps: [step('read', 0, 'Completed'), step('keep', 1, 'Running')] } },
      { status: 'SUCCESS', message: '', data: { jobQueueId: 7401, jobId: 2848, runStatus: 'Completed', attempt: 1, attempts: [1], legacy: false, steps: [step('read', 0, 'Completed'), step('keep', 1, 'Completed')] } },
    ]);
    expect(d.following()).toBe(true);
    vi.advanceTimersByTime(FOLLOW_MS);
    vi.advanceTimersByTime(FOLLOW_MS);
    fixture.detectChanges();
    expect(api.timeline).toHaveBeenCalledTimes(3);
    expect(d.following()).toBe(false);
    vi.advanceTimersByTime(FOLLOW_MS * 3);
    expect(api.timeline).toHaveBeenCalledTimes(3);
    const rows = Array.from(el.querySelectorAll('[data-run-step]'));
    expect(rows.map(r => r.getAttribute('data-run-step'))).toEqual(['read', 'keep']);
    expect(rows[1].textContent).toContain('Completed');
    expect(rows[1].textContent).toContain('2 in → 2 out');
    expect(rows[1].textContent).toContain('output: 2 row(s) · id, name');
  });

  it('shows a step\'s own log on request', () => {
    const done = { status: 'SUCCESS', message: '', data: { jobQueueId: 7401, jobId: 2848, runStatus: 'Completed', attempt: 1, attempts: [1], legacy: false, steps: [step('read', 0, 'Completed')] } };
    const { fixture, api, el } = drawer([done]);
    const show = Array.from(el.querySelectorAll('button')).find(b => b.textContent!.trim() === 'Show log')!;
    show.click();
    fixture.detectChanges();
    expect(api.stepLog).toHaveBeenCalledWith(1000);
    expect(el.querySelector('.run-log')!.textContent).toContain('2 sample row(s).');
  });
});

describe('SampleDialog', () => {
  function dialog(rows: Record<string, unknown>[]) {
    const ref = { close: vi.fn() };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SampleDialog],
      providers: [provideZonelessChangeDetection(), { provide: DialogRef, useValue: ref }, { provide: DIALOG_DATA, useValue: { rows } }],
    });
    const fixture = TestBed.createComponent(SampleDialog);
    fixture.detectChanges();
    return { fixture, ref, el: fixture.nativeElement as HTMLElement, d: fixture.componentInstance };
  }

  it('starts from the rows the first sample step holds, and hands back the rows typed', () => {
    const { el, d, ref } = dialog([{ id: 1 }]);
    expect(JSON.parse(el.querySelector<HTMLTextAreaElement>('#sampleRows')!.value)).toEqual([{ id: 1 }]);
    d.type('[{"id": 2, "name": "Cy"}]');
    d.use();
    expect(ref.close).toHaveBeenCalledWith([{ id: 2, name: 'Cy' }]);
  });

  it('will not use rows the sample task would refuse', () => {
    const { d, ref } = dialog([]);
    d.type('[{"nested": {"a": 1}}]');
    d.use();
    expect(d.error()).toContain('a value is text');
    expect(ref.close).not.toHaveBeenCalled();
  });
});
