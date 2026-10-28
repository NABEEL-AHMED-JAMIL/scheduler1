import { describe, it, expect, vi, beforeEach } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { ToastService } from '../../../shared/ui/toast.service';
import { ReportStudioApi } from '../report-studio.api';
import { RsTabCounts } from '../rs-tab-counts';
import { AssetCard, AssetDetail, AssetLibrary, AssetVersion } from '../assets.model';
import { ReportAssets } from './assets';
import { AssetPage } from './asset-page';
import { BrandProfilePage } from './brand-profile';
import { UploadPanel } from './upload-panel';

/**
 * Owner 2026-10-27 ("a loader on each component"; "a sort on each table"): the asset pages say they are loading, say when
 * a read failed, and never claim "No assets yet" or 0 before the answer; the asset page's two tables sort.
 */
const failed = () => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' }));
const card = (n: number): AssetCard => ({ assetId: `A${n}`, tenantId: 2960, name: `Logo ${n}`, kind: 'LOGO', state: 'APPROVED', restricted: false,
  templates: 0, reports: 0 } as unknown as AssetCard);

const authFake = { isPlatformAdmin: () => false, canOpen: () => true, isTenantAdmin: () => true, role: () => 'TENANT_ADMIN',
  user: signal({ appUserId: 4640, tenantName: 'Riverside' }) };

function base(api: unknown) {
  return [
    provideZonelessChangeDetection(),
    { provide: ReportStudioApi, useValue: api },
    { provide: AuthService, useValue: authFake },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
    { provide: Dialog, useValue: { open: vi.fn() } },
  ];
}

beforeEach(() => { try { localStorage.clear(); } catch { /* none */ } });

describe('Assets -- loading, empty, error', () => {
  function screen(answer: () => Observable<AssetLibrary>) {
    const api = { assets: vi.fn(answer) };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...base(api),
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      { provide: Router, useValue: { navigate: vi.fn(() => Promise.resolve(true)) } },
      { provide: RsTabCounts, useValue: { refresh: vi.fn() } },
      { provide: WorkspaceDirectory, useValue: { remembered: () => null, nameOf: () => 'Riverside' } }] });
    const s = TestBed.runInInjectionContext(() => new ReportAssets());
    s.ngOnInit();
    return s;
  }

  it('is loading, not "No assets yet" or 0, until the cards answer', () => {
    const s = screen(() => NEVER);
    expect(s.loading()).toBe(true);
    expect(s.loaded()).toBe(false);
    expect(s.error()).toBe('');
  });

  it('is empty once an empty page answers', () => {
    const s = screen(() => of({ assets: [], total: 0, counts: { all: 0, signaturesAndStamps: 0 }, profiles: [] }));
    expect(s.loading()).toBe(false);
    expect(s.loaded()).toBe(true);
    expect(s.shown()).toEqual([]);
  });

  it('says the cards could not be read, in plain words', () => {
    const s = screen(failed);
    expect(s.loading()).toBe(false);
    expect(s.error()).toBe('The assets could not be read.');
  });

  it('keeps the cards on a refresh (no first-load skeleton again)', () => {
    let calls = 0;
    const s = screen(() => (++calls === 1 ? of({ assets: [card(1)], total: 1, counts: { all: 1, signaturesAndStamps: 0 }, profiles: [] }) : NEVER));
    s.refresh();
    expect(s.loading()).toBe(true);
    expect(s.loaded()).toBe(true);
    expect(s.shown().map(a => a.assetId)).toEqual(['A1']);
  });
});

const version = (n: number, over: Partial<AssetVersion> = {}): AssetVersion => ({ version: n, state: 'SUPERSEDED', reviewRequired: false,
  contentType: 'image/png', bytes: 100, width: 10, height: 10, alpha: false, sha256: '', uploadedBy: 1, ...over });
const detail = (over: Partial<AssetDetail> = {}): AssetDetail => ({ ...card(1), versions: [
  version(3, { uploadedByName: 'Zoe', uploadedAt: '2026-10-03T10:00:00Z' }),
  version(1, { uploadedByName: 'Adam', uploadedAt: '2026-10-01T10:00:00Z' }),
  version(2, { uploadedByName: 'Mia', uploadedAt: '2026-10-02T10:00:00Z' }),
], usage: [
  { kind: 'TEMPLATE', name: 'Wound summary', templateId: 'T1', templateVersion: 2, assetVersion: 1, reports: 4 },
  { kind: 'BRAND_PROFILE', name: 'Default brand', assetVersion: 3 },
  { kind: 'TEMPLATE', name: 'Admission note', templateId: 'T2', templateVersion: 1, assetVersion: 2, reports: 12 },
], usageTemplates: 2, usageReports: 16, grants: [], activity: [],
  you: { userId: 4640, owner: false, workspaceAdmin: true, mayPlace: false, mayGrant: true }, ...over } as AssetDetail);

describe('Asset page -- sorting, the grant picker, a failed reload', () => {
  function page(api: Record<string, unknown>) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...base(api), provideRouter([])] });
    TestBed.overrideComponent(AssetPage, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(AssetPage);
    fixture.componentRef.setInput('assetId', 'A1');
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('keeps the versions in the API order until a heading is picked, then sorts both ways', () => {
    const p = page({ asset: vi.fn(() => of(detail())), people: vi.fn(() => of([])) });
    expect(p.sortedVersions().map(v => v.version)).toEqual([3, 1, 2]);
    p.versionSort.toggle('version');
    expect(p.sortedVersions().map(v => v.version)).toEqual([3, 2, 1]);
    p.versionSort.toggle('version');
    expect(p.sortedVersions().map(v => v.version)).toEqual([1, 2, 3]);
    p.versionSort.toggle('uploadedBy');
    expect(p.sortedVersions().map(v => v.uploadedByName)).toEqual(['Adam', 'Mia', 'Zoe']);
    // The side panel's "Uploaded by" reads the API's list, which a sort does not touch.
    expect(p.a()!.versions.map(v => v.version)).toEqual([3, 1, 2]);
  });

  it('sorts where it is used by its report count, a brand profile (no count) last', () => {
    const p = page({ asset: vi.fn(() => of(detail())), people: vi.fn(() => of([])) });
    p.usageSort.toggle('use');
    expect(p.sortedUsage().map(u => u.name)).toEqual(['Admission note', 'Wound summary', 'Default brand']);
  });

  it('is loading until the asset answers, then says when the people to grant to could not be read', () => {
    const waiting = page({ asset: vi.fn(() => NEVER) });
    expect(waiting.state.pending()).toBe(true);
    const p = page({ asset: vi.fn(() => of(detail())), people: vi.fn(failed) });
    expect(p.state.loaded()).toBe(true);
    expect(p.peopleState.error()).toBe('The people could not be read.');
    expect(p.peopleState.loading()).toBe(false);
  });

  it('a reload that fails keeps the asset on screen and says so in a toast, not a page error', () => {
    let calls = 0;
    const p = page({ asset: vi.fn(() => (++calls === 1 ? of(detail()) : failed())), people: vi.fn(() => of([])) });
    p.load();
    expect(p.a()).not.toBeNull();
    expect(p.error()).toBe('');
    expect(TestBed.inject(ToastService).error).toHaveBeenCalled();
  });

  it('a first read that fails says so in plain words', () => {
    const p = page({ asset: vi.fn(failed) });
    expect(p.state.pending()).toBe(false);
    expect(p.error()).toBe('The asset could not be read.');
  });
});

describe('Brand profile and Upload -- the pickers say why they are empty', () => {
  it('a picker whose read failed says so (not "nothing to choose")', () => {
    const api = { brandProfile: vi.fn(() => NEVER), usable: vi.fn(failed), previewBrand: vi.fn(() => NEVER) };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...base(api), provideRouter([])] });
    TestBed.overrideComponent(BrandProfilePage, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(BrandProfilePage);
    fixture.componentRef.setInput('profileId', 'P');
    fixture.detectChanges();
    const p = fixture.componentInstance;
    expect(p.state.pending()).toBe(true);
    expect(p.pickerState.logos.error()).toBe('The logos could not be read.');
    expect(p.pickerState.stamps.error()).toBe('The stamps could not be read.');
  });

  it('the upload panel\'s Belongs to says it is loading, then why it failed', () => {
    let answer: () => Observable<unknown> = () => NEVER;
    const api = { people: vi.fn(() => answer()) };
    const make = () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [...base(api),
        { provide: DIALOG_DATA, useValue: { custodian: true, library: true } }, { provide: DialogRef, useValue: { close: vi.fn() } }] });
      const panel = TestBed.runInInjectionContext(() => new UploadPanel());
      panel.ngOnInit();
      return panel;
    };
    expect(make().peopleState.loading()).toBe(true);
    answer = () => of([]);
    const empty = make();
    expect(empty.peopleState.loaded()).toBe(true);
    expect(empty.people()).toEqual([]);
    answer = failed;
    const bad = make();
    expect(bad.peopleState.loading()).toBe(false);
    expect(bad.peopleState.error()).toBe('The people could not be read.');
  });
});
