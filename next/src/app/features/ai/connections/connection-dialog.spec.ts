import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { ToastService } from '../../../shared/ui/toast.service';
import { ConnectionDialog } from './connection-dialog';

/**
 * The endpoint, key and workspace stars were decoration: nothing on the controls required
 * them, so the form was "valid" without them and each was caught by a toast of its own after
 * the fact, with no field marked. They are validators now, driven by the provider.
 */
function dialogWith(data: any) {
  const post = vi.fn(() => of({ status: 'SUCCESS', message: 'Saved.' }));
  const toast = { success: vi.fn(), error: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: DIALOG_DATA, useValue: data },
      { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: HttpClient, useValue: { post } },
      { provide: ToastService, useValue: toast },
    ],
  });
  const dialog = TestBed.runInInjectionContext(() => new ConnectionDialog());
  TestBed.tick();
  return { dialog, post, toast };
}

describe('ConnectionDialog -- required fields are validators', () => {
  it('requires a key for a provider that needs one on a new connection', () => {
    const { dialog } = dialogWith({});
    dialog.form.patchValue({ name: 'x', provider: 'OpenAI', defaultModel: 'gpt' });
    TestBed.tick();
    expect(dialog.form.get('apiKey')!.hasError('required')).toBe(true);
  });

  it('keeps a stored key without asking again on an edit', () => {
    const { dialog } = dialogWith({ connection: { connectionId: 3, name: 'x', provider: 'OpenAI', defaultModel: 'gpt', apiKeyConfigured: true } });
    TestBed.tick();
    expect(dialog.form.get('apiKey')!.valid).toBe(true);
  });

  it('asks for no key from Ollama', () => {
    const { dialog } = dialogWith({});
    dialog.form.patchValue({ name: 'x', provider: 'Ollama', defaultModel: 'llama' });
    TestBed.tick();
    expect(dialog.form.get('apiKey')!.valid).toBe(true);
  });

  it('requires an endpoint only from a provider without a built-in one', () => {
    const { dialog } = dialogWith({});
    expect(dialog.form.get('apiEndpoint')!.valid).toBe(true);
    dialog.form.patchValue({ provider: 'AzureOpenAI' });
    TestBed.tick();
    expect(dialog.form.get('apiEndpoint')!.hasError('required')).toBe(true);
    dialog.form.patchValue({ apiEndpoint: '   ' });
    expect(dialog.form.get('apiEndpoint')!.hasError('required')).toBe(true);
  });

  it('requires the workspace when a platform administrator creates one', () => {
    const { dialog } = dialogWith({ tenants: [{ tenantId: 5, tenantName: 'Acme' }] });
    expect(dialog.form.get('tenantId')!.hasError('required')).toBe(true);
  });

  it('marks the fields and says so on an invalid save, without posting', () => {
    const { dialog, post, toast } = dialogWith({});
    dialog.save();
    expect(post).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Check the highlighted fields.');
    expect(dialog.form.get('name')!.touched).toBe(true);
  });

  it('labels the edit confirm "Save changes", like every other edit dialog', () => {
    const { dialog } = dialogWith({ connection: { connectionId: 3, name: 'x', provider: 'OpenAI', defaultModel: 'gpt' } });
    expect(dialog.confirmLabel()).toBe('Save changes');
  });
});
