import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { of, throwError } from 'rxjs';
import { FileDetails, FileDetailsData } from './file-details';
import { StorageService } from './storage.service';
import { GeneratedService } from '../documents/generated/generated.service';
import { reportsFromRun } from '../documents/generated/generated.model';

/**
 * MIG-253: Storage's file panel -- what is knowable about a file: the object's own metadata, the run
 * that uploaded it when a recent run did (there is no object → run lookup, so recent runs' outputs are
 * searched), and its data policy and expiry (MIG-243 is not live: "No policy").
 */
const KEY = 'registry-live-check/customers-clean.json';
const META = { name: 'customers-clean.json', key: KEY, folder: false, size: 169, lastModified: '2026-09-29T12:07:05Z',
  etag: '"fe024a56"', contentType: 'application/json' };
const RECENT = { runsRead: 12, jobsRead: 4, failed: 0, reports: reportsFromRun(
  { jobQueueId: 7405, jobId: 2849, jobName: 'UI-CHECK registry chain job 0929', pipelineName: 'UI-CHECK registry chain task 0929',
    owner: 'Claude Demo Admin' },
  [{ runOutputId: 1001, kind: 'bucket', name: 'customers-clean.json', recordedAt: '2026-09-29T07:07:05.863214',
     bucket: 'ui-review-s3', key: KEY, stepKey: 'publish' }]) };

function details(data: FileDetailsData, opts: { meta?: 'fail'; recent?: typeof RECENT } = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: DIALOG_DATA, useValue: data },
      { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: StorageService, useValue: { objectMetadata: vi.fn(() => opts.meta === 'fail'
        ? throwError(() => ({ error: { message: 'No such object.' } })) : of({ status: 'SUCCESS', message: '', data: META })) } },
      { provide: GeneratedService, useValue: { recentOutputs: vi.fn(() => of(opts.recent ?? RECENT)) } },
    ],
  });
  const fixture = TestBed.createComponent(FileDetails);
  fixture.detectChanges();
  const text = () => (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ');
  return { fixture, d: fixture.componentInstance, text };
}

describe('Storage file details', () => {
  it('shows the object\'s size, type, modified time and checksum', () => {
    const { text } = details({ bucket: 'ui-review-s3', key: KEY, name: 'customers-clean.json' });
    expect(text()).toContain('169 B');
    expect(text()).toContain('application/json');
    expect(text()).toContain('fe024a56');
    expect(text()).toContain('Not recorded');
  });

  it('names the run and pipeline that uploaded it, when a recent run did', () => {
    const { fixture, d, text } = details({ bucket: 'ui-review-s3', key: KEY, name: 'customers-clean.json' });
    expect(d.run()?.jobQueueId).toBe(7405);
    expect(text()).toContain('Run #7405');
    expect(text()).toContain('UI-CHECK registry chain task 0929');
    const link = (fixture.nativeElement as HTMLElement).querySelector('a[href*="/runs/7405/logs"]');
    expect(link).not.toBeNull();
  });

  it('says how far it looked when no recent run wrote the file', () => {
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
});
