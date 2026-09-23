import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { PromptEdit } from './prompt-edit';
import { placeholdersOf } from './prompt-model';
import { ToastService } from '../../../shared/ui/toast.service';
import { AuthService } from '../../../core/auth/auth.service';
import { API_SUCCESS } from '../../../core/api/api.config';

/**
 * The editor's one rule that the server also enforces: every {{placeholder}} in the template
 * is a declared variable. The editor adds the row itself and refuses to save or try until
 * the row is there, so a typo never reaches a run as an empty string.
 */
function editor() {
  const get = vi.fn((url: string, options?: { params?: Record<string, string> }) => {
    if (url.endsWith('/aiConnection.json/list')) return of({ status: API_SUCCESS, data: [{ connectionId: 7, name: 'Ollama', provider: 'Ollama', defaultModel: 'gemma3:1b', isDefault: true }] });
    if (url.endsWith('/aiPrompt.json/objectText')) return of({ status: API_SUCCESS, message: 'Read discharge.pdf: 420 characters.', data: {
      bucket: options?.params?.['bucket'], key: options?.params?.['key'], name: 'discharge.pdf', kind: 'text',
      text: 'Discharge summary for M. Okafor. Total billed $188.50.', chars: 54, totalChars: 54, truncated: false,
    } });
    throw new Error(`unexpected GET ${url}`);
  });
  const post = vi.fn(() => of({ status: API_SUCCESS, message: 'ok', data: {} }));
  const toast = { success: vi.fn(), error: vi.fn(), info: () => {} };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: { get, post } },
    { provide: ToastService, useValue: toast },
    { provide: Router, useValue: { navigate: () => {} } },
    { provide: AuthService, useValue: { isPlatformAdmin: () => false, canManageAgents: () => true, user: () => ({ appUserId: 1 }) } },
  ] });
  const component = TestBed.runInInjectionContext(() => new PromptEdit());
  component.ngOnInit();
  TestBed.tick();
  return { component, post, toast, get };
}

describe('placeholdersOf', () => {
  it('reads each placeholder once, in order, tolerating spaces inside the braces', () => {
    expect(placeholdersOf('Claim {{claim_id}}: {{ document_text }} -- {{claim_id}}')).toEqual(['claim_id', 'document_text']);
  });
});

describe('PromptEdit', () => {
  it('adds a variable row for a placeholder typed into the template', () => {
    const { component } = editor();
    component.form.patchValue({ userTemplate: 'Summarise {{document_text}} for {{claim_id}}' });
    TestBed.tick();
    expect(component.declaredNames()).toEqual(['document_text', 'claim_id']);
    expect(component.undeclared()).toEqual([]);
  });

  it('refuses to try or save while a placeholder has no variable', () => {
    const { component, post, toast } = editor();
    component.form.patchValue({ name: 'x', userTemplate: 'Hello {{who}}' });
    TestBed.tick();
    // Take the auto-added row away again, as a person deleting it would.
    component.removeVariable(0);
    component.tryIt();
    component.save(true);
    expect(post).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('{{who}}'));
  });

  it('sends the page as it is to try, samples included, and to save with activate', () => {
    const { component, post } = editor();
    component.form.patchValue({ name: 'Summarise', userTemplate: 'Claim {{claim_id}}', outputMode: 'json', outputSchema: '{"required":["a"]}' });
    TestBed.tick();
    component.variables.at(0).patchValue({ sample: 'CLM-1' });
    component.tryIt();
    expect(post).toHaveBeenCalledWith(expect.stringContaining('/aiPrompt.json/try'), expect.objectContaining({
      name: 'Summarise', userTemplate: 'Claim {{claim_id}}', outputMode: 'json', outputSchema: '{"required":["a"]}', activate: false,
      variables: [{ name: 'claim_id', type: 'text', required: true, sample: 'CLM-1' }],
    }));
    component.save(true);
    expect(post).toHaveBeenLastCalledWith(expect.stringContaining('/aiPrompt.json/save'), expect.objectContaining({ activate: true }));
  });

  /**
   * Try it on a file. The file's text rides on the try as `values`, keyed by variable, and
   * never becomes the saved sample; a file_name variable is filled with the name alongside.
   */
  it('fills a variable from a file for the try alone, and file_name with it', () => {
    const { component, post, get } = editor();
    component.form.patchValue({ name: 'Any file', userTemplate: '{{file_name}}: {{document_text}}' });
    TestBed.tick();
    component.variables.at(1).patchValue({ sample: 'hello' });
    // The picker is a dialog; drive the read directly with what it would have answered.
    (component as any).readObject('document_text', { bucket: 'medaxis', key: 'docs/discharge.pdf', name: 'discharge.pdf' });
    expect(get).toHaveBeenCalledWith(expect.stringContaining('/aiPrompt.json/objectText'), { params: { bucket: 'medaxis', key: 'docs/discharge.pdf' } });
    expect(component.sourceOf('document_text')?.name).toBe('discharge.pdf');
    expect(component.sourceOf('file_name')?.text).toBe('discharge.pdf');
    expect(component.trySourceList().map(s => s.variable).sort()).toEqual(['document_text', 'file_name']);

    component.tryIt();
    expect(post).toHaveBeenCalledWith(expect.stringContaining('/aiPrompt.json/try'), expect.objectContaining({
      values: { document_text: 'Discharge summary for M. Okafor. Total billed $188.50.', file_name: 'discharge.pdf' },
      // The sample is untouched: it documents the variable, the file is the try's business.
      variables: expect.arrayContaining([expect.objectContaining({ name: 'document_text', sample: 'hello' })]),
    }));
    component.save(false);
    expect(post).toHaveBeenLastCalledWith(expect.stringContaining('/aiPrompt.json/save'), expect.not.objectContaining({ values: expect.anything() }));

    component.clearSource('document_text');
    expect(component.sourceOf('document_text')).toBeUndefined();
    expect(component.sourceOf('file_name')).toBeDefined();
  });
});

/**
 * Opening an existing prompt whose read fails.
 *
 * The failure cleared the spinner and toasted, then rendered a blank "Edit prompt" form. Nothing
 * was loaded, so the save carried no promptId and CREATED a new prompt instead of a version of
 * the one being edited.
 */
describe('PromptEdit when the prompt cannot be read', () => {
  function openFailing() {
    let reads = 0;
    const get = vi.fn((url: string) => {
      if (url.endsWith('/aiPrompt.json/get')) { reads++; return throwError(() => ({ status: 500, error: { message: 'Database unavailable.' } })); }
      return of({ status: API_SUCCESS, data: [] });
    });
    const post = vi.fn((_url: string, _body?: unknown) => of({ status: API_SUCCESS, message: 'ok', data: {} }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: HttpClient, useValue: { get, post } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: () => {} } },
      provideRouter([]),
      { provide: AuthService, useValue: { isPlatformAdmin: () => false, canManageAgents: () => true, user: () => ({ appUserId: 1 }) } },
    ] });
    const fixture = TestBed.createComponent(PromptEdit);
    fixture.componentRef.setInput('promptId', '42');
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, post, reads: () => reads,
      text: () => ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ') };
  }

  it('shows why, with a way to try again, instead of an empty form', () => {
    const view = openFailing();
    expect(view.text()).toContain('Database unavailable.');
    expect((view.fixture.nativeElement as HTMLElement).querySelector('form')).toBeNull();

    const retry = Array.from((view.fixture.nativeElement as HTMLElement).querySelectorAll('button'))
      .find(b => (b.textContent ?? '').includes('Try again'))!;
    retry.click();
    expect(view.reads()).toBe(2);
  });

  it('never saves a version of a prompt it could not read', () => {
    const view = openFailing();
    view.component.form.patchValue({ name: 'x', userTemplate: 'Hello' });
    view.component.save(true);
    expect(view.post.mock.calls.filter(c => String(c[0]).endsWith('/aiPrompt.json/save'))).toHaveLength(0);
  });
});
