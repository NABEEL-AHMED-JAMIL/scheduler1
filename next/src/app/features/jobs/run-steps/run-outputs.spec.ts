import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_SUCCESS } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { RunOutputs } from './run-outputs';
import { RunTimelineStore } from './run-timeline.store';
import { attachmentName } from './run-steps.model';

/**
 * Wave 4 (Core 0691705 + ce8e421), on the run page's Outputs tab: the files the run kept download through their dataset
 * until they expire, the bucket uploads from storage like any other object; a datasets downloads as csv, json or jsonl
 * (sourceJob.json/runDataset). Run page fix: each says what it is -- a PDF by pages and size, never "1 row".
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
  TestBed.configureTestingModule({ imports: [RunOutputs], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
    RunTimelineStore, { provide: ToastService, useValue: { success: () => {}, info: () => {}, error: (m: string) => errors.push(m) } }] });
  const fixture = TestBed.createComponent(RunOutputs);
  const store = TestBed.inject(RunTimelineStore);
  const http = TestBed.inject(HttpTestingController);
  store.load('7405');
  http.expectOne(r => r.url.endsWith('/sourceJob.json/stepExecutions')).flush({ status: API_SUCCESS, data: ENGINE });
  const files = http.expectOne(r => r.url.endsWith('/sourceJob.json/runOutputs'));
  if (outputs === 'fail') files.flush({ status: 'ERROR', message: 'No.' });
  else files.flush({ status: API_SUCCESS, data: { jobQueueId: 7405, jobId: 2849, attempt: 1, outputs } });
  fixture.detectChanges();
  return { fixture, http, files, errors, store, el: fixture.nativeElement as HTMLElement };
}

describe('Run page: downloads', () => {
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

  it('downloads a dataset as a blob, named as the server names it', async () => {
    capture();
    const { store, http } = mount();
    store.downloadDataset(1051, 'csv', 'customers-clean.json');
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
    const { store, http } = mount();
    store.downloadDataset(1048, 'jsonl', 'output');
    http.expectOne(r => r.url.endsWith('/sourceJob.json/runDataset')).flush(new Blob(['{}\n']));
    await tick();
    expect(saved).toEqual(['output.jsonl']);
  });

  it('shows the server\'s refusal, read out of the blob', async () => {
    const { store, http, errors } = mount();
    store.downloadDataset(1051, 'csv', 'customers-clean.json');
    http.expectOne(r => r.url.endsWith('/sourceJob.json/runDataset')).flush(
      new Blob([JSON.stringify({ status: 'ERROR', message: 'This dataset expired on 30 Sep.' })]), { status: 410, statusText: 'Gone' });
    await tick();
    await tick();
    expect(errors).toEqual(['This dataset expired on 30 Sep.']);
    expect(store.busy()).toBe('');
  });
});

describe('Run page: the Outputs tab', () => {
  it('asks for the shown attempt\'s outputs', () => {
    const { files } = mount();
    expect(files.request.params.get('jobQueueId')).toBe('7405');
    expect(files.request.params.get('attempt')).toBe('1');
  });

  it('lists the kept file and the bucket upload, each by type, rows and size', () => {
    const { el } = mount();
    const rows = [...el.querySelectorAll<HTMLElement>('.exec-file')];
    expect(rows.map(r => r.dataset['kind'])).toEqual(['file', 'bucket']);
    expect(rows[0].textContent).toContain('customers-clean.json');
    expect(rows[0].querySelector('[data-test="output-label"]')?.textContent).toBe('3 rows · 169 B');
    expect(rows[0].textContent).toContain('With the run · until');
    expect(rows[1].textContent).toContain('ui-review-s3');
    expect(rows[1].textContent).toContain('registry-live-check/customers-clean.json');
  });

  it('downloads a kept file through its dataset, in the format picked from its Download menu', () => {
    const { el, http, fixture } = mount();
    el.querySelector<HTMLButtonElement>('.exec-file[data-kind="file"] [data-test="download"]')!.click();
    fixture.detectChanges();
    const items = [...document.body.querySelectorAll<HTMLButtonElement>('[cdkmenuitem][data-format], .menu-item[data-format]')];
    expect(items.map(b => b.dataset['format'])).toEqual(['csv', 'json', 'jsonl']);
    items.find(b => b.dataset['format'] === 'json')!.click();
    const req = http.expectOne(r => r.url.endsWith('/sourceJob.json/runDataset'));
    expect(req.request.params.get('runDatasetId')).toBe('1051');
    expect(req.request.params.get('format')).toBe('json');
  });

  // MIG-255: a render_pdf report is kept like a file, and downloads only as the PDF it is -- and reads as one.
  it('offers a PDF report only as its PDF, said by its pages and size', () => {
    const report = { ...KEPT, runOutputId: 1002, stepKey: 'report', task: 'render_pdf', name: 'wound-report.pdf', format: 'pdf',
      rowCount: 1, byteCount: 22359, pageCount: 2, runDatasetId: 1060 };
    const { el, http } = mount([report, { ...report, runOutputId: 1003, pageCount: null }]);
    const labels = [...el.querySelectorAll('[data-test="output-label"]')].map(l => l.textContent);
    expect(labels).toEqual(['2 pages · 21.8 KB', '21.8 KB']);
    expect(el.textContent).not.toContain('1 row');
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('.exec-file[data-kind="file"]')][0].querySelectorAll<HTMLButtonElement>('[data-format]');
    expect([...buttons].map(b => b.dataset['format'])).toEqual(['pdf']);
    buttons[0].click();
    const req = http.expectOne(r => r.url.endsWith('/sourceJob.json/runDataset'));
    expect(req.request.params.get('runDatasetId')).toBe('1060');
    expect(req.request.params.get('format')).toBe('pdf');
  });

  it('downloads an upload from storage, by its alias and key', () => {
    const { el, http } = mount();
    el.querySelector<HTMLButtonElement>('.exec-file[data-kind="bucket"] button:not([data-test="visualise"]):not([data-test="view"])')!.click();
    const req = http.expectOne(r => r.url.endsWith('/storage.json/downloadObject'));
    expect(req.request.params.get('bucket')).toBe('ui-review-s3');
    expect(req.request.params.get('key')).toBe('registry-live-check/customers-clean.json');
  });

  it('offers Visualise for a table the run put out, in the row\'s more menu (MIG-357)', () => {
    const { el, fixture } = mount();
    el.querySelector<HTMLButtonElement>('.exec-file[data-kind="bucket"] [data-test="output-more"]')!.click();
    fixture.detectChanges();
    expect(document.body.querySelector('[data-test="visualise"]')).not.toBeNull();
  });

  it('groups the files by the step that made them, and a group folds (owner 2026-10-20)', () => {
    const { el, fixture } = mount();
    const groups = [...el.querySelectorAll<HTMLButtonElement>('[data-test="output-group"]')];
    expect(groups.map(g => g.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['Step 4 · out · 1 file', 'Step 5 · publish · 1 file']);
    groups[0].click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.exec-file').length).toBe(1);
  });

  it('says an expired file has expired, and offers no download', () => {
    const { el } = mount([{ ...KEPT, expired: true }]);
    const row = el.querySelector<HTMLElement>('.exec-file')!;
    expect(row.textContent).toContain('Expired');
    expect([...row.querySelectorAll<HTMLButtonElement>('button:not([data-test="output-more"])')].every(b => b.disabled)).toBe(true);
  });

  it('lists a sensitive pipeline\'s file the person may not have, locked: no View, no Download (ZT-M21)', () => {
    const refusal = 'This pipeline\'s files are sensitive: downloading, viewing or previewing them needs the Download sensitive files permission. Ask your workspace admin.';
    const { el } = mount([{ ...KEPT, sensitive: true, downloadable: false, refusal }]);
    const row = el.querySelector<HTMLElement>('.exec-file')!;
    expect(row.textContent).toContain('customers-clean.json');
    const lock = row.querySelector<HTMLElement>('[data-test="sensitive-file"]')!;
    expect(lock.textContent).toContain('needs Download sensitive files');
    expect(lock.title).toBe(refusal);
    expect([...row.querySelectorAll<HTMLButtonElement>('button:not([data-test="output-more"])')].every(b => b.disabled)).toBe(true);
  });

  it('offers a sensitive pipeline\'s file as any to a person who holds the permission (ZT-M21)', () => {
    const { el } = mount([{ ...KEPT, sensitive: true, downloadable: true }]);
    const row = el.querySelector<HTMLElement>('.exec-file')!;
    expect(row.querySelector('[data-test="sensitive-file"]')).toBeNull();
    expect([...row.querySelectorAll<HTMLButtonElement>('button:not([data-test="output-more"])')].some(b => !b.disabled)).toBe(true);
  });

  it('says so when the run recorded no files', () => {
    const { el } = mount([]);
    expect(el.textContent).toContain('No files were recorded for this run.');
  });

  it('says so when the files could not be read', () => {
    const { el } = mount('fail');
    expect(el.textContent).toContain('The run\'s files could not be read.');
  });
});

describe('Run page: View (owner 2026-10-20)', () => {
  it('offers View on a kept JSON file and on a bucket upload', () => {
    const { el } = mount();
    expect(el.querySelectorAll('[data-test="view"]').length).toBe(2);
  });

  it('offers no View on a kept file it cannot show, and disables it on an expired one', () => {
    const { el } = mount([{ ...KEPT, name: 'blob.bin', format: 'bin' }, { ...KEPT, runOutputId: 1002, expired: true }]);
    const buttons = el.querySelectorAll<HTMLButtonElement>('[data-test="view"]');
    expect(buttons.length).toBe(1);
    expect(buttons[0].disabled).toBe(true);
  });
});

describe('Run page: the Outputs tab -- sorting and states (owner 2026-10-27)', () => {
  const file = (runOutputId: number, name: string, byteCount: number, stepIndex = 3) =>
    ({ ...KEPT, runOutputId, name, byteCount, stepIndex, stepKey: stepIndex === 3 ? 'out' : 'publish' });

  it('sorts the files inside each step, the steps keeping their order, both ways', () => {
    try { localStorage.clear(); } catch { /* none */ }
    const { fixture } = mount([file(1, 'b.json', 300), file(2, 'a.json', 100), file(3, 'c.json', 200), { ...UPLOAD, runOutputId: 4 }]);
    const screen = fixture.componentInstance;
    expect(screen.groups().map(g => g.rows.map(o => o.name))).toEqual([['b.json', 'a.json', 'c.json'], ['customers-clean.json']]);
    screen.sort.toggle('file');
    expect(screen.groups()[0].rows.map(o => o.name)).toEqual(['a.json', 'b.json', 'c.json']);
    screen.sort.toggle('file');
    expect(screen.groups()[0].rows.map(o => o.name)).toEqual(['c.json', 'b.json', 'a.json']);
    screen.sort.toggle('size');
    expect(screen.groups()[0].rows.map(o => o.byteCount)).toEqual([300, 200, 100]);
    expect(screen.groups().map(g => g.step)).toEqual([4, 5]);
  });

  it('reads the files again on Try again after they could not be read', () => {
    const { fixture, http, el, store } = mount('fail');
    [...el.querySelectorAll('button')].find(b => b.textContent!.trim() === 'Try again')!.click();
    expect(store.outputs()).toBeNull();
    http.expectOne(r => r.url.endsWith('/sourceJob.json/runOutputs')).flush({ status: API_SUCCESS, data: { outputs: [KEPT] } });
    fixture.detectChanges();
    expect(store.outputList().length).toBe(1);
  });
});
