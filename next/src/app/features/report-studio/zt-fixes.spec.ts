import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { AuthService } from '../../core/auth/auth.service';
import { TabCounts } from '../../core/nav/tab-counts';
import { WorkspaceDirectory } from '../../core/workspaces/workspace-directory';
import { GeneratedService } from '../documents/generated/generated.service';
import { ReportStudioApi } from './report-studio.api';
import { RsTabCounts } from './rs-tab-counts';
import { ReportOverview } from './overview';
import { BrandProfilePage, PLATFORM_PREVIEW } from './assets/brand-profile';
import { ToastService } from '../../shared/ui/toast.service';
import { overviewTiles } from './overview';
import { testChipWords } from './designer/designer';
import { recordsWord } from './report-studio.model';

/**
 * Zero-tolerance campaign (2026-10-20), Report Studio's screens against the approved design: each case is a defect found on
 * the live console and the rule that now holds.
 */
const figures = { versionsThisMonth: 174, reports: 66, publishedTemplates: 70, templatesWithDrafts: 2, templates: 81,
  jobsFinishedThisMonth: 178, jobsSucceededThisMonth: 174, failedLast7Days: 2, running: 0, waitingForApproval: 0, publishRequests: 0 };
// The sources, read at run time as layout-rules.spec does (the specs run under Node; the browser build has no fs).
async function here(f: string): Promise<string> {
  const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
  const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
  return fs.readFileSync(`${root}/src/app/features/report-studio/${f}`, 'utf8');
}

describe('Report Studio screens (zero-tolerance)', () => {
  it('ZT-R1: the first figure says it counts versions, out of the reports', () => {
    const [first] = overviewTiles(figures as never);
    expect(first.label).toBe('Versions this month');
    expect(first.value).toBe(174);
    expect(first.foot).toBe('of 66 reports in all');
    expect(overviewTiles({ ...figures, reports: 1 } as never)[0].foot).toBe('of 1 report in all');
  });

  it('ZT-R2: the test-data chip has its words in a span that is cut with an ellipsis, and names them in full on hover', async () => {
    expect(testChipWords(true, 'Test sample · October 2026 home health intake (synthetic)', 1))
      .toBe('Test sample · October 2026 home health intake (synthetic) · 1 record');
    expect(testChipWords(true, '', 3)).toBe('Test data · 3 records');
    expect(testChipWords(false, 'x', 3)).toBe('No test data · add some');
    const html = await here('designer/designer.html');
    expect(html).toContain('<span class="min-w-0 truncate">{{ testChipText() }}</span>');
    expect(html).toMatch(/\[title\]="isPlatformAdmin\(\) \? [^"]+ : testChipText\(\)"/);
  });

  it('ZT-R5: a record count reads as words, and the versions card gives its people and data room on a wide screen', async () => {
    expect(recordsWord(1)).toBe('1 record');
    expect(recordsWord(12000)).toBe('12,000 records');
    expect(recordsWord(null)).toBe('? records');
    const html = await here('report-page.html');
    expect(html).not.toContain('record(s)');
    expect(html.match(/max-w-36 xl:max-w-60 2xl:max-w-80 truncate/g)?.length).toBe(2);
    expect(await here('data.ts')).not.toContain('record(s)');
  });

  it('ZT-R9: a reviewer (Overview and Library, not Assets or Schedules) is never asked for what they cannot open', async () => {
    const keys = new Set(['report-studio', 'report-library', 'report-approve']);
    const auth = { canOpen: (k: string) => keys.has(k), isPlatformAdmin: () => false, user: signal({ appUserId: 4641 }) };
    const overview = { figures, recentReports: [], recentJobs: [], failedJobs: [], templateActivity: [], pipelineRuns: [{ pipelineRunId: 8791, templateIds: ['T'] }] };
    const api = { overview: vi.fn(() => of(overview)), assets: vi.fn(() => of({ counts: { all: 5 } })), jobs: vi.fn(() => of({ jobs: [] })),
      report: vi.fn(() => of(null)) };
    const generated = { schedules: vi.fn(() => of([])), runs: vi.fn(() => of([])) };
    const tabs = { set: vi.fn() };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: AuthService, useValue: auth },
      { provide: ReportStudioApi, useValue: api }, { provide: GeneratedService, useValue: generated }, { provide: TabCounts, useValue: tabs },
      { provide: WorkspaceDirectory, useValue: { remembered: () => null } }] });
    // The component's logic only: its page (the workspace picker, the tiles) is not what this checks.
    TestBed.overrideComponent(ReportOverview, { set: { template: '', imports: [] } });
    TestBed.inject(RsTabCounts).refresh(null);
    expect(api.assets).not.toHaveBeenCalled();
    expect(tabs.set).toHaveBeenCalledWith({ '/reports/templates': 81, '/reports/library': 66, '/reports/assets': undefined });
    const fixture = TestBed.createComponent(ReportOverview);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(api.overview).toHaveBeenCalled();
    expect(generated.schedules).not.toHaveBeenCalled();
    keys.add('report-assets');
    keys.add('jobs');
    TestBed.inject(RsTabCounts).refresh(null);
    expect(api.assets).toHaveBeenCalledTimes(1);
    fixture.componentInstance.load();
    expect(generated.schedules).toHaveBeenCalledTimes(1);
  });

  it('ZT-R17: a platform administrator\'s brand profile says the preview is the workspace\'s, and asks for none (no 403)', async () => {
    vi.useFakeTimers();
    try {
      for (const admin of [true, false]) {
        const api = { brandProfile: vi.fn(() => of({ profileId: 'P', name: 'Default', status: 'ACTIVE', isDefault: true, templates: 81, assets: [],
          published: { version: 2, definition: { colors: {} } }, draft: null, versions: [] }).pipe(delay(0))), previewBrand: vi.fn(() => of({ html: '<p>x</p>' })),
          assets: vi.fn(() => of({ assets: [], counts: {} })), usable: vi.fn(() => of({ assets: [], total: 0 })) };
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: ReportStudioApi, useValue: api },
          { provide: AuthService, useValue: { isPlatformAdmin: () => admin, canOpen: () => true, user: signal({ appUserId: 1 }) } },
          { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } }] });
        TestBed.overrideComponent(BrandProfilePage, { set: { template: '', imports: [] } });
        const fixture = TestBed.createComponent(BrandProfilePage);
        fixture.componentRef.setInput('profileId', 'P');
        fixture.detectChanges();
        vi.advanceTimersByTime(800);
        expect(api.previewBrand).toHaveBeenCalledTimes(admin ? 0 : 1);
        expect(fixture.componentInstance.previewError()).toBe(admin ? PLATFORM_PREVIEW : '');
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('ZT-R20/R21: Create report claims no page count before a preview, and no "nothing for it" banner before data is chosen', async () => {
    const html = await here('wizard/new-report.html');
    const card = html.split('\n').find(l => l.includes("a published version can't be edited"))!;
    expect(card).toContain('@if (pages(); as n)');
    expect(card).not.toContain('pageCount()');
    expect(html).toContain('@for (m of (inspect() ? missing().slice(0, 1) : []); track m.field.path)');
  });
});
