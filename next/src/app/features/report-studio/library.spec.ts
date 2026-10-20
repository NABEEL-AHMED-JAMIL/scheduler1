import { describe, it, expect, vi, afterEach } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { ToastService } from '../../shared/ui/toast.service';
import { of, throwError } from 'rxjs';
import { API_BASE } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../core/workspaces/workspace-directory';
import { LibraryPage, LibraryQuery, ReportStudioApi } from './report-studio.api';
import { JobRow, ReportRow, deletedWords } from './report-studio.model';
import { RsTabCounts } from './rs-tab-counts';
import { ReportLibrary } from './library';

/**
 * Owner 2026-10-20 ("report need a pagination"): the report library's two lists page on the server. Status, search,
 * page and size go to reportLibrary.json; the answer's total drives the pager, the heading's count and the empty state;
 * a changed filter, size or view starts again from page 1; the five-second poll reads only the page shown.
 */
const report = (n: number, lastJob?: Partial<JobRow>): ReportRow => ({
  reportId: `R${n}`, tenantId: 2960, reportNo: n, label: `RPT-${String(n).padStart(4, '0')}`, name: `Wound report ${n}`,
  templateId: 'T1', templateName: 'Wound care summary', status: 'GENERATED', currentVersion: 1, createdAt: '', updatedAt: '',
  ...(lastJob ? { lastJob: lastJob as JobRow } : {}),
} as ReportRow);
const job = (n: number, status = 'SUCCEEDED'): JobRow => ({ jobId: `J${n}`, label: `J-${n}`, reportId: 'R1', status, progressPct: 40 } as JobRow);
const page = <T>(rows: T[], total: number, offset = 0): LibraryPage<T> => ({ rows, total, offset, limit: 50 });

function screenWith(opts: { view?: string; platform?: boolean; reports?: LibraryPage<ReportRow>; jobs?: LibraryPage<JobRow> } = {}) {
  const api = {
    reports: vi.fn((_q: LibraryQuery, _t?: number | null) => of(opts.reports ?? page([report(1), report(2)], 120))),
    jobs: vi.fn((_q: LibraryQuery, _t?: number | null) => of(opts.jobs ?? page([job(1)], 61))),
    deleteReport: vi.fn((id: string) => id === 'R9'
      ? throwError(() => new HttpErrorResponse({ status: 409, error: { code: 'REPORT_SIGNED', message: 'This report has an approved version.' } }))
      : of({ reportId: id, deleted: true, versions: 1, files: id === 'R2' ? 0 : 2, filesLeft: id === 'R2' ? 3 : 0 })),
  };
  const dialog = { open: vi.fn(() => ({ closed: of(true) })) };
  const toast = { success: vi.fn(), error: vi.fn() };
  const tabCounts = { refresh: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(opts.view ? { view: opts.view } : {}) } } },
      { provide: ReportStudioApi, useValue: api },
      { provide: RsTabCounts, useValue: tabCounts },
      { provide: WorkspaceDirectory, useValue: { remembered: () => (opts.platform ? null : 2960) } },
      { provide: AuthService, useValue: { isPlatformAdmin: () => opts.platform ?? false, canOpen: () => true } },
      { provide: Dialog, useValue: dialog },
      { provide: ToastService, useValue: toast },
    ],
  });
  const screen = TestBed.runInInjectionContext(() => new ReportLibrary());
  return { api, tabCounts, screen, dialog, toast };
}

afterEach(() => vi.useRealTimers());

describe('ReportLibrary -- server-side paging', () => {
  it('asks for the first page of reports and keeps the service\'s total', () => {
    const { api, tabCounts, screen } = screenWith();
    screen.ngOnInit();
    expect(api.reports).toHaveBeenCalledWith({ status: '', q: '', limit: 50, offset: 0 }, null);
    expect(api.jobs).not.toHaveBeenCalled();
    expect(tabCounts.refresh).toHaveBeenCalledTimes(1);
    expect(screen.reports().map(r => r.reportId)).toEqual(['R1', 'R2']);
    expect(screen.total()).toBe(120);
    expect(screen.loading()).toBe(false);
  });

  it('turns pages and sizes on the service; a new size starts at page 1', () => {
    const { api, screen } = screenWith();
    screen.ngOnInit();
    screen.goTo(3);
    expect(api.reports).toHaveBeenLastCalledWith({ status: '', q: '', limit: 50, offset: 100 }, null);
    screen.setSize(100);
    expect(screen.page()).toBe(1);
    expect(api.reports).toHaveBeenLastCalledWith({ status: '', q: '', limit: 100, offset: 0 }, null);
  });

  it('searches on the service after the typing stops, from the first page', () => {
    vi.useFakeTimers();
    const { api, screen } = screenWith();
    screen.ngOnInit();
    screen.goTo(2);
    api.reports.mockClear();
    screen.onSearch('kn');
    screen.onSearch('knee');
    expect(api.reports).not.toHaveBeenCalled();
    vi.advanceTimersByTime(350);
    expect(api.reports).toHaveBeenCalledTimes(1);
    expect(api.reports).toHaveBeenLastCalledWith({ status: '', q: 'knee', limit: 50, offset: 0 }, null);
    expect(screen.page()).toBe(1);
    expect(screen.filtered()).toBe(true);
  });

  it('a status asks again from page 1', () => {
    const { api, screen } = screenWith();
    screen.ngOnInit();
    screen.goTo(2);
    screen.setStatus('FAILED');
    expect(screen.page()).toBe(1);
    expect(api.reports).toHaveBeenLastCalledWith({ status: 'FAILED', q: '', limit: 50, offset: 0 }, null);
  });

  it('the jobs view reads jobs from page 1 with its own status, and ?view=jobs opens on it', () => {
    const { api, screen } = screenWith();
    screen.ngOnInit();
    screen.setStatus('FAILED');
    screen.goTo(2);
    screen.setView('jobs');
    expect(screen.status()).toBe('');
    expect(screen.page()).toBe(1);
    expect(api.jobs).toHaveBeenLastCalledWith({ status: '', q: '', limit: 50, offset: 0 }, null);
    expect(screen.total()).toBe(61);
    screen.setStatus('RUNNING');
    expect(api.jobs).toHaveBeenLastCalledWith({ status: 'RUNNING', q: '', limit: 50, offset: 0 }, null);

    const deep = screenWith({ view: 'jobs' });
    deep.screen.ngOnInit();
    expect(deep.api.jobs).toHaveBeenCalledTimes(1);
    expect(deep.api.reports).not.toHaveBeenCalled();
  });

  it('polls only the page shown, and only while something on it runs', () => {
    vi.useFakeTimers();
    const idle = screenWith({ view: 'jobs', jobs: page([job(1)], 61) });
    idle.screen.ngOnInit();
    vi.advanceTimersByTime(5100);
    expect(idle.api.jobs).toHaveBeenCalledTimes(1);

    const busy = screenWith({ view: 'jobs', jobs: page([job(51, 'RENDERING_PDF')], 61, 50) });
    busy.screen.ngOnInit();
    busy.screen.goTo(2);
    vi.advanceTimersByTime(5100);
    expect(busy.api.jobs).toHaveBeenCalledTimes(3);
    expect(busy.api.jobs).toHaveBeenLastCalledWith({ status: '', q: '', limit: 50, offset: 50 }, null);
    expect(busy.api.reports).not.toHaveBeenCalled();

    const reports = screenWith({ reports: page([report(1, { status: 'QUEUED' })], 1) });
    reports.screen.ngOnInit();
    vi.advanceTimersByTime(5100);
    expect(reports.api.reports).toHaveBeenCalledTimes(2);
  });

  it('a page emptied under the reader goes back to the last page that has rows', () => {
    const { api, screen } = screenWith();
    api.reports.mockImplementation((q: LibraryQuery) => of(q.offset === 100 ? page([], 60) : page([report(51)], 60, 50)));
    screen.ngOnInit();
    screen.goTo(3);
    expect(screen.page()).toBe(2);
    expect(api.reports).toHaveBeenLastCalledWith({ status: '', q: '', limit: 50, offset: 50 }, null);
    expect(screen.reports().map(r => r.reportId)).toEqual(['R51']);
  });

  it('a platform administrator reads the workspace picked, or every one', () => {
    const { api, screen } = screenWith({ platform: true });
    screen.ngOnInit();
    expect(api.reports).toHaveBeenLastCalledWith(expect.anything(), null);
    screen.tenantId.set(2960);
    screen.load();
    expect(api.reports).toHaveBeenLastCalledWith({ status: '', q: '', limit: 50, offset: 0 }, 2960);
  });

  it('says what went wrong', () => {
    const { api, screen } = screenWith();
    api.reports.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'limit is 1 to 200.' } })));
    screen.ngOnInit();
    expect(screen.error()).toBe('limit is 1 to 200.');
    expect(screen.loading()).toBe(false);
  });
});

describe('ReportStudioApi -- the library\'s pages', () => {
  function setup() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    return { api: TestBed.inject(ReportStudioApi), http: TestBed.inject(HttpTestingController) };
  }
  const ok = (data: unknown) => ({ status: 'SUCCESS', message: '', data });

  it('sends status, q, limit, offset and the workspace, and reads total', () => {
    const { api, http } = setup();
    let got: LibraryPage<ReportRow> | null = null;
    api.reports({ status: 'FAILED', q: '  knee ', limit: 100, offset: 200 }, 2960).subscribe(p => got = p);
    const req = http.expectOne(r => r.url === `${API_BASE}/reportLibrary.json/reports`);
    expect(req.request.params.get('status')).toBe('FAILED');
    expect(req.request.params.get('q')).toBe('knee');
    expect(req.request.params.get('limit')).toBe('100');
    expect(req.request.params.get('offset')).toBe('200');
    expect(req.request.params.get('tenantId')).toBe('2960');
    req.flush(ok({ reports: [report(1)], total: 201, offset: 200, limit: 100 }));
    expect(got!.total).toBe(201);
    expect(got!.rows.length).toBe(1);
    http.verify();
  });

  it('leaves out an empty status and search, asks for 50 when no limit is named, and counts the rows of an older answer', () => {
    const { api, http } = setup();
    let got: LibraryPage<JobRow> | null = null;
    api.jobs({ q: '   ' }).subscribe(p => got = p);
    const req = http.expectOne(r => r.url === `${API_BASE}/reportLibrary.json/jobs`);
    expect(req.request.params.has('status')).toBe(false);
    expect(req.request.params.has('q')).toBe(false);
    expect(req.request.params.get('limit')).toBe('50');
    expect(req.request.params.get('offset')).toBe('0');
    req.flush(ok({ jobs: [job(1), job(2)] }));
    expect(got!.total).toBe(2);
    http.verify();
  });
});

describe('ReportLibrary -- delete (owner 2026-10-20)', () => {
  const kept = { ...report(3), approved: true } as ReportRow;

  it('never picks a kept record (an approved version), on its own or with the page', () => {
    const { screen } = screenWith({ reports: page([report(1), report(2), kept], 3) });
    screen.ngOnInit();
    screen.togglePick(kept);
    expect(screen.isPicked(kept)).toBe(false);
    screen.togglePage(true);
    expect([...screen.picked()]).toEqual(['R1', 'R2']);
    expect(screen.allPicked()).toBe(true);
    screen.togglePage(false);
    expect(screen.picked().size).toBe(0);
  });

  it('deletes the picked ones one at a time after the confirm, says how many, and reads the same page again', async () => {
    const { api, screen, dialog, toast } = screenWith({ reports: page([report(1), report(2), kept], 120) });
    screen.ngOnInit();
    screen.goTo(2);
    screen.togglePick(report(1));
    screen.togglePick(report(2));
    api.reports.mockClear();
    screen.removePicked();
    await Promise.resolve();
    await Promise.resolve();
    expect(dialog.open).toHaveBeenCalledTimes(1);
    expect(api.deleteReport.mock.calls.map(c => c[0])).toEqual(['R1', 'R2']);
    expect(toast.success).toHaveBeenCalledWith('2 reports deleted. Their 3 stored files stay in storage until an operator removes them.');
    expect(screen.picked().size).toBe(0);
    expect(api.reports).toHaveBeenLastCalledWith({ status: '', q: '', limit: 50, offset: 50 }, null);
  });

  it('says each refusal on its own (the service still says REPORT_SIGNED for a report signed meanwhile)', async () => {
    const { api, screen, toast } = screenWith({ reports: page([report(1), report(9)], 2) });
    screen.ngOnInit();
    screen.togglePage(true);
    screen.removePicked();
    await Promise.resolve();
    await Promise.resolve();
    expect(api.deleteReport).toHaveBeenCalledTimes(2);
    expect(toast.success).toHaveBeenCalledWith('Wound report 1 deleted.');
    expect(toast.error).toHaveBeenCalledWith('Wound report 9: This report has an approved version.');
  });

  it('a row\'s own Delete asks first and leaves a kept record alone', async () => {
    const { api, screen, dialog } = screenWith({ reports: page([report(1), kept], 2) });
    screen.ngOnInit();
    screen.removeOne(kept);
    expect(dialog.open).not.toHaveBeenCalled();
    screen.removeOne(report(1));
    await Promise.resolve();
    await Promise.resolve();
    expect(api.deleteReport).toHaveBeenCalledWith('R1');
  });
});

describe('deletedWords (owner 2026-10-20)', () => {
  it('says plainly when stored files stay', () => {
    expect(deletedWords('Wound report 1', 0)).toBe('Wound report 1 deleted.');
    expect(deletedWords('Wound report 1', 1)).toBe('Wound report 1 deleted. Its 1 stored file stays in storage until an operator removes it.');
    expect(deletedWords('Wound report 1', 24)).toBe('Wound report 1 deleted. Its 24 stored files stay in storage until an operator removes them.');
  });
});
