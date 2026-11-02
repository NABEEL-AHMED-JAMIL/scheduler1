import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { ReportStudioApi } from '../report-studio.api';
import { AssetDetail, AssetVersion } from '../assets.model';
import { AssetPage } from './asset-page';
import { AssetVersionPanel, versionStateWord } from './asset-version-panel';

/**
 * Owner 2026-11-02 ("I upload new stamp but on view section it's not show the new stamp and there is not option to check
 * old version"): a waiting version is its own panel with its picture beside the one in use, any version opens from the
 * Versions table, and a placement follows the latest approved version unless a version is pinned on purpose.
 */
const version = (n: number, over: Partial<AssetVersion> = {}): AssetVersion => ({ version: n, state: 'SUPERSEDED', reviewRequired: true,
  contentType: 'image/png', bytes: 2048, width: 600, height: 600, alpha: true, sha256: '', uploadedBy: 1, ...over });
const stamp = (versions: AssetVersion[], currentVersion: number | null): AssetDetail => ({
  assetId: 'S1', tenantId: 1006, assetNo: 4, label: 'AST-004', kind: 'STAMP', name: 'Clinical records stamp', restricted: true,
  status: 'ACTIVE', state: 'APPROVED', rowVersion: 1, templates: 1, reports: 3, currentVersion, versions,
  usage: [
    { kind: 'TEMPLATE', name: 'Discharge summary', templateId: 'T1', templateVersion: 4, assetVersion: 1, reports: 3, pinned: true },
    { kind: 'TEMPLATE', name: 'Imaging report', templateId: 'T2', templateVersion: 2, assetVersion: 2, reports: 0, pinned: false },
  ], usageTemplates: 2, usageReports: 3, grants: [], activity: [],
  you: { userId: 7, owner: false, workspaceAdmin: true, mayPlace: true, mayGrant: true },
} as unknown as AssetDetail);

function page(a: AssetDetail, asset = vi.fn(() => of(a))) {
  const open = vi.fn();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]),
    { provide: ReportStudioApi, useValue: { asset, people: vi.fn(() => of([])), list: vi.fn(() => of({ templates: [], total: 0 })),
      usable: vi.fn(() => of({ assets: [], total: 0 })) } },
    { provide: AuthService, useValue: { isPlatformAdmin: () => false, canOpen: () => true, user: signal({ appUserId: 7 }) } },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
    { provide: Dialog, useValue: { open } }] });
  TestBed.overrideComponent(AssetPage, { set: { template: '', imports: [] } });
  const fixture = TestBed.createComponent(AssetPage);
  fixture.componentRef.setInput('assetId', 'S1');
  fixture.detectChanges();
  return { p: fixture.componentInstance, open };
}

describe('An asset\'s versions on its page', () => {
  const waiting = stamp([version(3, { state: 'PENDING', uploadedBy: 1000, uploadedByName: 'Pat Owner (platform team)' }),
    version(2, { state: 'APPROVED', reviewedByName: 'Summit admin' }), version(1, { reviewedByName: 'Jordan Reyes' })], 2);

  it('keeps the approved version as current and the new upload as waiting', () => {
    const { p } = page(waiting);
    expect(p.current()?.version).toBe(2);
    expect(p.pending()?.version).toBe(3);
    expect(p.firstUpload()?.version).toBe(1);
  });

  it('opens any version -- waiting, current or replaced -- in its own panel', () => {
    const { p, open } = page(waiting);
    for (const v of waiting.versions) p.openVersion(v);
    expect(open).toHaveBeenCalledTimes(3);
    expect(open.mock.calls.map(c => c[0])).toEqual([AssetVersionPanel, AssetVersionPanel, AssetVersionPanel]);
    expect(open.mock.calls.map(c => (c[1] as { data: { version: AssetVersion } }).data.version.version)).toEqual([3, 2, 1]);
  });

  it('places the latest approved version by default, and pins a version only when one is picked', () => {
    const { p } = page(waiting);
    expect(p.placeVersion()).toBe(null);
    expect(p.versionOptions()[0]).toMatchObject({ value: '', label: 'Latest approved version', badge: 'now v2' });
    expect(p.versionOptions().slice(1).map(o => o.value)).toEqual(['2', '1']);
  });

  it('names each state in words', () => {
    expect(waiting.versions.map(versionStateWord)).toEqual(['Waiting for approval', 'Current', 'Replaced']);
    expect(versionStateWord(version(4, { state: 'REJECTED' }))).toBe('Rejected');
  });
});

describe('One version\'s panel', () => {
  it('names the templates that pin that version, not the ones following the latest', () => {
    const a = stamp([version(2, { state: 'APPROVED' }), version(1)], 2);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]),
      { provide: ReportStudioApi, useValue: { assetFile: vi.fn(() => of(new Blob())) } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: DIALOG_DATA, useValue: { asset: a, version: a.versions[1] } }] });
    const panel = TestBed.runInInjectionContext(() => new AssetVersionPanel());
    expect(panel.pinnedHere().map(u => u.name)).toEqual(['Discharge summary']);
    expect(panel.current()?.version).toBe(2);
  });
});

describe('The asset page, owner 2026-11-02 review', () => {
  const grant = (id: string, active: boolean) => ({ grantId: id, granteeUserId: 1, granteeName: 'Summit admin', grantedBy: 1, active,
    revokedAt: active ? null : '2026-10-30T21:05:00Z' });

  it('counts only the grants in force; ended ones are kept apart', () => {
    const a = { ...stamp([version(2, { state: 'APPROVED' })], 2), grants: [grant('G1', false), grant('G2', false), grant('G3', true)] } as AssetDetail;
    const { p } = page(a);
    expect(p.activeGrants().map(g => g.grantId)).toEqual(['G3']);
    expect(p.endedGrants().map(g => g.grantId)).toEqual(['G1', 'G2']);
  });

  it('says how each template version prints it, pinned, following or both', () => {
    const { p } = page(stamp([version(2, { state: 'APPROVED' })], 2));
    expect(p.usageVersion({ kind: 'TEMPLATE', name: 'T', pinned: false, follows: true, assetVersion: 2 })).toBe('Latest approved (v2 now)');
    expect(p.usageVersion({ kind: 'TEMPLATE', name: 'T', pinned: true, follows: false, assetVersion: 1 })).toBe('v1 (pinned)');
    expect(p.usageVersion({ kind: 'TEMPLATE', name: 'T', pinned: true, follows: true, assetVersion: 1, placements: 2 }))
      .toBe('Latest approved (v2 now) and v1 (pinned)');
  });

  it('says an asset of another workspace is not here, with no retry', () => {
    const notHere = vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404, error: { code: 'NO_SUCH_ASSET', message: 'No such asset.' } })));
    const { p } = page(stamp([], null), notHere as never);
    expect(p.missing()).toBe(true);
    expect(p.error()).toBe('');
  });
});
