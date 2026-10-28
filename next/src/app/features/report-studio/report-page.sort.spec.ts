import { describe, it, expect, vi, beforeEach } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { provideRouter } from '@angular/router';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { ReportStudioApi } from './report-studio.api';
import { ReportDetail } from './report-studio.model';
import { ReportPage } from './report-page';

/**
 * Owner 2026-10-27: a report's Versions table sorts; Generate again's template versions say they are loading, or why they
 * could not be read; the first page's preview says when it could not be drawn.
 */
const failed = () => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' }));
const report = {
  reportId: 'R1', tenantId: 2960, name: 'Wound summary', label: 'RPT-0005', templateId: 'T1', status: 'GENERATED', currentVersion: 3,
  versions: [
    { versionId: 'V3', version: 3, templateVersion: 2, createdAt: '2026-10-03T10:00:00Z', outputs: [{ format: 'PDF' }], diagnostics: [] },
    { versionId: 'V1', version: 1, templateVersion: 1, createdAt: '2026-10-01T10:00:00Z', outputs: [], diagnostics: [],
      approval: { signed: true, approverName: 'Dr. Patel' } },
    { versionId: 'V2', version: 2, templateVersion: 2, createdAt: '2026-10-02T10:00:00Z', outputs: [], diagnostics: [] },
  ],
  jobs: [], activity: [],
} as unknown as ReportDetail;

function page(api: Record<string, unknown>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]),
    // people(): the approvers' names upstream reads on open (an empty list here).
    { provide: ReportStudioApi, useValue: { people: () => of([]), ...api } },
    { provide: AuthService, useValue: { canOpen: () => true, isPlatformAdmin: () => false, user: signal({ appUserId: 4640, tenantName: 'Riverside' }) } },
    { provide: Dialog, useValue: { open: vi.fn() } },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }] });
  TestBed.overrideComponent(ReportPage, { set: { template: '', imports: [] } });
  const fixture = TestBed.createComponent(ReportPage);
  fixture.componentRef.setInput('reportId', 'R1');
  fixture.detectChanges();
  return fixture.componentInstance;
}

const withVersions = (answer: () => Observable<unknown>, thumb: () => Observable<unknown> = () => NEVER) => ({
  report: vi.fn(() => of(report)), template: vi.fn(answer), reportThumbnail: vi.fn(thumb),
});

beforeEach(() => { try { localStorage.clear(); } catch { /* none */ } });

describe('Report page -- the Versions table sorts (owner 2026-10-27)', () => {
  it('keeps the service\'s order, then sorts by version both ways', () => {
    const p = page(withVersions(() => NEVER));
    expect(p.sortedVersions().map(v => v.version)).toEqual([3, 1, 2]);
    p.versionSort.toggle('version');
    expect(p.sortedVersions().map(v => v.version)).toEqual([3, 2, 1]);
    p.versionSort.toggle('version');
    expect(p.sortedVersions().map(v => v.version)).toEqual([1, 2, 3]);
  });

  it('sorts by approval as the column words it: Signed, then Superseded, then nothing', () => {
    const p = page(withVersions(() => NEVER));
    p.versionSort.toggle('signed');
    expect(p.sortedVersions().map(v => v.version)).toEqual([1, 2, 3]);
    expect(p.signedWord(report.versions[2])).toBe('Superseded');
    expect(p.signedWord(report.versions[0])).toBeNull();
  });
});

describe('Report page -- Generate again\'s template versions: loading, empty, error (owner 2026-10-27)', () => {
  it('is loading until the template answers', () => {
    const p = page(withVersions(() => NEVER));
    expect(p.versionsState.loading()).toBe(true);
    expect(p.templateVersions()).toEqual([]);
  });

  it('is empty when the template has no published version', () => {
    const p = page(withVersions(() => of({ versions: [{ versionId: 'D', version: 3, state: 'DRAFT' }], currentPublishedVersion: null })));
    expect(p.versionsState.loaded()).toBe(true);
    expect(p.templateVersions()).toEqual([]);
  });

  it('says the versions could not be read, and the page preview too', () => {
    const p = page(withVersions(failed, failed));
    expect(p.versionsState.loading()).toBe(false);
    expect(p.versionsState.error()).toBe('The template\'s versions could not be read.');
    expect(p.thumbLoading()).toBe(false);
    expect(p.thumbError()).toBe('The page preview is not available right now.');
  });
});
