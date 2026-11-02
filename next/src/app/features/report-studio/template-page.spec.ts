import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { API_BASE } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { ReportStudioApi } from './report-studio.api';
import { TemplateDetail } from './report-studio.model';
import { MAX_PAGES_SHOWN, ReportTemplatePage, tabFrom } from './template-page';

/**
 * Reports redesign (owner 2026-11-02): a template's page leads with every page filled with the test sample (the JSON has
 * its own tab), the facts at a glance, the data it needs and who uses it; More › Mark as test sets the tag alone.
 */
const detail = (over: Partial<TemplateDetail> = {}): TemplateDetail => ({
  templateId: 'T1', tenantId: 2960, name: 'Wound assessment report', status: 'PUBLISHED', currentPublishedVersion: 2, hasDraft: true,
  origin: 'BLANK', tags: ['wound'], rowVersion: 7, reports: 12, versions: [], test: false,
  samples: [{ sampleId: 'S0', templateId: 'T1', name: 'Run 41', kind: 'RUN_OUTPUT', format: 'JSON' },
    { sampleId: 'S1', templateId: 'T1', name: 'September visits', kind: 'INLINE_JSON', format: 'JSON', bytes: 3900 }],
  draft: { versionId: 'V3', templateId: 'T1', version: 3, state: 'DRAFT', revision: 5, schemaVersion: '1', sha256: '',
    definition: { schemaVersion: '1', template: { dataContract: { fields: [
      { path: 'gallery[]', type: 'list', required: false }, { path: 'visits[]', type: 'list', required: true },
      { path: 'summary.patients', type: 'number', required: true }] } } } },
  features: { approvals: 2, qr: true, qrContent: 'verifyLink', charts: 1, images: 6, conditional: false, repeat: true, signature: true, stamp: false,
    confidentiality: true, components: 18, pageSize: 'A4', orientation: 'portrait' },
  usedBy: { pipelines: [{ pipelineJobId: '88', pipelineName: 'Wound visits', stepKey: 'generate_report', runs: 4, lastRunAt: '2026-10-30T10:00:00Z', version: 2 }] },
  ...over,
} as TemplateDetail);

const png = (pages: number) => ({ body: new Blob(['x'], { type: 'image/png' }),
  headers: { get: (h: string) => (h === 'Content-Type' ? 'image/png' : h === 'X-Report-Pages' ? String(pages) : null) } });

let made = 0;
const realCreate = URL.createObjectURL;
const realRevoke = URL.revokeObjectURL;
beforeAll(() => { URL.createObjectURL = vi.fn(() => `blob:page-${++made}`); URL.revokeObjectURL = vi.fn(); });
afterAll(() => { URL.createObjectURL = realCreate; URL.revokeObjectURL = realRevoke; });

function pageWith(t: TemplateDetail, query: Record<string, string> = {}, pages = 3) {
  const api = {
    template: vi.fn(() => of(t)),
    templatePage: vi.fn((_id: string, _v: string | null, _p: number) => of(png(pages))),
    setTags: vi.fn((templateId: string, tags: string[]) => of({ ...t, templateId, tags, test: tags.includes('test'), rowVersion: 8 })),
  };
  const router = { navigate: vi.fn(() => Promise.resolve(true)) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: ReportStudioApi, useValue: api },
      { provide: Router, useValue: router },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      { provide: AuthService, useValue: { isPlatformAdmin: () => false, canOpen: () => true, role: () => 'TENANT_ADMIN' } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      { provide: Dialog, useValue: { open: vi.fn() } },
    ],
  });
  TestBed.overrideComponent(ReportTemplatePage, { set: { template: '', imports: [], styleUrl: undefined, styles: [] } });
  const fixture = TestBed.createComponent(ReportTemplatePage);
  fixture.componentRef.setInput('templateId', t.templateId);
  fixture.detectChanges();
  TestBed.tick();
  return { api, router, page: fixture.componentInstance, fixture };
}

describe('A template\'s page -- tabs', () => {
  it('opens on Overview, or on the tab the address names; a tab goes into the address', () => {
    expect(tabFrom(null)).toBe('overview');
    expect(tabFrom('nonsense')).toBe('overview');
    expect(tabFrom('used')).toBe('used');
    const { page, router, api } = pageWith(detail(), { tab: 'json' });
    expect(page.tab()).toBe('json');
    // The JSON tab draws no pages.
    expect(api.templatePage).not.toHaveBeenCalled();
    page.tabTo('versions');
    expect(router.navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { tab: 'versions' }, replaceUrl: true }));
    page.tabTo('overview');
    expect(router.navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { tab: null } }));
  });
});

describe('A template\'s page -- what it makes', () => {
  it('draws page 1 of the published version, then the others the header counts, filled with the first pasted sample', () => {
    const { page, api } = pageWith(detail());
    expect(page.shownWhich()).toBe('published');
    expect(api.templatePage.mock.calls.map(c => [c[1], c[2]])).toEqual([['2', 1], ['2', 2], ['2', 3]]);
    expect(page.pageRows().every(r => !!r.cells[0].url)).toBe(true);
    expect(page.sampleName()).toBe('September visits');
    expect(page.whichOptions().map(o => o.label)).toEqual(['v2 published', 'v3 draft']);
    // The draft, then Compare: each version drawn once, side by side page by page.
    page.which.set('draft');
    TestBed.tick();
    expect(api.templatePage).toHaveBeenLastCalledWith('T1', 'draft', 3, null);
    const before = api.templatePage.mock.calls.length;
    page.compare.set(true);
    TestBed.tick();
    expect(api.templatePage.mock.calls.length).toBe(before);
    expect(page.shownSets().map(s => s.label)).toEqual(['published v2', 'draft v3']);
    expect(page.pageRows()[2].cells.map(c => c.label)).toEqual(['published v2', 'draft v3']);
  });

  it('a long template draws its first pages only and says how many it has', () => {
    const { page, api } = pageWith(detail({ draft: undefined, hasDraft: false }), {}, 40);
    expect(api.templatePage).toHaveBeenCalledTimes(MAX_PAGES_SHOWN);
    const set = page.shownSets()[0].set!;
    expect(set.count).toBe(40);
    expect(set.urls.length).toBe(MAX_PAGES_SHOWN);
    expect(page.whichOptions()).toEqual([]);
  });

  it('a template never published shows its draft', () => {
    const { page, api } = pageWith(detail({ currentPublishedVersion: null, status: 'DRAFT' }), {}, 1);
    expect(page.shownWhich()).toBe('draft');
    expect(api.templatePage).toHaveBeenCalledWith('T1', 'draft', 1, null);
  });
});

describe('A template\'s page -- at a glance, data, used by, mark as test', () => {
  it('says what the shown version has and how many pages the sample makes', () => {
    const { page } = pageWith(detail({ draft: undefined, hasDraft: false }));
    const facts = Object.fromEntries(page.facts().map(f => [f.label, f.value]));
    expect(facts['Page']).toBe('A4 portrait · 3 pages with the sample');
    expect(facts['Outputs']).toBe('PDF and HTML');
    expect(facts['Approval']).toBe('2 approvers');
    expect(facts['QR code']).toBe('verify link');
    expect(facts['Sections']).toBe('some repeated for each item');
    expect(facts['Stamp']).toBe('none');
  });

  it('the data it needs puts the required fields first; Used by counts pipeline steps and reports', () => {
    const { page } = pageWith(detail());
    expect(page.requiredCount()).toBe(2);
    expect(page.contractPreview().map(f => f.path)).toEqual(['visits[]', 'summary.patients', 'gallery[]']);
    expect(page.usedCount()).toBe(13);
    expect(page.reportsQuery()).toEqual({ templateId: 'T1' });
  });

  it('Mark as test adds the tag (the others kept) with the row version; Not a test takes it away; test reports open with it', () => {
    const { page, api } = pageWith(detail());
    page.markTest(true);
    expect(api.setTags).toHaveBeenCalledWith('T1', ['wound', 'test'], 7);
    expect(page.isTest()).toBe(true);
    expect(page.t()!.rowVersion).toBe(8);
    expect(page.reportsQuery()).toEqual({ templateId: 'T1', tests: '1' });
    page.markTest(false);
    expect(api.setTags).toHaveBeenLastCalledWith('T1', ['wound'], 8);
    expect(page.isTest()).toBe(false);
  });
});

describe('A template\'s page -- the API', () => {
  it('sets the tags alone and asks for a page 720 px wide', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const api = TestBed.inject(ReportStudioApi);
    const http = TestBed.inject(HttpTestingController);
    api.setTags('T1', ['wound', 'test'], 7).subscribe();
    const tags = http.expectOne(`${API_BASE}/reportTemplate.json/tags`);
    expect(tags.request.method).toBe('POST');
    expect(tags.request.body).toEqual({ templateId: 'T1', tags: ['wound', 'test'], rowVersion: 7 });
    tags.flush({ status: 'SUCCESS', message: '', data: {} });
    api.templatePage('T1', 'draft', 2, 2960).subscribe();
    const p = http.expectOne(r => r.url === `${API_BASE}/reportTemplate.json/thumbnail`);
    expect(Object.fromEntries(p.request.params.keys().map(k => [k, p.request.params.get(k)])))
      .toEqual({ templateId: 'T1', version: 'draft', page: '2', wide: 'true', tenantId: '2960' });
    p.flush(new Blob());
    http.verify();
  });
});
