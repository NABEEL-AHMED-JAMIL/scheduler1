import { describe, it, expect, vi, beforeEach } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { ToastService } from '../../../shared/ui/toast.service';
import { ReportStudioApi } from '../report-studio.api';
import { TemplateDetail } from '../report-studio.model';
import { NewReport } from './new-report';
import { ReportTemplatePage } from '../template-page';
import { PageLimitCard } from '../page-limit-card';
import { ReportFileDialog } from '../report-file-dialog';

/**
 * Owner 2026-10-27, Create report and its neighbours: step 1's templates say they are loading and why they failed (with
 * Try again), picking a template says it is opening, the preview never spins for ever on an answer without a PDF (the
 * source's sample and schema moved into Data and mapping, redesigned 2026-10-27); a template's data contract sorts; the
 * page limit and the file viewer can try again.
 */
const failed = () => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' }));
const authFake = { canOpen: () => true, isPlatformAdmin: () => false, isManagedSession: () => false, user: signal({ appUserId: 4640 }) };

function providers(api: unknown, query: Record<string, string> = {}) {
  return [
    provideZonelessChangeDetection(), provideRouter([]),
    { provide: ReportStudioApi, useValue: api },
    { provide: AuthService, useValue: authFake },
    { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
    { provide: WorkspaceDirectory, useValue: { remembered: () => null, nameOf: () => 'Riverside' } },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
    { provide: Dialog, useValue: { open: vi.fn() } },
  ];
}

function wizard(api: Record<string, unknown>, query: Record<string, string> = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: providers(api, query) });
  TestBed.overrideComponent(NewReport, { set: { template: '', imports: [] } });
  const fixture = TestBed.createComponent(NewReport);
  fixture.detectChanges();
  return fixture.componentInstance;
}

beforeEach(() => { try { localStorage.clear(); } catch { /* none */ } });

describe('Create report -- step 1: loading, empty, error (owner 2026-10-27)', () => {
  it('is loading, not "No published template yet", until the templates answer', () => {
    const w = wizard({ list: vi.fn(() => NEVER) });
    expect(w.loadingTemplates()).toBe(true);
    expect(w.templatesLoaded()).toBe(false);
    expect(w.templatesError()).toBe('');
  });

  it('is empty once an empty page answers', () => {
    const w = wizard({ list: vi.fn(() => of({ templates: [], starters: [], total: 0, counts: { templates: 0 }, categories: [] })) });
    expect(w.templatesLoaded()).toBe(true);
    expect(w.shown()).toEqual([]);
  });

  it('says the templates could not be read in their own place, not the top banner', () => {
    const w = wizard({ list: vi.fn(failed) });
    expect(w.loadingTemplates()).toBe(false);
    expect(w.templatesError()).toBe('The templates could not be read.');
    expect(w.error()).toBe('');
  });

  it('opening a template says so, and a failure offers Try again', () => {
    const template = vi.fn(() => NEVER as Observable<TemplateDetail>);
    const w = wizard({ list: vi.fn(() => NEVER), template }, { templateId: 'T1' });
    expect(w.picking()).toBe(true);
    template.mockImplementation(failed);
    w.pick('T1');
    expect(w.picking()).toBe(false);
    expect(w.error()).toBe('The template could not be read.');
    expect(w.canRetry()).toBe(true);
  });
});

describe('Create report -- the preview never spins for ever (owner 2026-10-27)', () => {
  it('an answer without a PDF is said', () => {
    const json = new HttpResponse<Blob>({ body: new Blob(['{}']), headers: new HttpHeaders({ 'Content-Type': 'application/json' }) });
    const w = wizard({ list: vi.fn(() => NEVER), previewHtml: vi.fn(() => of({ problems: [], records: 1 })), previewPdf: vi.fn(() => of(json)),
      inspect: vi.fn(() => NEVER) });
    w.t.set({ templateId: 'T1', currentPublishedVersion: 1 } as unknown as TemplateDetail);
    w.source.set({ connector: 'SAMPLE', sampleId: 'S1' });
    w.check();
    expect(w.checking()).toBe(false);
    expect(w.pdfUrl()).toBeNull();
    expect(w.checkError()).toBe('The PDF could not be made; check again.');
  });
});

describe('Create report -- Data and mapping decides what may be generated (redesign 2026-10-27)', () => {
  it('blocks generating while a field needs a person, and names one report per row', () => {
    const w = wizard({ list: vi.fn(() => NEVER) });
    w.needCount.set(2);
    expect(w.blocked()).toBe(true);
    w.needCount.set(0);
    expect(w.blocked()).toBe(false);
    expect(w.title()).toBe('Create a report');
    w.step.set(2);
    w.t.set({ templateId: 'T1', name: 'Patient intake summary', currentPublishedVersion: 8 } as unknown as TemplateDetail);
    expect(w.title()).toBe('New report from “Patient intake summary” v8');
  });
});

describe('A template\'s data contract sorts (owner 2026-10-27)', () => {
  it('keeps the definition\'s order, then sorts by path both ways, and required first', () => {
    const t = { templateId: 'T1', name: 'Wound', status: 'PUBLISHED', samples: [], versions: [], draft: null,
      published: { version: 1, definition: { template: { dataContract: { fields: [
        { path: 'site', type: 'string', required: false }, { path: 'area', type: 'number', required: true }, { path: 'when', type: 'date', required: true }] } } } } };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: providers({ template: vi.fn(() => of(t)) }) });
    TestBed.overrideComponent(ReportTemplatePage, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(ReportTemplatePage);
    fixture.componentRef.setInput('templateId', 'T1');
    fixture.detectChanges();
    const p = fixture.componentInstance;
    expect(p.sortedContract().map(f => f.path)).toEqual(['site', 'area', 'when']);
    p.contractSort.toggle('path');
    expect(p.sortedContract().map(f => f.path)).toEqual(['area', 'site', 'when']);
    p.contractSort.toggle('path');
    expect(p.sortedContract().map(f => f.path)).toEqual(['when', 'site', 'area']);
    p.contractSort.toggle('required');
    expect(p.sortedContract().map(f => f.path)).toEqual(['area', 'when', 'site']);
  });
});

describe('The page limit and the file viewer try again (owner 2026-10-27)', () => {
  it('the page limit: loading (no old numbers), a plain error, then Try again reads it', () => {
    let answer: () => Observable<unknown> = () => NEVER;
    const api = { pageLimit: vi.fn(() => answer()) };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: providers(api) });
    TestBed.overrideComponent(PageLimitCard, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(PageLimitCard);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    expect(c.limit()).toBeNull();
    expect(c.error()).toBe('');
    answer = failed;
    c.load();
    expect(c.error()).toBe('The page limit could not be read.');
    answer = () => of({ tenantId: 2960, limit: 300, workspaceLimit: null, ceiling: 300, ceilingOverride: null, platformCeiling: 300, hardMax: 2000,
      raisedBy: 'PLATFORM_ADMIN', rowVersion: 2, editable: true, ceilingEditable: false });
    c.load();
    expect(c.error()).toBe('');
    expect(c.limit()?.limit).toBe(300);
  });

  it('the file viewer: a failed read can be read again', () => {
    let answer: () => Observable<unknown> = failed;
    const api = { download: vi.fn(() => answer()) };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...providers(api),
      { provide: DIALOG_DATA, useValue: { reportId: 'R1', version: 1, format: 'HTML', fileName: 'r.html', title: 'Wound' } },
      { provide: DialogRef, useValue: { close: vi.fn() } }] });
    TestBed.overrideComponent(ReportFileDialog, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(ReportFileDialog);
    fixture.detectChanges();
    const d = fixture.componentInstance;
    expect(d.error()).toBe('The file could not be read.');
    answer = () => NEVER;
    d.read();
    expect(d.error()).toBe('');
    expect(d.url()).toBeNull();
  });
});
