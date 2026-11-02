import { describe, it, expect, vi, afterEach } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
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
 * Owner 2026-10-20, after the library: Assets page on the server; the pickers search the service. The Templates page
 * (reports redesign 2026-11-02) reads every template in the service's largest pages and filters them in the browser.
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

describe('Templates -- read whole, filtered in the browser (reports redesign 2026-11-02)', () => {
  it('asks for every live and archived template in the service\'s largest pages; the search needs no new read', () => {
    const { api, screen } = templatesWith(q => (q.archived ? lib([], 0) : lib([tpl(1), tpl(2)], 2)));
    screen.ngOnInit();
    expect(api.list).toHaveBeenCalledWith({ archived: false, limit: 200, offset: 0 }, null);
    expect(api.list).toHaveBeenCalledWith({ archived: true, limit: 200, offset: 0 }, null);
    expect(screen.visible().map(t => t.templateId)).toEqual(['T1', 'T2']);
    api.list.mockClear();
    screen.onSearch('template 2');
    expect(api.list).not.toHaveBeenCalled();
    expect(screen.visible().map(t => t.templateId)).toEqual(['T2']);
    // The starters are hidden until ticked, and then follow the search too.
    screen.setHidden('starters', true);
    expect(screen.shownStarters()).toEqual([]);
    screen.onSearch('starter');
    expect(screen.shownStarters().map(s => s.key)).toEqual(['s1', 's2', 's3']);
  });

  it('a read that fails says why; a refresh reads everything again', () => {
    let down = true;
    const { api, screen } = templatesWith(q => (q.archived ? lib([], 0) : lib([tpl(1)], 1)));
    api.list.mockImplementation((q: TemplateQuery) => (down ? throwError(() => ({ error: { message: 'Media is down.' } }))
      : of(q.archived ? lib([], 0) : lib([tpl(1)], 1))));
    screen.ngOnInit();
    expect(screen.error()).toBe('Media is down.');
    down = false;
    screen.refresh();
    expect(screen.error()).toBe('');
    expect(screen.rows().map(t => t.templateId)).toEqual(['T1']);
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
