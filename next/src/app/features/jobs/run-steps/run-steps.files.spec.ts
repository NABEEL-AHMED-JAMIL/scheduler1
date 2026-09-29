import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RunSteps } from './run-steps';
import { API_SUCCESS } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { attachmentName } from './run-steps.model';

/**
 * Wave 4 (Core 0691705 + ce8e421): a run's datasets download as csv, json or jsonl (sourceJob.json/runDataset), and the
 * run's page lists what the run put out (sourceJob.json/runOutputs): the files it kept, which download until they
 * expire, and the bucket uploads, which download from storage like any other object.
 */
const step = (index: number, key: string, task: string, datasets: unknown[] = []) => ({
  stepExecutionId: 1048 + index, index, key, task, status: 'Completed', durationMs: 20, recordsIn: 3, recordsOut: 3,
  tries: 1, onError: 'fail', error: null, datasets, log: 'step',
});

const ENGINE = {
  jobQueueId: 7405, jobId: 2849, runStatus: 'Completed', attempt: 1, attempts: [1], legacy: false,
  steps: [
    step(0, 'read', 'read_file', [{ runDatasetId: 1048, name: 'output', rowCount: 3, columns: ['customer_id'] }]),
    step(3, 'out', 'save_file', [{ runDatasetId: 1051, name: 'customers-clean.json', rowCount: 3, columns: ['customer_id'] }]),
    step(4, 'publish', 'upload_bucket'),
  ],
  aiSteps: [],
};

const KEPT = { runOutputId: 1000, stepExecutionId: 1052, attempt: 1, stepIndex: 3, stepKey: 'out', task: 'save_file',
  kind: 'file', name: 'customers-clean.json', format: 'json', rowCount: 3, byteCount: 169,
  recordedAt: '2026-09-29T07:07:05.699379', runDatasetId: 1051, expiresAt: '2026-09-30T07:07:05.698', expired: false };
const UPLOAD = { runOutputId: 1001, stepExecutionId: 1053, attempt: 1, stepIndex: 4, stepKey: 'publish', task: 'upload_bucket',
  kind: 'bucket', name: 'customers-clean.json', format: 'json', rowCount: 3, byteCount: 169,
  recordedAt: '2026-09-29T07:07:05.863214', bucket: 'ui-review-s3', key: 'registry-live-check/customers-clean.json' };

function mount(outputs: unknown[] | 'fail' = [KEPT, UPLOAD]) {
  const errors: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [RunSteps], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
    { provide: ToastService, useValue: { success: () => {}, info: () => {}, error: (m: string) => errors.push(m) } }] });
  const fixture = TestBed.createComponent(RunSteps);
  fixture.componentRef.setInput('jobQueueId', '7405');
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  http.expectOne(r => r.url.endsWith('/sourceJob.json/stepExecutions')).flush({ status: API_SUCCESS, data: ENGINE });
  const files = http.expectOne(r => r.url.endsWith('/sourceJob.json/runOutputs'));
  if (outputs === 'fail') files.flush({ status: 'ERROR', message: 'No.' });
  else files.flush({ status: API_SUCCESS, data: { jobQueueId: 7405, jobId: 2849, attempt: 1, outputs } });
  fixture.detectChanges();
  return { fixture, http, files, errors, el: fixture.nativeElement as HTMLElement, component: fixture.componentInstance };
}

describe('RunSteps: downloads', () => {
  const saved: string[] = [];
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  const capture = () => {
    URL.createObjectURL = () => 'blob:x';
    URL.revokeObjectURL = () => {};
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { saved.push(this.download); });
  };
  afterEach(() => {
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
    vi.restoreAllMocks();
    saved.length = 0;
  });
  const tick = () => new Promise(resolve => setTimeout(resolve));

  it('reads the file name the server gives', () => {
    expect(attachmentName('attachment; filename="customers-clean.csv"')).toBe('customers-clean.csv');
    expect(attachmentName("attachment; filename*=UTF-8''caf%C3%A9.jsonl")).toBe('café.jsonl');
    expect(attachmentName(null)).toBe('');
  });

  it('offers each step dataset in csv, json and jsonl', () => {
    const { el } = mount();
    const out = el.querySelector<HTMLElement>('.exec-step[data-step="out"]')!;
    expect(out.querySelector('[aria-label="Download customers-clean.json from step out"]')).not.toBeNull();
    expect(el.querySelectorAll('.exec-step [aria-label^="Download"]').length).toBe(2);
  });

  it('downloads a dataset as a blob, named as the server names it', async () => {
    capture();
    const { component, http } = mount();
    component.downloadDataset(1051, 'csv', 'customers-clean.json');
    const req = http.expectOne(r => r.url.endsWith('/sourceJob.json/runDataset'));
    expect(req.request.params.get('runDatasetId')).toBe('1051');
    expect(req.request.params.get('format')).toBe('csv');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['customer_id,name,balance\n']), { headers: { 'Content-Disposition': 'attachment; filename="customers-clean.csv"' } });
    await tick();
    expect(saved).toEqual(['customers-clean.csv']);
  });

  it('falls back to the dataset\'s name with the format when the server gives none', async () => {
    capture();
    const { component, http } = mount();
    component.downloadDataset(1048, 'jsonl', 'output');
    http.expectOne(r => r.url.endsWith('/sourceJob.json/runDataset')).flush(new Blob(['{}\n']));
    await tick();
    expect(saved).toEqual(['output.jsonl']);
  });

  it('shows the server\'s refusal, read out of the blob', async () => {
    const { component, http, errors } = mount();
    component.downloadDataset(1051, 'csv', 'customers-clean.json');
    http.expectOne(r => r.url.endsWith('/sourceJob.json/runDataset')).flush(
      new Blob([JSON.stringify({ status: 'ERROR', message: 'This dataset expired on 30 Sep.' })]), { status: 410, statusText: 'Gone' });
    await tick();
    await tick();
    expect(errors).toEqual(['This dataset expired on 30 Sep.']);
    expect(component.busy()).toBe('');
  });
});

describe('RunSteps: the run\'s Files', () => {
  it('asks for the shown attempt\'s outputs', () => {
    const { files } = mount();
    expect(files.request.params.get('jobQueueId')).toBe('7405');
    expect(files.request.params.get('attempt')).toBe('1');
  });

  it('lists the kept file and the bucket upload', () => {
    const { el } = mount();
    const rows = [...el.querySelectorAll<HTMLElement>('.exec-file')];
    expect(rows.map(r => r.dataset['kind'])).toEqual(['file', 'bucket']);
    expect(rows[0].textContent).toContain('customers-clean.json');
    expect(rows[0].textContent).toContain('3 rows');
    expect(rows[0].textContent).toContain('Kept until');
    expect(rows[1].textContent).toContain('ui-review-s3');
    expect(rows[1].textContent).toContain('registry-live-check/customers-clean.json');
  });

  it('downloads a kept file through its dataset, in its own format', () => {
    const { el, http } = mount();
    el.querySelector<HTMLButtonElement>('.exec-file[data-kind="file"] [data-format="json"]')!.click();
    const req = http.expectOne(r => r.url.endsWith('/sourceJob.json/runDataset'));
    expect(req.request.params.get('runDatasetId')).toBe('1051');
    expect(req.request.params.get('format')).toBe('json');
  });

  // MIG-255: a render_pdf report is kept like a file, and downloads only as the PDF it is.
  it('offers a PDF report only as its PDF', () => {
    const report = { ...KEPT, runOutputId: 1002, stepKey: 'report', task: 'render_pdf', name: 'wound-report.pdf', format: 'pdf', runDatasetId: 1060 };
    const { el, http } = mount([report]);
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('.exec-file[data-kind="file"] [data-format]')];
    expect(buttons.map(b => b.dataset['format'])).toEqual(['pdf']);
    buttons[0].click();
    const req = http.expectOne(r => r.url.endsWith('/sourceJob.json/runDataset'));
    expect(req.request.params.get('runDatasetId')).toBe('1060');
    expect(req.request.params.get('format')).toBe('pdf');
  });

  it('downloads an upload from storage, by its alias and key', () => {
    const { el, http } = mount();
    el.querySelector<HTMLButtonElement>('.exec-file[data-kind="bucket"] button')!.click();
    const req = http.expectOne(r => r.url.endsWith('/storage.json/downloadObject'));
    expect(req.request.params.get('bucket')).toBe('ui-review-s3');
    expect(req.request.params.get('key')).toBe('registry-live-check/customers-clean.json');
  });

  it('says an expired file has expired, and offers no download', () => {
    const { el } = mount([{ ...KEPT, expired: true }]);
    const row = el.querySelector<HTMLElement>('.exec-file')!;
    expect(row.textContent).toContain('Expired');
    expect([...row.querySelectorAll('button')].every(b => b.disabled)).toBe(true);
  });

  it('says so when the run recorded no files', () => {
    const { el } = mount([]);
    expect(el.querySelector('.exec-files')?.textContent).toContain('No files were recorded for this run.');
  });

  it('says so when the files could not be read', () => {
    const { el } = mount('fail');
    expect(el.querySelector('.exec-files')?.textContent).toContain('The run\'s files could not be read.');
  });
});
