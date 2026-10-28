import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { NEVER, of, throwError } from 'rxjs';
import { FileDetails, FileDetailsData } from './file-details';
import { StorageService } from './storage.service';
import { GeneratedService } from '../documents/generated/generated.service';
import { reportsFromRun } from '../documents/generated/generated.model';

/**
 * MIG-253: Storage's file panel -- what is knowable about a file: the object's own metadata, the run
 * that uploaded it (Core's object → run lookup since 2026-10-20; the recent runs' outputs searched only
 * when Core cannot be asked), and its data policy and expiry (MIG-243 is not live: "No policy").
 */
const KEY = 'registry-live-check/customers-clean.json';
const META = { name: 'customers-clean.json', key: KEY, folder: false, size: 169, lastModified: '2026-09-29T12:07:05Z',
  etag: '"fe024a56"', contentType: 'application/json' };
const RECENT = { runsRead: 12, jobsRead: 4, failed: 0, reports: reportsFromRun(
  { jobQueueId: 7405, jobId: 2849, jobName: 'UI-CHECK registry chain job 0929', pipelineName: 'UI-CHECK registry chain task 0929',
    owner: 'Claude Demo Admin' },
  [{ runOutputId: 1001, kind: 'bucket', name: 'customers-clean.json', recordedAt: '2026-09-29T07:07:05.863214',
     bucket: 'ui-review-s3', key: KEY, stepKey: 'publish' }]) };

/** What Core's sourceJob.json/objectWriter answered, as GeneratedService hands it on. */
const WRITER = { id: 'writer-8380', name: 'statistics.csv', type: 'CSV', origin: 'run-bucket' as const, created: '2026-10-19T05:47:06.939323',
  status: 'In storage' as const, owner: 'Riverside Health admin', bucket: 'riverside-health-s3', key: 'datasets/readmission/results/statistics.csv',
  jobQueueId: 8380, jobId: 2905, jobName: 'Hospital readmission risk (daily)', pipeline: 'Hospital readmission risk' };

function details(data: FileDetailsData, opts: { meta?: 'fail' | 'never'; recent?: typeof RECENT; writer?: typeof WRITER | null | 'fail' } = {}) {
  const writer = opts.writer === undefined ? 'fail' : opts.writer;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: DIALOG_DATA, useValue: data },
      { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: StorageService, useValue: { objectMetadata: vi.fn(() => opts.meta === 'never' ? NEVER : opts.meta === 'fail'
        ? throwError(() => ({ status: 404, error: { message: 'No such object.' } })) : of({ status: 'SUCCESS', message: '', data: META })) } },
      { provide: GeneratedService, useValue: {
        objectWriter: vi.fn(() => writer === 'fail' ? throwError(() => new Error('404')) : of(writer)),
        recentOutputs: vi.fn(() => of(opts.recent ?? RECENT)) } },
    ],
  });
  const fixture = TestBed.createComponent(FileDetails);
  fixture.detectChanges();
  const text = () => (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ');
  const generated = TestBed.inject(GeneratedService) as unknown as { recentOutputs: ReturnType<typeof vi.fn>; objectWriter: ReturnType<typeof vi.fn> };
  return { fixture, d: fixture.componentInstance, text, generated };
}

describe('Storage file details', () => {
  it('shows the object\'s size, type, modified time and checksum', () => {
    const { text } = details({ bucket: 'ui-review-s3', key: KEY, name: 'customers-clean.json' });
    expect(text()).toContain('169 B');
    expect(text()).toContain('application/json');
    expect(text()).toContain('fe024a56');
    expect(text()).toContain('Not recorded');
  });

  // 2026-10-20: the eleventh most recently run schedule's upload was "not written by any recent run".
  it('names the run that wrote it from Core\'s lookup, however long ago, without searching recent runs', () => {
    const { fixture, d, text, generated } = details({ bucket: 'riverside-health-s3', key: WRITER.key, name: 'statistics.csv' },
      { writer: WRITER });
    expect(generated.objectWriter).toHaveBeenCalledWith('riverside-health-s3', WRITER.key);
    expect(generated.recentOutputs).not.toHaveBeenCalled();
    expect(d.run()?.jobQueueId).toBe(8380);
    expect(text()).toContain('Run #8380');
    expect(text()).toContain('Hospital readmission risk (daily)');
    expect((fixture.nativeElement as HTMLElement).querySelector('a[href*="/schedules/2905/runs/8380"]')).not.toBeNull();
  });

  it('says no run the reader can read wrote it when Core finds none, and does not claim it looked only at recent runs', () => {
    const { d, text, generated } = details({ bucket: 'ui-review-s3', key: 'by-hand.csv', name: 'by-hand.csv' }, { writer: null });
    expect(d.run()).toBeNull();
    expect(generated.recentOutputs).not.toHaveBeenCalled();
    expect(text()).toContain('No run you can read wrote this file.');
    expect(text()).not.toContain('most recent runs');
  });

  it('names the run and pipeline that uploaded it, when a recent run did (Core could not be asked)', () => {
    const { fixture, d, text } = details({ bucket: 'ui-review-s3', key: KEY, name: 'customers-clean.json' });
    expect(d.run()?.jobQueueId).toBe(7405);
    expect(text()).toContain('Run #7405');
    expect(text()).toContain('UI-CHECK registry chain task 0929');
    const link = (fixture.nativeElement as HTMLElement).querySelector('a[href*="/runs/7405"]');
    expect(link).not.toBeNull();
  });

  it('says how far it looked when no recent run wrote the file (Core could not be asked)', () => {
    const { d, text } = details({ bucket: 'ui-review-s3', key: 'elsewhere.csv', name: 'elsewhere.csv' });
    expect(d.run()).toBeNull();
    expect(text()).toContain('Not written by any of the 12 most recent runs');
  });

  it('shows no policy and no expiry until data policies are live', () => {
    const { text } = details({ bucket: 'ui-review-s3', key: KEY, name: 'customers-clean.json' });
    expect(text()).toContain('No policy');
    expect(text()).toContain('Never');
  });

  it('says so when the object cannot be read, and keeps what it knows', () => {
    const { text } = details({ bucket: 'ui-review-s3', key: KEY, name: 'customers-clean.json', size: 169 }, { meta: 'fail' });
    expect(text()).toContain('No such object.');
    expect(text()).toContain('169 B');
  });

  it('offers Try again when the metadata cannot be read (owner 2026-10-27)', () => {
    const { d, fixture } = details({ bucket: 'ui-review-s3', key: KEY, name: 'customers-clean.json', size: 169 }, { meta: 'fail' });
    expect(d.metaLoading()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('app-inline-status')?.textContent).toContain('Try again');
  });

  it('shows the checksum as loading, not as none, until the metadata answers (owner 2026-10-27)', () => {
    const { d, text, fixture } = details({ bucket: 'ui-review-s3', key: KEY, name: 'customers-clean.json', size: 169 }, { meta: 'never' });
    expect(d.metaLoading()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-file-details] dd app-loading')).not.toBeNull();
    expect(text()).toContain('169 B');
  });

  it('offers Try again when the recent runs could not be read, and searches again (owner 2026-10-27)', () => {
    const { d, generated, fixture } = details({ bucket: 'ui-review-s3', key: KEY, name: 'customers-clean.json' });
    generated.recentOutputs.mockReturnValue(throwError(() => new Error('down')));
    d.retryRuns();
    fixture.detectChanges();
    expect(d.runsSearched()).toBe(-1);
    generated.recentOutputs.mockReturnValue(of(RECENT));
    d.retryRuns();
    expect(d.runsSearched()).not.toBe(-1);
  });
});
