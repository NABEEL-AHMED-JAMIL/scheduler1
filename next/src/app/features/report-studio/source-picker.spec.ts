import { describe, it, expect, vi } from 'vitest';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { StorageService } from '../objects/storage.service';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { INPUT_ROWS, ReportSourcePicker, bundleOf, bundleProblem, newestRuns, stepRowsOf } from './source-picker';
import { GeneratedService } from '../documents/generated/generated.service';
import { StepsApi } from '../tasks/steps/steps.service';
import { OneFileSource, bundleParts, keepable } from './report-studio.model';

/**
 * Several files as one report's data (media e79e89c: {connector: BUNDLE, parts: {name: any one-file source}}): the picker's
 * "Several files" rows, each a name and its own one-file picker, make the bundle the inspect, preview and generate calls send.
 */
const run = (id: number): OneFileSource => ({ connector: 'RUN_OUTPUT', jobQueueId: 10, runDatasetId: id });

describe('a bundle of files', () => {
  it('is made only from named, distinct, picked files, at most eight', () => {
    expect(bundleProblem([])).toBe('Add a file.');
    expect(bundleProblem([{ name: '', source: run(1) }])).toContain('Name file 1');
    expect(bundleProblem([{ name: '2nd', source: run(1) }])).toContain('is not a name');
    expect(bundleProblem([{ name: 'a', source: run(1) }, { name: 'a', source: run(2) }])).toBe('Two files are called "a".');
    expect(bundleProblem([{ name: 'a', source: null }])).toBe('Pick the data of "a".');
    expect(bundleProblem(Array.from({ length: 9 }, (_, i) => ({ name: `f${i}`, source: run(i) })))).toBe('At most 8 files.');
    expect(bundleOf([{ name: ' summary ', source: run(1) }, { name: 'latest', source: { connector: 'INLINE_JSON', text: 'a,b\n1,2', format: 'CSV' } }]))
      .toEqual({ connector: 'BUNDLE', parts: { summary: run(1), latest: { connector: 'INLINE_JSON', text: 'a,b\n1,2', format: 'CSV' } } });
    expect(bundleOf([{ name: 'a', source: null }])).toBeNull();
  });

  it('reads its parts by name from the snapshot\'s ref, else from its label', () => {
    const label = '3 files: summary (outcomes · summary.csv) + latest (run #12 output (CSV)) + by_class (by_cl...';
    expect(bundleParts({ label })).toEqual([{ name: 'summary', label: 'outcomes · summary.csv' }, { name: 'latest', label: 'run #12 output (CSV)' },
      { name: 'by_class', label: 'by_cl' }]);
    expect(bundleParts({ label, sourceRef: { connector: 'BUNDLE', parts: { summary: {}, latest: {}, by_class: {}, reviewed: {} } } })!.map(p => p.name))
      .toEqual(['summary', 'latest', 'by_class', 'reviewed']);
    expect(bundleParts({ label: '2 files: results, accuracy · Pipeline run #8352 · save_results · brain-mri-results.csv' })).toEqual([
      { name: 'results', label: 'Pipeline run #8352 · save_results · brain-mri-results.csv' }, { name: 'accuracy', label: '' }]);
    expect(bundleParts({ label: '8 files: alpha_one, beta_two, gamma_thr…' })!.map(p => p.name)).toEqual(['alpha_one', 'beta_two']);
    expect(bundleParts({ label: 'run #12 · summary.csv' })).toBeNull();
    expect(bundleParts(null)).toBeNull();
  });

  it('may be kept as a test sample, as pasted data and a run\'s output may (media\'s saveSample)', () => {
    expect(keepable({ connector: 'BUNDLE', parts: { a: run(1) } })).toBe(true);
    expect(keepable(run(1))).toBe(true);
    expect(keepable({ connector: 'BUCKET_OBJECT', bucket: 'b', key: 'k' })).toBe(false);
    expect(keepable({ connector: 'SAMPLE', sampleId: 's' })).toBe(false);
    expect(keepable(null)).toBe(false);
  });
});

describe('the source picker\'s "Several files"', () => {
  function picker() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [ReportSourcePicker], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    const fixture = TestBed.createComponent(ReportSourcePicker);
    fixture.componentRef.setInput('mode', 'bundle');
    fixture.detectChanges();
    return { fixture, p: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('is one of the ways in, and each file picks its data one file at a time (never several again)', () => {
    const { p, el } = picker();
    expect(p.modes().map(m => m.label)).toContain('Several files');
    const files = el.querySelectorAll('section.rs-bundle-part');
    expect(files.length).toBe(2);
    const inner = files[0].querySelector('app-report-source-picker')!;
    expect(inner.textContent).toContain('Pipeline schedule');
    expect(inner.textContent).not.toContain('Several files');
    expect(p.source()).toBeNull();
  });

  it('publishes the bundle once every file is named and picked, and drops it when one is not', () => {
    const { fixture, p, el } = picker();
    p.renamePart(0, 'summary');
    p.setPart(0, { source: run(1) });
    expect(p.source()).toBeNull();
    expect(p.bundleWhy()).toBe('Name file 2: the report reads it as $.name.');
    p.renamePart(1, 'latest');
    p.setPart(1, { source: run(2) });
    expect(p.source()).toEqual({ connector: 'BUNDLE', parts: { summary: run(1), latest: run(2) } });
    const before = p.source();
    p.setPart(1, { source: run(2) });
    expect(p.source()).toBe(before);
    p.renamePart(1, 'summary');
    fixture.detectChanges();
    expect(p.source()).toBeNull();
    expect(el.textContent).toContain('Another file has this name.');
  });

  it('adds files up to eight and removes them, keeping at least one', () => {
    const { fixture, p, el } = picker();
    for (let i = 0; i < 10; i++) p.addPart();
    fixture.detectChanges();
    expect(p.parts().length).toBe(8);
    const add = [...el.querySelectorAll('button')].find(b => b.textContent!.includes('Add a file')) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(el.textContent).toContain('8 of 8');
    for (let i = 0; i < 10; i++) p.removePart(0);
    expect(p.parts().length).toBe(1);
  });
});

/**
 * ZT-R39 (AI designer retest, 2026-10-26): the Test data picker offered only the files a Save/Write step kept, so a report
 * step's own input rows -- what its design was made from -- could not be picked again. A run's step rows are offered beside
 * them, the report step's input first; a step design opens on "This step's input" from its pipeline's recent runs.
 */
describe('a report step\'s own input rows', () => {
  const later = new Date(Date.now() + 86_400_000).toISOString();
  const earlier = new Date(Date.now() - 60_000).toISOString();
  const timeline = {
    jobQueueId: 1871, jobId: 1097, runStatus: 'Completed', attempt: 1, attempts: [1], legacy: false,
    steps: [
      { stepExecutionId: 1, index: 0, key: 'visits', task: 'read_s3', status: 'Completed', datasets: [{ runDatasetId: 9101, name: 'rows', rowCount: 4, columns: [], expiresAt: later }] },
      { stepExecutionId: 2, index: 1, key: 'clean', task: 'select', status: 'Completed', datasets: [{ runDatasetId: 9102, name: 'rows', rowCount: 4, columns: [], expiresAt: earlier }] },
      { stepExecutionId: 3, index: 2, key: 'generate_report', task: 'generate_report', status: 'Completed', datasets: [] },
    ],
  };

  it('lists each step\'s live rows, the report step\'s input first (the nearest earlier step whose rows are still kept)', () => {
    const rows = stepRowsOf(timeline as any, 'generate_report');
    expect(rows.map(r => [r.stepKey, r.runDatasetId])).toEqual([['visits', 9101]]);
    expect(rows[0].name).toBe(`rows, ${INPUT_ROWS}`);
    expect(stepRowsOf(timeline as any, null)[0].name).toBe('rows, the step\'s rows');
    expect(stepRowsOf(null)).toEqual([]);
  });

  it('takes the newest runs of the pipeline\'s schedules', () => {
    expect(newestRuns([[{ jobQueueId: 3 }, { jobQueueId: 9 }], [{ jobQueueId: 7 }]], 2).map(r => r.jobQueueId)).toEqual([9, 7]);
  });

  it('opens on "This step\'s input" for a step design and picks the newest run\'s input rows', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ReportSourcePicker],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: GeneratedService, useValue: { runs: vi.fn(() => of([{ jobQueueId: 1870 }, { jobQueueId: 1871 }])), schedules: vi.fn(() => of([])),
          runOutputs: vi.fn(() => of([])) } },
        { provide: StepsApi, useValue: { timeline: vi.fn(() => of({ status: 'SUCCESS', message: '', data: timeline })) } }],
    });
    const fixture = TestBed.createComponent(ReportSourcePicker);
    fixture.componentRef.setInput('stepKey', 'generate_report');
    fixture.componentRef.setInput('stepJobs', [1097]);
    fixture.componentRef.setInput('mode', 'step');
    fixture.detectChanges();
    const p = fixture.componentInstance;
    expect(p.modes()[0]).toEqual({ id: 'step', label: 'This step\'s input' });
    expect(p.stepRunId()).toBe(1871);
    expect(p.source()).toEqual({ connector: 'RUN_OUTPUT', jobQueueId: 1871, runDatasetId: 9101 });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-step-input]')?.textContent).toContain('visits');
  });

  it('adds the step rows to a picked run\'s outputs, and picks the report step\'s input when no file was kept', () => {
    const generated = { runs: vi.fn(() => of([])), schedules: vi.fn(() => of([])), runOutputs: vi.fn(() => of([])) };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ReportSourcePicker],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: GeneratedService, useValue: generated },
        { provide: StepsApi, useValue: { timeline: vi.fn(() => of({ status: 'SUCCESS', message: '', data: timeline })) } }],
    });
    const fixture = TestBed.createComponent(ReportSourcePicker);
    fixture.componentRef.setInput('stepKey', 'generate_report');
    fixture.componentRef.setInput('mode', 'run');
    fixture.detectChanges();
    const p = fixture.componentInstance;
    p.pickJob(1097);
    p.pickRun(1871);
    expect(p.outputs().map(o => o.runDatasetId)).toEqual([9101]);
    expect(p.source()).toEqual({ connector: 'RUN_OUTPUT', jobQueueId: 1871, runDatasetId: 9101 });
    // Found on the way: an empty list of schedules was asked for again and again, without end (the effect read what it filled).
    fixture.detectChanges();
    expect(generated.schedules).toHaveBeenCalledTimes(1);
  });
});

/**
 * Owner 2026-10-27: the picker's lists say they are loading, and why they failed -- a failure no longer reads as "No runs
 * yet", "No buckets you may browse" or "This run kept no data a report can read".
 */
describe('the source picker -- loading, empty, error', () => {
  const failed = () => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' }));

  function picker(mode: string, g: { schedules?: () => Observable<unknown>; runs?: () => Observable<unknown>; runOutputs?: () => Observable<unknown> },
                  timeline: () => Observable<unknown> = () => of({ status: 'SUCCESS', message: '', data: null }),
                  buckets: () => Observable<unknown> = () => of({ status: 'SUCCESS', message: '', data: [] })) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ReportSourcePicker],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: GeneratedService, useValue: { schedules: vi.fn(g.schedules ?? (() => of([]))), runs: vi.fn(g.runs ?? (() => of([]))),
          runOutputs: vi.fn(g.runOutputs ?? (() => of([]))) } },
        { provide: StepsApi, useValue: { timeline: vi.fn(timeline) } },
        { provide: StorageService, useValue: { buckets: vi.fn(buckets) } }],
    });
    TestBed.overrideComponent(ReportSourcePicker, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(ReportSourcePicker);
    fixture.componentRef.setInput('mode', mode);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('the schedules: loading, then empty, then why they could not be read', () => {
    expect(picker('run', { schedules: () => NEVER }).jobsState.loading()).toBe(true);
    const empty = picker('run', {});
    expect(empty.jobsState.loaded()).toBe(true);
    expect(empty.jobs()).toEqual([]);
    const bad = picker('run', { schedules: failed });
    expect(bad.jobsState.loading()).toBe(false);
    expect(bad.runsError()).toContain('could not be read');
  });

  it('a schedule\'s runs: loading, then why they could not be read', () => {
    const waiting = picker('run', { runs: () => NEVER });
    waiting.pickJob(1097);
    expect(waiting.runsState.loading()).toBe(true);
    const bad = picker('run', { runs: failed });
    bad.pickJob(1097);
    expect(bad.runsState.loading()).toBe(false);
    expect(bad.runsState.error()).toBe('The runs could not be read.');
  });

  it('a run\'s outputs: both reads failing is said, not "kept no data"', () => {
    const p = picker('run', { runOutputs: failed }, failed);
    p.pickJob(1097);
    p.pickRun(1871);
    expect(p.outputsState.loading()).toBe(false);
    expect(p.outputsState.error()).toBe('The run\'s outputs could not be read.');
    expect(p.outputs()).toEqual([]);
  });

  it('the buckets: a failure is said, not "No buckets you may browse"', () => {
    const p = picker('bucket', {}, undefined, failed);
    expect(p.bucketsState.error()).toBe('The buckets could not be read.');
    expect(p.buckets()).toEqual([]);
  });
});
