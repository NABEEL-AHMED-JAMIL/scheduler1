import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { of } from 'rxjs';
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
  const get = vi.fn((url: string) => {
    if (url.endsWith('/aiConnection.json/list')) return of({ status: API_SUCCESS, data: [{ connectionId: 7, name: 'Ollama', provider: 'Ollama', defaultModel: 'gemma3:1b', isDefault: true }] });
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
  return { component, post, toast };
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
});
