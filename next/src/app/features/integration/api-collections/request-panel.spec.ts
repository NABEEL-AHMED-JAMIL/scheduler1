import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { ToastService } from '../../../shared/ui/toast.service';
import { ApiCollectionsApi } from './api-collections.service';
import { RequestPanel, RequestPanelData } from './request-panel';

/**
 * MIG-247: the API editor, in the wide side panel beside the collection. Method and URL, then Params, Headers,
 * Auth, Body, Schemas and Settings; Test runs the saved API through the runner and shows the masked answer.
 * The runner tests what is saved, so with unsaved changes the button is "Save & test".
 */
const DETAIL = {
  requestId: 1000, collectionId: 1000, folderId: null, name: 'Get status', description: null, method: 'GET',
  urlTemplate: 'https://example.com/', headers: [], queryParams: [], bodyType: 'NONE', bodyTemplate: null, authMode: 'INHERIT',
  paramsSchema: null, extractRules: null, assertRules: null, pagination: null, timeoutMs: 30000, retry: null,
  aiCallable: false, aiWriteAllowed: false, enabled: true, sortOrder: 0, collectionVersion: 3,
};
const RUN = { outcome: 'OK', statusCode: 200, durationMs: 120, pages: 1, attempts: 1, truncated: false, responseBytes: 12, body: { ok: true } };

function panelWith(data: Partial<RequestPanelData>, api: Partial<Record<string, unknown>> = {}) {
  const stub = {
    getRequest: vi.fn(() => of({ status: 'SUCCESS', message: '', data: DETAIL })),
    saveRequest: vi.fn(() => of({ status: 'SUCCESS', message: 'API request saved.', data: { id: 1000, collectionId: 1000, version: 4 } })),
    test: vi.fn(() => of({ status: 'SUCCESS', message: 'The API answered HTTP 200 in 120 ms.', data: RUN })),
    ...api,
  };
  const ref = { close: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: DIALOG_DATA, useValue: {
        collection: { collectionId: 1000, name: 'LIVE-CHECK 0928 httpbin', currentVersion: 3 }, requestId: 1000, folders: [],
        environments: [
          { environmentId: 40, name: 'Staging', isDefault: false, variables: [] },
          { environmentId: 41, name: 'Prod', isDefault: true, variables: [{ key: 'token', secret: true, value: null, configured: true }] },
        ],
        defaultAuth: { type: 'BEARER', bearer: { token: '{{token}}' } }, canManage: true, ...data,
      } },
      { provide: DialogRef, useValue: ref },
      { provide: ApiCollectionsApi, useValue: stub },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
    ],
  });
  return { stub, ref };
}

describe('RequestPanel -- opening', () => {
  it('reads the whole definition of a saved API', () => {
    const { stub } = panelWith({});
    const panel = TestBed.runInInjectionContext(() => new RequestPanel());
    expect(stub.getRequest).toHaveBeenCalledWith(1000);
    expect(panel.edit()?.urlTemplate).toBe('https://example.com/');
    expect(panel.heading()).toBe('Edit API · Get status');
    expect(panel.dirty()).toBe(false);
    expect(panel.testLabel()).toBe('Test');
  });

  it('starts a new API blank, in the folder it was added from', () => {
    const { stub } = panelWith({ requestId: null, folderId: 31 });
    const panel = TestBed.runInInjectionContext(() => new RequestPanel());
    expect(stub.getRequest).not.toHaveBeenCalled();
    expect(panel.edit()?.folderId).toBe(31);
    expect(panel.heading()).toBe('New API');
    expect(panel.testLabel()).toBe('Save & test');
  });

  it('runs with the default environment unless another is picked', () => {
    panelWith({});
    const panel = TestBed.runInInjectionContext(() => new RequestPanel());
    expect(panel.environmentId()).toBe(41);
  });

  it('shows what "From the collection" signs in with, and that its secret is set without showing it', () => {
    panelWith({});
    const panel = TestBed.runInInjectionContext(() => new RequestPanel());
    expect(panel.authView()).toEqual({ mode: 'BEARER', settings: [{ key: 'token', value: '{{token}}', secret: 'configured' }] });
  });
});

describe('RequestPanel -- save and test', () => {
  it('tests the saved API with the chosen environment and the run\'s own variables', () => {
    const { stub } = panelWith({});
    const panel = TestBed.runInInjectionContext(() => new RequestPanel());
    panel.runVariables.set([{ key: 'clinic', value: 'north', enabled: true }, { key: 'off', value: 'x', enabled: false }]);
    panel.test();
    expect(stub.saveRequest).not.toHaveBeenCalled();
    expect(stub.test).toHaveBeenCalledWith({ requestId: 1000, environmentId: 41, variables: { clinic: 'north' } });
    expect(panel.result()?.statusCode).toBe(200);
  });

  it('saves unsaved changes first, then tests what was saved', () => {
    const { stub } = panelWith({});
    const panel = TestBed.runInInjectionContext(() => new RequestPanel());
    panel.patch({ urlTemplate: 'https://httpbin.org/anything' });
    expect(panel.testLabel()).toBe('Save & test');
    panel.test();
    expect(stub.saveRequest).toHaveBeenCalledWith(expect.objectContaining({ requestId: 1000, urlTemplate: 'https://httpbin.org/anything' }));
    expect(stub.test).toHaveBeenCalled();
    expect(panel.dirty()).toBe(false);
  });

  it('creates a new API on its first save and keeps editing it', () => {
    const { stub, ref } = panelWith({ requestId: null }, {
      saveRequest: vi.fn(() => of({ status: 'SUCCESS', message: 'API request saved.', data: { id: 1002, collectionId: 1000, version: 4 } })),
    });
    const panel = TestBed.runInInjectionContext(() => new RequestPanel());
    panel.patch({ name: 'UI-CHECK anything', urlTemplate: 'https://httpbin.org/anything' });
    panel.save();
    expect(stub.saveRequest).toHaveBeenCalledWith(expect.objectContaining({ requestId: null, collectionId: 1000, name: 'UI-CHECK anything' }));
    expect(panel.edit()?.requestId).toBe(1002);
    expect(panel.heading()).toBe('Edit API · UI-CHECK anything');
    panel.close();
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('shows the service\'s refusal and keeps the edits', () => {
    panelWith({}, { saveRequest: vi.fn(() => of({ status: 'ERROR', message: 'The request holds a secret in plain text (X-Token).' })) });
    const panel = TestBed.runInInjectionContext(() => new RequestPanel());
    panel.patch({ description: 'changed' });
    panel.save();
    expect(panel.error()).toBe('The request holds a secret in plain text (X-Token).');
    expect(panel.dirty()).toBe(true);
  });

  it('checks the form before anything is sent', () => {
    const { stub } = panelWith({});
    const panel = TestBed.runInInjectionContext(() => new RequestPanel());
    panel.patch({ extractRules: '{oops' });
    panel.save();
    expect(stub.saveRequest).not.toHaveBeenCalled();
    expect(panel.error()).toBe('Extract rules is not valid JSON.');
  });

  it('says why a test could not run', () => {
    panelWith({}, { test: vi.fn(() => of({ status: 'ERROR', message: 'API environment not found.' })) });
    const panel = TestBed.runInInjectionContext(() => new RequestPanel());
    panel.test();
    expect(panel.result()).toBeNull();
    expect(panel.error()).toBe('API environment not found.');
  });
});

describe('RequestPanel -- the panel', () => {
  function render(canManage: boolean) {
    panelWith({ canManage });
    const fixture = TestBed.createComponent(RequestPanel);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }
  const buttonNames = (el: HTMLElement) => Array.from(el.querySelectorAll('button')).map(b => (b.getAttribute('aria-label') || b.textContent || '').trim());

  it('has the prototype\'s tabs, and Test and Save for a workspace administrator', () => {
    const { el } = render(true);
    expect(Array.from(el.querySelectorAll('[role="tab"]')).map(t => t.textContent!.trim()))
      .toEqual(['Params', 'Headers', 'Auth', 'Body', 'Schemas', 'Settings']);
    expect(buttonNames(el)).toEqual(expect.arrayContaining(['Test', 'Save']));
    expect((el.querySelector('#apiUrl') as HTMLInputElement).value).toBe('https://example.com/');
  });

  it('shows a multipart or binary body\'s shape: its files are named in the workspace\'s storage (MIG-306)', () => {
    const { fixture, el } = render(true);
    const screen = fixture.componentInstance;
    screen.tab.set('body');
    screen.patch({ bodyType: 'MULTIPART' });
    fixture.detectChanges();
    expect(el.textContent).toContain('a file from one of this workspace\'s storage connections');
    expect((el.querySelector('#apiBody') as HTMLTextAreaElement).placeholder).toContain('"file": {"bucket": "claims"');
    screen.patch({ bodyType: 'BINARY' });
    fixture.detectChanges();
    expect(el.textContent).toContain('One file from this workspace\'s storage, sent as the whole body');
    screen.patch({ bodyType: 'JSON' });
    fixture.detectChanges();
    expect((el.querySelector('#apiBody') as HTMLTextAreaElement).placeholder).toBe('');
  });

  it('is read-only for a tenant user: no Save, no Test, nothing editable', () => {
    const { el } = render(false);
    const names = buttonNames(el);
    expect(names).not.toContain('Save');
    expect(names).not.toContain('Test');
    expect((el.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
  });
});
