import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { of, throwError } from 'rxjs';
import { GeneratedReports } from './generated-reports';
import { GeneratedService } from './generated.service';
import { reportsFromRun } from './generated.model';
import { StorageService } from '../../objects/storage.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { PreviewDialog } from '../../objects/preview/preview-dialog';
import { ShareDialog } from '../../objects/dialogs/share-dialog';
import { ReportPreviewDialog } from './report-preview-dialog';

/**
 * MIG-253: Documents › Reports lists generated outputs -- renders saved to a bucket folder and what
 * recent runs put out -- with preview, download, share and open in storage. No endpoint lists
 * generated files, so the list says how far it looked.
 */
const ok = (data: unknown) => ({ status: 'SUCCESS', message: '', data });
const RUN = { jobQueueId: 7405, jobId: 2849, jobName: 'UI-CHECK registry chain job 0929',
  pipelineName: 'UI-CHECK registry chain task 0929', owner: 'Claude Demo Admin' };
const RUN_REPORTS = reportsFromRun(RUN, [
  { runOutputId: 1000, kind: 'file', name: 'customers-clean.json', format: 'json', byteCount: 169,
    recordedAt: '2026-09-29T07:07:05.699379', runDatasetId: 1051, expiresAt: '2026-09-30T07:07:05.698', expired: false },
  { runOutputId: 1001, kind: 'bucket', name: 'customers-clean.json', format: 'json', byteCount: 169,
    recordedAt: '2026-09-29T07:07:05.863214', bucket: 'ui-review-s3', key: 'registry-live-check/customers-clean.json' },
]);

function page(opts: { runsFail?: boolean; listObjects?: (b: string, prefix: string, token?: string) => unknown } = {}) {
  const listObjects = vi.fn(opts.listObjects ?? ((_b: string, prefix: string) => of(ok({ objects: prefix === 'reports/'
    ? [{ name: '2026', key: 'reports/2026/', folder: true },
       { name: 'Q3.pdf', key: 'reports/Q3.pdf', folder: false, size: 13841, lastModified: '2026-09-28T12:00:00Z' }]
    : [{ name: 'Sep.xlsx', key: 'reports/2026/Sep.xlsx', folder: false, size: 900, lastModified: '2026-09-27T12:00:00Z' }] }))));
  const storage = {
    buckets: vi.fn(() => of(ok([{ bucket: 'ui-review-s3', label: 'UI-REVIEW', provider: 'S3' }]))),
    listObjects,
    download: vi.fn(() => of(new Blob(['x']))),
    share: vi.fn(() => of(ok(null))),
  };
  const service = {
    recentOutputs: vi.fn(() => opts.runsFail ? throwError(() => new Error('down'))
      : of({ reports: RUN_REPORTS, runsRead: 2, jobsRead: 1, failed: 0 })),
    runDatasetFile: vi.fn(() => of(new Blob(['[]']))),
  };
  const open = vi.fn(() => ({ closed: of(undefined) }));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: StorageService, useValue: storage },
      { provide: GeneratedService, useValue: service },
      { provide: Dialog, useValue: { open } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(GeneratedReports);
  fixture.detectChanges();
  return { fixture, p: fixture.componentInstance, storage, service, open };
}

afterEach(() => vi.restoreAllMocks());

describe('Documents › Reports', () => {
  it('follows a folder past its first 100 files, up to 1,000, and says when it stopped (scale review P2 #33)', () => {
    const file = (n: number) => ({ name: `r${n}.pdf`, key: `reports/r${n}.pdf`, folder: false, size: 10, lastModified: '2026-09-28T12:00:00Z' });
    const hundred = (from: number) => Array.from({ length: 100 }, (_, i) => file(from + i));
    const { p, storage } = page({ listObjects: (_b, _prefix, token) => of(ok({ objects: hundred(Number(token ?? 0)),
      nextContinuationToken: String(Number(token ?? 0) + 100) })) });
    expect(storage.listObjects).toHaveBeenCalledTimes(10);
    expect(p.reports().filter(r => r.name.startsWith('r')).length).toBe(1000);
    expect(p.folderCut()).toBe(true);
    expect(p.reach()).toContain('the first 1,000 of a folder');
  });

  it('lists the reports folder of the first bucket, one level of subfolders, and recent runs\' outputs, newest first', () => {
    const { p, storage } = page();
    expect(p.bucket()).toBe('ui-review-s3');
    expect(p.folder()).toBe('reports/');
    expect(storage.listObjects.mock.calls.map(c => c[1])).toEqual(['reports/', 'reports/2026/']);
    expect(p.reports().map(r => r.name)).toEqual(['customers-clean.json', 'customers-clean.json', 'Q3.pdf', 'Sep.xlsx']);
    expect(p.reports()[0]).toMatchObject({ pipeline: 'UI-CHECK registry chain task 0929', jobQueueId: 7405 });
  });

  it('says how far it looked, since nothing lists every generated file', () => {
    const { fixture, p } = page();
    expect(p.reach()).toContain('2 recent runs');
    expect(p.reach()).toContain('ui-review-s3/reports/');
    expect(fixture.nativeElement.textContent).toContain(p.reach());
  });

  it('still lists the bucket\'s files when the runs cannot be read, and says so', () => {
    const { p } = page({ runsFail: true });
    expect(p.reports().map(r => r.name)).toEqual(['Q3.pdf', 'Sep.xlsx']);
    expect(p.runsError()).toBeTruthy();
  });

  it('previews a stored file in the object viewer, and a run\'s dataset as a rendered PDF', () => {
    const { p, open } = page();
    const q3 = p.reports().find(r => r.name === 'Q3.pdf')!;
    p.preview(q3);
    expect(open).toHaveBeenLastCalledWith(PreviewDialog, expect.objectContaining({
      data: expect.objectContaining({ bucket: 'ui-review-s3', key: 'reports/Q3.pdf', name: 'Q3.pdf' }) }));
    const kept = p.reports().find(r => r.origin === 'run-file')!;
    p.preview(kept);
    expect(open).toHaveBeenLastCalledWith(ReportPreviewDialog, expect.objectContaining({
      data: expect.objectContaining({ runDatasetId: 1051, name: 'customers-clean.json' }) }));
  });

  it('downloads from the bucket, or the run\'s dataset in its own format', () => {
    const { p, storage, service } = page();
    const save = vi.spyOn(StorageService, 'saveBlob').mockImplementation(() => {});
    p.download(p.reports().find(r => r.name === 'Q3.pdf')!);
    expect(storage.download).toHaveBeenCalledWith('ui-review-s3', 'reports/Q3.pdf');
    p.download(p.reports().find(r => r.origin === 'run-file')!);
    expect(service.runDatasetFile).toHaveBeenCalledWith(1051, 'json');
    expect(save).toHaveBeenCalledTimes(2);
  });

  // MIG-255: a pipeline's PDF report (render_pdf) is a document, not rows: it downloads and opens as the PDF it is.
  it('downloads a run\'s PDF report as itself and opens it rather than previewing rows', () => {
    const { p, service, open } = page();
    const save = vi.spyOn(StorageService, 'saveBlob').mockImplementation(() => {});
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null);
    const createUrl = vi.fn(() => 'blob:report');
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createUrl;
    const [pdf] = reportsFromRun(RUN, [{ runOutputId: 1002, kind: 'file', name: 'wound-report.pdf', format: 'pdf', byteCount: 5120,
      recordedAt: '2026-09-29T19:00:00', runDatasetId: 1120, expiresAt: '2026-09-30T19:00:00', expired: false }]);
    p.download(pdf);
    expect(service.runDatasetFile).toHaveBeenLastCalledWith(1120, 'pdf');
    expect(save).toHaveBeenLastCalledWith(expect.any(Blob), 'wound-report.pdf');
    open.mockClear();
    p.preview(pdf);
    expect(open).not.toHaveBeenCalled();
    expect(service.runDatasetFile).toHaveBeenLastCalledWith(1120, 'pdf');
    expect(opened).toHaveBeenCalledWith('blob:report', '_blank', 'noopener');
    opened.mockRestore();
  });

  it('emails only what is in a bucket, and opens storage at the file\'s folder', () => {
    const { p, open } = page();
    const upload = p.reports().find(r => r.origin === 'run-bucket')!;
    const kept = p.reports().find(r => r.origin === 'run-file')!;
    expect(p.canShare(kept)).toBe(false);
    p.share(upload);
    expect(open).toHaveBeenLastCalledWith(ShareDialog, expect.objectContaining({ data: expect.objectContaining({ count: 1 }) }));
    expect(p.storageParams(upload)).toEqual({ bucket: 'ui-review-s3', prefix: 'registry-live-check/' });
    expect(p.storageParams(kept)).toBeNull();
  });

  it('narrows the list by name, type or pipeline', () => {
    const { p } = page();
    p.query.set('registry chain');
    expect(p.filtered().map(r => r.id)).toEqual(['run-1001', 'run-1000']);
    p.query.set('pdf');
    expect(p.filtered().map(r => r.name)).toEqual(['Q3.pdf']);
  });
});
