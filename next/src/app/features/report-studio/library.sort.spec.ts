import { describe, it, expect, vi, beforeEach } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { API_BASE } from '../../core/api/api.config';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../core/workspaces/workspace-directory';
import { LibraryPage, LibraryQuery, ReportStudioApi } from './report-studio.api';
import { JobRow, ReportRow } from './report-studio.model';
import { RsTabCounts } from './rs-tab-counts';
import { ReportLibrary } from './library';

/**
 * Owner 2026-10-27 ("add a sort on each table"): the library's headings sort on the server. Before a heading is picked
 * no read names a sort (the service keeps its own order: reports newest change first, which the Updated heading shows);
 * a pick sends the allow-listed column and direction and goes back to page 1; each list has its own sort.
 */
const page = <T>(rows: T[], total: number): LibraryPage<T> => ({ rows, total, offset: 0, limit: 50 });

function screenWith(view?: string) {
  const api = {
    reports: vi.fn((_q: LibraryQuery, _t?: number | null) => of(page([{ reportId: 'R1', name: 'Knee' } as ReportRow], 120))),
    jobs: vi.fn((_q: LibraryQuery, _t?: number | null) => of(page([{ jobId: 'J1', status: 'SUCCEEDED' } as JobRow], 61))),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(view ? { view } : {}) } } },
      { provide: ReportStudioApi, useValue: api },
      { provide: RsTabCounts, useValue: { refresh: vi.fn() } },
      { provide: WorkspaceDirectory, useValue: { remembered: () => 2960 } },
      { provide: AuthService, useValue: { isPlatformAdmin: () => false, canOpen: () => true } },
      { provide: Dialog, useValue: { open: vi.fn() } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
    ],
  });
  const screen = TestBed.runInInjectionContext(() => new ReportLibrary());
  screen.ngOnInit();
  return { api, screen };
}

beforeEach(() => { try { localStorage.clear(); } catch { /* none */ } });

describe('ReportLibrary -- server-side sort (owner 2026-10-27)', () => {
  it('names no sort before a heading is picked; Updated, newest first, is the reports\' own order', () => {
    const { api, screen } = screenWith();
    const q = api.reports.mock.calls[0][0];
    expect(q.sort).toBeUndefined();
    expect(q.dir).toBeUndefined();
    expect(screen.reportSort.ariaSort('updated')).toBe('descending');
  });

  it('a reports heading sends its column both ways and goes back to page 1', () => {
    const { api, screen } = screenWith();
    screen.goTo(3);
    screen.reportSort.toggle('report');
    expect(screen.page()).toBe(1);
    expect(api.reports).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'name', dir: 'asc', offset: 0 }), null);
    screen.reportSort.toggle('report');
    expect(api.reports).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'name', dir: 'desc', offset: 0 }), null);
    screen.reportSort.toggle('version');
    expect(api.reports).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'version', dir: 'desc' }), null);
    // Updated, newest first, is the reports' own order again: the read names no sort and the service keeps it.
    screen.reportSort.toggle('updated');
    expect(api.reports.mock.calls.at(-1)![0].sort).toBeUndefined();
    expect(screen.reportSort.ariaSort('updated')).toBe('descending');
  });

  it('flipping Updated asks for the oldest first; going back to the own order names no sort again', () => {
    const { api, screen } = screenWith();
    screen.reportSort.toggle('updated');
    expect(api.reports).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'updatedAt', dir: 'asc' }), null);
    screen.reportSort.reset();
    const q = api.reports.mock.calls.at(-1)![0];
    expect(q.sort).toBeUndefined();
  });

  it('the paging keeps the sort: the next page asks for the same column', () => {
    const { api, screen } = screenWith();
    screen.reportSort.toggle('status');
    screen.goTo(2);
    expect(api.reports).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'status', dir: 'asc', offset: 50 }), null);
  });

  it('the jobs have their own sort, sent from page 1, and none before a pick', () => {
    const { api, screen } = screenWith('jobs');
    expect(api.jobs.mock.calls[0][0].sort).toBeUndefined();
    expect(screen.jobSort.ariaSort('started')).toBeNull();
    screen.goTo(2);
    screen.jobSort.toggle('finished');
    expect(screen.page()).toBe(1);
    expect(api.jobs).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'finishedAt', dir: 'desc', offset: 0 }), null);
    screen.jobSort.toggle('finished');
    expect(api.jobs).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'finishedAt', dir: 'asc' }), null);
    screen.jobSort.toggle('progress');
    expect(api.jobs).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'status', dir: 'asc' }), null);
    screen.jobSort.toggle('job');
    expect(api.jobs).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'job', dir: 'desc' }), null);
    // The reports' sort is untouched, and a jobs pick never reads the reports.
    expect(api.reports).not.toHaveBeenCalled();
  });
});

describe('ReportStudioApi -- sort and dir go only when picked', () => {
  function setup() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    return { api: TestBed.inject(ReportStudioApi), http: TestBed.inject(HttpTestingController) };
  }
  const ok = (data: unknown) => ({ status: 'SUCCESS', message: '', data });

  it('sends sort and dir on the reports and jobs, and nothing when no sort is named', () => {
    const { api, http } = setup();
    api.reports({ sort: 'template', dir: 'desc' }).subscribe();
    const reports = http.expectOne(r => r.url === `${API_BASE}/reportLibrary.json/reports`);
    expect(reports.request.params.get('sort')).toBe('template');
    expect(reports.request.params.get('dir')).toBe('desc');
    reports.flush(ok({ reports: [] }));
    api.jobs({}).subscribe();
    const jobs = http.expectOne(r => r.url === `${API_BASE}/reportLibrary.json/jobs`);
    expect(jobs.request.params.has('sort')).toBe(false);
    expect(jobs.request.params.has('dir')).toBe(false);
    jobs.flush(ok({ jobs: [] }));
    api.list({ sort: 'from', dir: 'asc' }).subscribe();
    const list = http.expectOne(r => r.url.endsWith('/reportTemplate.json/fetchAll'));
    expect(list.request.params.get('sort')).toBe('from');
    expect(list.request.params.get('dir')).toBe('asc');
    list.flush(ok({ templates: [], starters: [] }));
    http.verify();
  });
});
