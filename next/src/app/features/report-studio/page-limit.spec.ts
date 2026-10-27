import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../core/workspaces/workspace-directory';
import { ToastService } from '../../shared/ui/toast.service';
import { ReportStudioApi } from './report-studio.api';
import { JobRow, PageLimit, pageLimitOf } from './report-studio.model';
import { PageLimitCard, pagesIn, raiseWords } from './page-limit-card';
import { PageLimitActions } from './page-limit-actions';

/**
 * Owner 2026-10-21 -- a workspace's page limit in Report Studio › Settings (its administrators set it under the ceiling, a
 * reviewer reads it, a platform administrator sets a workspace's ceiling), and what a report over it offers: one report per
 * row, the table's rows, the data as CSV, and raising the limit -- each only where it applies and where the reader may go.
 */
const limit = (over: Partial<PageLimit> = {}): PageLimit => ({
  tenantId: 2960, limit: 300, workspaceLimit: null, ceiling: 300, ceilingOverride: null, platformCeiling: 300, hardMax: 2000,
  raisedBy: 'PLATFORM_ADMIN', rowVersion: 2, editable: true, ceilingEditable: false, ...over,
});

function auth(opts: { admin?: boolean; platform?: boolean; pages?: string[] } = {}) {
  return {
    isPlatformAdmin: () => opts.platform ?? false, isTenantAdmin: () => opts.admin ?? true, isManagedSession: () => false,
    canOpen: (k: string) => (opts.pages ?? ['tasks', 'report-templates', 'jobs']).includes(k),
  };
}

function mountCard(read: PageLimit, opts: { admin?: boolean; platform?: boolean } = {}) {
  const api = {
    pageLimit: vi.fn(() => of(read)),
    savePageLimit: vi.fn((n: number | null) => of({ ...read, limit: n ?? read.ceiling, workspaceLimit: n, rowVersion: read.rowVersion + 1 })),
    savePageCeiling: vi.fn((_t: number, n: number | null) => of({ ...read, ceiling: n ?? 300, ceilingOverride: n, limit: n ?? 300 })),
  };
  const toast = { success: vi.fn(), error: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: ReportStudioApi, useValue: api },
    { provide: AuthService, useValue: auth(opts) }, { provide: ToastService, useValue: toast },
    { provide: WorkspaceDirectory, useFactory: () => {
      const d = new WorkspaceDirectory();
      vi.spyOn(d, 'remembered').mockReturnValue(opts.platform ? 2960 : null);
      return d;
    } }] });
  const fixture = TestBed.createComponent(PageLimitCard);
  fixture.detectChanges();
  return { fixture, api, toast, el: fixture.nativeElement as HTMLElement };
}

function failedJob(diag: unknown): JobRow {
  return { jobId: 'J', tenantId: 2960, jobNo: 9, label: 'JOB-0009', reportId: 'R', templateId: 'T', status: 'FAILED', progressPct: 60,
    errorCode: 'LIMIT_EXCEEDED', error: 'The report lays out to 60 pages; this workspace\'s reports are at most 50 pages.', retryable: false,
    source: 'PIPELINE', formats: ['PDF'], diagnostics: [diag] as JobRow['diagnostics'] };
}

const hit = { pages: 60, atLeast: false, limit: 50, ceiling: 300, hardMax: 2000, raisedBy: 'WORKSPACE_ADMIN' };
const allSteps = [
  { action: 'PER_ROW', label: 'Make one report per row', pipeline: { jobId: 77, jobQueueId: 9001, stepKey: 'report' } },
  { action: 'LOWER_ROWS', label: 'Lower the table\'s rows', templateId: '01TEMPLATE', componentIds: ['each'] },
  { action: 'EXPORT_CSV', label: 'Export the data as CSV', source: { connector: 'RUN_OUTPUT', jobQueueId: 9001, jobId: 77 } },
];

function mountActions(job: JobRow, opts: { admin?: boolean; platform?: boolean; pages?: string[] } = {}) {
  const http = { get: vi.fn(() => of({ status: 'SUCCESS', data: { taskDetail: { taskDetailId: 1864 } } })) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: HttpClient, useValue: http },
    { provide: AuthService, useValue: auth(opts) }, { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } }] });
  const fixture = TestBed.createComponent(PageLimitActions);
  fixture.componentRef.setInput('job', job);
  fixture.detectChanges();
  return { fixture, http, el: fixture.nativeElement as HTMLElement };
}

describe('The page limit (owner 2026-10-21)', () => {
  it('says who can raise a limit, and takes only whole pages within the bound', () => {
    expect(raiseWords(limit({ raisedBy: 'WORKSPACE_ADMIN' }))).toBe('Your administrator can raise it up to 300 pages.');
    expect(raiseWords(limit())).toBe('Only the platform administrator can raise it further.');
    expect(raiseWords(limit({ raisedBy: 'NOBODY' }))).toBe('2,000 pages is the most the platform allows.');
    expect(pagesIn(50, 300)).toBe(50);
    expect(pagesIn('50', 300)).toBe(50);
    expect(pagesIn(301, 300)).toBeNull();
    expect(pagesIn(0, 300)).toBeNull();
    expect(pagesIn(2.5, 300)).toBeNull();
    expect(pagesIn(null, 300)).toBeNull();
  });

  it('finds the page-limit diagnostic of a failed job, and nothing on any other failure', () => {
    expect(pageLimitOf(failedJob({ code: 'LIMIT_EXCEEDED', pageLimit: hit, nextSteps: allSteps }))?.hit.limit).toBe(50);
    expect(pageLimitOf({ ...failedJob({ code: 'LIMIT_EXCEEDED', pageLimit: hit }), errorCode: 'BINDING_NOT_RESOLVED' })).toBeNull();
    expect(pageLimitOf(failedJob({ code: 'LIMIT_EXCEEDED', message: 'A mapping names at most 200 fields.' }))).toBeNull();
    expect(pageLimitOf(null)).toBeNull();
  });

  it('lets a workspace administrator set the limit under the ceiling, and go back to the default', async () => {
    const { fixture, api, toast, el } = mountCard(limit());
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[data-test="page-limit-now"]')!.textContent).toContain('Now 300 pages, the default');
    expect(el.querySelector('[data-test="page-ceiling"]')).toBeNull();
    const save = el.querySelector<HTMLButtonElement>('[data-test="max-pages-save"]')!;
    expect(save.disabled).toBe(true);
    fixture.componentInstance.pages.set(301);
    fixture.detectChanges();
    expect(save.disabled).toBe(true);
    fixture.componentInstance.pages.set(50);
    fixture.detectChanges();
    save.click();
    expect(api.savePageLimit).toHaveBeenCalledWith(50, 2);
    expect(toast.success).toHaveBeenCalledWith('Reports of this workspace are at most 50 pages now.');
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-test="max-pages-default"]')!.click();
    expect(api.savePageLimit).toHaveBeenLastCalledWith(null, 3);
  });

  it('shows a reviewer the limit and no way to change it', async () => {
    const { fixture, el } = mountCard(limit({ limit: 80, workspaceLimit: 80, raisedBy: 'WORKSPACE_ADMIN', editable: false }), { admin: false });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector<HTMLInputElement>('[data-test="max-pages"]')!.disabled).toBe(true);
    expect(el.querySelector('[data-test="max-pages-save"]')).toBeNull();
    expect(el.querySelector('[data-test="page-limit-now"]')!.textContent).toContain('Your administrator can raise it up to 300 pages.');
  });

  it('lets the platform administrator set a workspace\'s ceiling up to the hard maximum, and says what it costs', async () => {
    const { fixture, api, el } = mountCard(limit({ editable: false, ceilingEditable: true }), { platform: true });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.pageLimit).toHaveBeenCalledWith(2960);
    expect(el.querySelector('[data-test="page-ceiling"]')!.textContent).toContain('media\'s memory');
    fixture.componentInstance.ceiling.set(2001);
    fixture.detectChanges();
    expect(el.querySelector<HTMLButtonElement>('[data-test="page-ceiling-save"]')!.disabled).toBe(true);
    fixture.componentInstance.ceiling.set(900);
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-test="page-ceiling-save"]')!.click();
    expect(api.savePageCeiling).toHaveBeenCalledWith(2960, 900, 2);
  });

  it('offers each next step that applies, and raising the limit to a workspace administrator', () => {
    const { el } = mountActions(failedJob({ code: 'LIMIT_EXCEEDED', pageLimit: hit, nextSteps: allSteps }));
    const words = Array.from(el.querySelectorAll('[data-test^="next-"]')).map(b => b.textContent!.trim());
    expect(words).toEqual(['Make one report per row', 'Lower the table\'s rows', 'Export the data as CSV', 'Raise the limit']);
    expect(el.querySelector('[data-test="next-lower-rows"]')!.getAttribute('href')).toBe('/reports/templates/01TEMPLATE/design?select=each');
    expect(el.querySelector('[data-test="next-export-csv"]')!.getAttribute('href')).toBe('/pipelines/schedules/77/runs/9001?tab=outputs');
  });

  it('opens the pipeline step at One report per row through the run\'s schedule', () => {
    const { fixture, http, el } = mountActions(failedJob({ code: 'LIMIT_EXCEEDED', pageLimit: hit, nextSteps: allSteps }));
    const router = TestBed.inject(Router);
    const go = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    el.querySelector<HTMLButtonElement>('[data-test="next-per-row"]')!.click();
    fixture.detectChanges();
    expect(http.get).toHaveBeenCalledWith(expect.stringContaining('/sourceJob.json/fetchSourceJobDetailWithSourceJobId'),
      { params: { jobId: '77' } });
    expect(go).toHaveBeenCalledWith(['/pipelines', 1864, 'edit'], { queryParams: { tab: 'steps', step: 'report' } });
  });

  it('hides what the reader cannot open, and raising when only the platform administrator can', () => {
    const { el } = mountActions(failedJob({ code: 'LIMIT_EXCEEDED', pageLimit: { ...hit, raisedBy: 'PLATFORM_ADMIN' }, nextSteps: allSteps }),
      { admin: false, pages: ['report-templates'] });
    const words = Array.from(el.querySelectorAll('[data-test^="next-"]')).map(b => b.textContent!.trim());
    expect(words).toEqual(['Lower the table\'s rows']);
  });

  it('shows nothing for a failure that is not the page limit', () => {
    const { el } = mountActions({ ...failedJob({ code: 'BINDING_NOT_RESOLVED' }), errorCode: 'BINDING_NOT_RESOLVED' });
    expect(el.querySelector('[data-test="page-limit-actions"]')).toBeNull();
  });
});
