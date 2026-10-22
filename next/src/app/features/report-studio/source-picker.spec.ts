import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ReportSourcePicker, bundleOf, bundleProblem } from './source-picker';
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
