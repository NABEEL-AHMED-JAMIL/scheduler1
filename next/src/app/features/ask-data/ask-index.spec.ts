import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { AskDataApi } from './ask-data.api';
import { AskData } from './ask-data';
import { AskIndexStatus, linkParts, searchedText } from './ask-data.model';
import { AskIndex } from './ask-index';

const STATUS: AskIndexStatus = {
  enabled: true, documents: true, forms: false, folders: [{ connection: 'acme-files', prefix: 'policies/' }],
  indexed: { document: 8, form: 0, file: 3, chunks: 21, failed: 1 },
  failures: [{ source: 'file#acme-files/policies/locked.pdf', title: 'locked.pdf', error: 'This PDF is password-protected.', at: '2026-10-05T14:57:38' }],
  lastSweepAt: '2026-10-05T14:57:38.573', lastSweepNote: '8 indexed, 0 unchanged, 0 removed, 1 failed', dateUpdated: '2026-10-05T14:57:30',
  available: true, reachable: true, embeddingModel: 'nomic-embed-text', rule: 'Each question searches only what the asker can open.',
};

interface Setup {
  status?: () => Observable<unknown>;
  save?: (body: unknown) => Observable<unknown>;
}

function render(setup: Setup = {}) {
  const api = {
    indexStatus: vi.fn(setup.status ?? (() => of({ status: 'SUCCESS', data: STATUS }))),
    saveIndex: vi.fn(setup.save ?? ((body: unknown) => of({ status: 'SUCCESS', data: { ...STATUS, ...(body as object), sweeping: true } }))),
    buckets: vi.fn(() => of({ status: 'SUCCESS', data: [{ bucket: 'acme-files', label: 'Acme files' }, { bucket: 'acme-inbox' }] })),
  };
  const toast = { success: vi.fn(), error: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [AskIndex],
    providers: [provideZonelessChangeDetection(), { provide: AskDataApi, useValue: api }, { provide: ToastService, useValue: toast }],
  });
  const fixture = TestBed.createComponent(AskIndex);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const q = (sel: string) => el.querySelector(sel) as HTMLElement | null;
  return { fixture, el, q, api, toast, panel: fixture.componentInstance };
}

describe('Ask your data -- the search index (MIG-281)', () => {
  it('splits a source link into its route and query, so a form link opens its form', () => {
    expect(linkParts('/forms/submissions?formId=3')).toEqual({ path: '/forms/submissions', query: { formId: '3' } });
    expect(linkParts('/documents/files?bucket=acme-files&prefix=policies%2F')).toEqual({
      path: '/documents/files', query: { bucket: 'acme-files', prefix: 'policies/' } });
    expect(linkParts('/documents/review/77')).toEqual({ path: '/documents/review/77', query: {} });
    expect(searchedText({ documents: 8, runOutputs: 0, forms: 2, files: 3, index: true })).toBe('8 documents, 0 pipeline results, 2 forms and 3 files');
  });

  it('says in one line what the index holds, and opens to the choice', () => {
    const { fixture, q, el, api } = render();
    expect(api.indexStatus).toHaveBeenCalledTimes(1);
    expect(q('[data-test=index-summary]')!.textContent).toContain('On: 8 documents, 0 form records, 3 files, 1 failed');
    (q('[data-test=index-toggle]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(api.buckets).toHaveBeenCalledTimes(1);
    expect((q('[data-test=index-enabled]') as HTMLInputElement).checked).toBe(true);
    expect((q('[data-test=index-forms]') as HTMLInputElement).checked).toBe(false);
    expect(el.querySelectorAll('[data-test=index-folder]')).toHaveLength(1);
    expect(q('[data-test=index-counts]')!.textContent).toContain('21');
    expect(q('[data-test=index-sweep]')!.textContent).toContain('8 indexed, 0 unchanged, 0 removed, 1 failed');
    expect(el.textContent).toContain('locked.pdf: This PDF is password-protected.');
    expect((q('[data-test=index-save]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('saves the choice as it was made and says indexing runs in the background', () => {
    const { fixture, q, api, toast, panel } = render();
    (q('[data-test=index-toggle]') as HTMLButtonElement).click();
    fixture.detectChanges();
    panel.forms.set(true);
    (q('[data-test=index-add-folder]') as HTMLButtonElement).click();
    panel.setFolder(1, { prefix: 'claims/' });
    fixture.detectChanges();
    expect((q('[data-test=index-save]') as HTMLButtonElement).disabled).toBe(false);
    (q('[data-test=index-save]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(api.saveIndex).toHaveBeenCalledWith({ enabled: true, documents: true, forms: true,
      folders: [{ connection: 'acme-files', prefix: 'policies/' }, { connection: 'acme-files', prefix: 'claims/' }] });
    expect(toast.success).toHaveBeenCalledWith('Search index saved. Indexing runs in the background.');
    expect(panel.dirty()).toBe(false);
  });

  it('shows the server\'s words when a folder is refused, and keeps the choice to fix', () => {
    const { fixture, q, panel } = render({
      save: () => throwError(() => new HttpErrorResponse({ status: 400, error: { status: 'ERROR', message: '"bravo" is not a connection you can open.' } })),
    });
    (q('[data-test=index-toggle]') as HTMLButtonElement).click();
    panel.setFolder(0, { connection: 'bravo' });
    fixture.detectChanges();
    (q('[data-test=index-save]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(q('[data-test=index-error]')!.textContent).toContain('"bravo" is not a connection you can open.');
    expect(panel.folders()[0].connection).toBe('bravo');
  });

  it('says when no index is set up on the platform', () => {
    const { q } = render({ status: () => of({ status: 'SUCCESS', data: { ...STATUS, enabled: false, available: false } }) });
    expect(q('[data-test=index-summary]')!.textContent).toContain('Not set up on this platform');
  });
});

describe('Ask your data -- the index panel is a workspace administrator\'s', () => {
  function page(admin: boolean) {
    const api = {
      suggestions: vi.fn(() => of({ status: 'SUCCESS', data: { suggestions: [], searched: { documents: 1, runOutputs: 0 }, warnings: [] } })),
      ask: vi.fn(),
      indexStatus: vi.fn(() => of({ status: 'SUCCESS', data: STATUS })),
      saveIndex: vi.fn(),
      buckets: vi.fn(() => of({ status: 'SUCCESS', data: [] })),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AskData],
      providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: AskDataApi, useValue: api },
        { provide: AuthService, useValue: { isTenantAdmin: () => admin, user: () => ({ appUserId: 4640, tenantId: 2960 }) } }],
    });
    const fixture = TestBed.createComponent(AskData);
    fixture.detectChanges();
    return { el: fixture.nativeElement as HTMLElement, api };
  }

  it('shows it to an administrator and not to a member', () => {
    const admin = page(true);
    expect(admin.el.querySelector('[data-test=ask-index]')).not.toBeNull();
    expect(admin.api.indexStatus).toHaveBeenCalledTimes(1);
    const member = page(false);
    expect(member.el.querySelector('[data-test=ask-index]')).toBeNull();
    expect(member.api.indexStatus).not.toHaveBeenCalled();
  });
});
