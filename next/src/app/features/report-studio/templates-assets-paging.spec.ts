import { describe, it, expect, vi, afterEach } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { API_BASE } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../core/workspaces/workspace-directory';
import { ToastService } from '../../shared/ui/toast.service';
import { AssetQuery, ReportStudioApi, TemplateQuery } from './report-studio.api';
import { StarterRow, TemplateLibrary, TemplateRow } from './report-studio.model';
import { AssetCard, AssetLibrary } from './assets.model';
import { RsTabCounts } from './rs-tab-counts';
import { ReportTemplates } from './templates';
import { ReportAssets } from './assets/assets';
import { RsPickSearch } from './pick-search';

/**
 * Owner 2026-10-20, after the library: Templates and Assets page on the server too. The Templates page shows one list --
 * the workspace's templates a page at a time from the service, then the matching starters -- with one pager for its
 * cards and its table; the Assets page's cards page the same way; the pickers search the service.
 */
const tpl = (n: number): TemplateRow => ({ templateId: `T${n}`, tenantId: 2960, name: `Wound template ${n}`, status: 'PUBLISHED',
  currentPublishedVersion: 1, hasDraft: false, origin: 'BLANK', tags: [], updatedAt: '2026-10-20T10:00:00Z' } as unknown as TemplateRow);
const starter = (n: number, category = 'Clinical'): StarterRow => ({ key: `s${n}`, name: `Starter ${n}`, category, components: 4 });
const lib = (rows: TemplateRow[], total: number, starters = [starter(1), starter(2), starter(3)]): TemplateLibrary =>
  ({ templates: rows, starters, total, counts: { templates: total }, categories: ['Wound care'] });
const card = (n: number): AssetCard => ({ assetId: `A${n}`, tenantId: 2960, name: `Logo ${n}`, kind: 'LOGO', state: 'APPROVED', restricted: false,
  templates: 0, reports: 0 } as unknown as AssetCard);
const assetLib = (rows: AssetCard[], total: number): AssetLibrary => ({ assets: rows, total, counts: { all: 70, signaturesAndStamps: 9 }, profiles: [] });

function providers(api: unknown, tab?: string) {
  return [
    provideZonelessChangeDetection(),
    { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(tab ? { tab } : {}) } } },
    { provide: Router, useValue: { navigate: vi.fn(() => Promise.resolve(true)) } },
    { provide: ReportStudioApi, useValue: api },
    { provide: RsTabCounts, useValue: { refresh: vi.fn() } },
    { provide: Dialog, useValue: { open: vi.fn() } },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
    { provide: WorkspaceDirectory, useValue: { remembered: () => null, nameOf: () => 'Riverside' } },
    { provide: AuthService, useValue: { isPlatformAdmin: () => false, canOpen: () => true, role: () => 'TENANT_ADMIN', isTenantAdmin: () => true,
      user: signal({ appUserId: 4640, tenantName: 'Riverside' }) } },
  ];
}

function templatesWith(answer: (q: TemplateQuery) => TemplateLibrary) {
  const api = {
    list: vi.fn((q: TemplateQuery, _t?: number | null) => of(answer(q))),
    templateThumbnail: vi.fn(() => of({ body: null, headers: { get: () => '' } })),
    brandProfiles: vi.fn(() => of([])),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: providers(api) });
  return { api, screen: TestBed.runInInjectionContext(() => new ReportTemplates()) };
}

afterEach(() => vi.useRealTimers());

describe('Templates -- the server pages them', () => {
  it('asks for the first page and shows the templates, then the starters, under one total', () => {
    const { api, screen } = templatesWith(() => lib([tpl(1), tpl(2)], 2));
    screen.ngOnInit();
    expect(api.list).toHaveBeenCalledWith({ archived: false, q: '', category: '', state: '', owner: '', limit: 50, offset: 0 }, null);
    expect(screen.total()).toBe(5);
    expect(screen.filtered().map(i => i.id)).toEqual(['T1', 'T2', 'starter:s1', 'starter:s2', 'starter:s3']);
    expect(screen.groups().map(g => g.label)).toEqual(['All 5', 'This workspace 2', 'Starters 3', 'Shared with me 0']);
    expect(screen.categories()).toEqual(['Clinical', 'Wound care']);
  });

  it('puts the starters after the last template: page 2 of 52 templates holds two templates and the starters', () => {
    const { api, screen } = templatesWith(q => lib(q.offset === 50 ? [tpl(51), tpl(52)] : Array.from({ length: 50 }, (_, i) => tpl(i + 1)), 52));
    screen.ngOnInit();
    expect(screen.filtered().length).toBe(50);
    expect(screen.filtered().every(i => i.kind === 'template')).toBe(true);
    screen.goTo(2);
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 50, offset: 50 }), null);
    expect(screen.filtered().map(i => i.id)).toEqual(['T51', 'T52', 'starter:s1', 'starter:s2', 'starter:s3']);
    expect(screen.total()).toBe(55);
  });

  it('sends the filters to the service, each from page 1; the owner words become ME, STARTER, COPY', () => {
    const { api, screen } = templatesWith(() => lib([tpl(1)], 1));
    screen.ngOnInit();
    screen.goTo(2);
    screen.setState('HAS_DRAFT');
    expect(screen.page()).toBe(1);
    screen.setCategory('Wound care');
    screen.setOwner('me');
    expect(api.list).toHaveBeenLastCalledWith({ archived: false, q: '', category: 'Wound care', state: 'HAS_DRAFT', owner: 'ME', limit: 50,
      offset: 0 }, null);
    screen.setOwner('copy');
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ owner: 'COPY' }), null);
    // A state other than Published leaves the starters out, as before.
    expect(screen.filtered().some(i => i.kind === 'starter')).toBe(false);
    screen.showArchived(true);
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ archived: true, offset: 0 }), null);
  });

  it('searches on the service after the typing stops; Starters and This workspace are their own lists', () => {
    vi.useFakeTimers();
    const { api, screen } = templatesWith(() => lib([tpl(1)], 1));
    screen.ngOnInit();
    api.list.mockClear();
    screen.onSearch('kn');
    screen.onSearch('knee');
    vi.advanceTimersByTime(350);
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'knee', offset: 0 }), null);
    screen.onSearch('');
    vi.advanceTimersByTime(350);
    screen.setGroup('starters');
    expect(screen.filtered().map(i => i.kind)).toEqual(['starter', 'starter', 'starter']);
    expect(screen.total()).toBe(3);
    screen.setGroup('workspace');
    expect(screen.filtered().map(i => i.id)).toEqual(['T1']);
    expect(screen.total()).toBe(1);
  });

  it('refresh keeps the page; a page emptied under the reader goes back to the last one with rows', () => {
    const { api, screen } = templatesWith(q => lib(q.offset === 100 ? [] : [tpl(51)], 60, []));
    screen.ngOnInit();
    screen.goTo(2);
    screen.refresh();
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 50 }), null);
    screen.goTo(3);
    expect(screen.page()).toBe(2);
    expect(screen.filtered().map(i => i.id)).toEqual(['T51']);
  });
});

describe('Assets -- the server pages the cards', () => {
  function assetsWith(answer: (q: AssetQuery) => AssetLibrary, tab?: string) {
    const api = { assets: vi.fn((q: AssetQuery, _t?: number | null) => of(answer(q))) };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: providers(api, tab) });
    return { api, screen: TestBed.runInInjectionContext(() => new ReportAssets()) };
  }

  it('asks for the first page, counts the tabs from the scope and pages on', () => {
    const { api, screen } = assetsWith(q => assetLib(q.offset === 50 ? [card(51)] : [card(1), card(2)], 70));
    screen.ngOnInit();
    expect(api.assets).toHaveBeenCalledWith({ q: '', kind: '', state: '', used: '', limit: 50, offset: 0 }, null);
    expect(screen.total()).toBe(70);
    expect(screen.counts()).toEqual({ all: 70, signaturesAndStamps: 9 });
    expect(screen.restrictedCount()).toBe(9);
    screen.goTo(2);
    expect(screen.shown().map(a => a.assetId)).toEqual(['A51']);
    screen.refresh();
    expect(api.assets).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 50 }), null);
  });

  it('a filter, the size or the signatures tab asks again from page 1', () => {
    vi.useFakeTimers();
    const { api, screen } = assetsWith(() => assetLib([card(1)], 70));
    screen.ngOnInit();
    screen.goTo(2);
    screen.setState('REJECTED');
    expect(api.assets).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'REJECTED', offset: 0 }), null);
    screen.goTo(2);
    screen.setSize(100);
    expect(api.assets).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 100, offset: 0 }), null);
    screen.setKind('LOGO');
    screen.setTab('restricted');
    expect(api.assets).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'SIGNATURES_AND_STAMPS', offset: 0 }), null);
    expect(screen.kind()).toBe('');
    screen.onSearch('quill');
    vi.advanceTimersByTime(350);
    expect(api.assets).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'quill', kind: 'SIGNATURES_AND_STAMPS' }), null);
    expect(screen.filtering()).toBe(true);
  });
});

describe('Pickers -- they search the service', () => {
  it('the pick search shows only when the select holds less than all, and says what it found after the typing stops', () => {
    vi.useFakeTimers();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(RsPickSearch);
    fixture.componentRef.setInput('shown', 200);
    fixture.componentRef.setInput('total', 200);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input')).toBeNull();
    fixture.componentRef.setInput('total', 340);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('200 of 340 shown');
    const seen: string[] = [];
    fixture.componentInstance.search.subscribe(q => seen.push(q));
    fixture.componentInstance.type('clin');
    fixture.componentInstance.type('clinic ');
    vi.advanceTimersByTime(350);
    expect(seen).toEqual(['clinic']);
  });

  it('the API sends q, kinds, limit and offset for templates, assets and the usable pickers', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const api = TestBed.inject(ReportStudioApi);
    const http = TestBed.inject(HttpTestingController);
    const ok = (data: unknown) => ({ status: 'SUCCESS', message: '', data });
    let got: TemplateLibrary | null = null;
    api.list({ q: 'knee', state: 'LIVE', owner: 'ME', limit: 100, offset: 100 }, 2960).subscribe(l => got = l);
    const t = http.expectOne(r => r.url === `${API_BASE}/reportTemplate.json/fetchAll`);
    expect(Object.fromEntries(t.request.params.keys().map(k => [k, t.request.params.get(k)]))).toEqual({ archived: 'false', q: 'knee', limit: '100',
      offset: '100', tenantId: '2960', state: 'LIVE', owner: 'ME' });
    t.flush(ok({ templates: [tpl(1)], starters: [] }));
    // An older answer (no total): counted from its rows.
    expect(got!.total).toBe(1);
    expect(got!.counts.templates).toBe(1);
    api.assets({ kind: 'STAMP', used: 'USED' }).subscribe();
    const a = http.expectOne(r => r.url === `${API_BASE}/reportAsset.json/assets`);
    expect(a.request.params.get('kind')).toBe('STAMP');
    expect(a.request.params.get('used')).toBe('USED');
    expect(a.request.params.get('limit')).toBe('50');
    a.flush(ok({ assets: [], total: 0, counts: { all: 0, signaturesAndStamps: 0 }, profiles: [] }));
    api.usable('T1', { q: 'dr', kinds: ['SIGNATURE', 'STAMP'] }).subscribe();
    const u = http.expectOne(r => r.url === `${API_BASE}/reportAsset.json/usable`);
    expect(u.request.params.get('templateId')).toBe('T1');
    expect(u.request.params.get('kinds')).toBe('SIGNATURE,STAMP');
    expect(u.request.params.get('q')).toBe('dr');
    expect(u.request.params.get('limit')).toBe('200');
    u.flush(ok({ assets: [], profiles: [], total: 0 }));
    http.verify();
  });
});
