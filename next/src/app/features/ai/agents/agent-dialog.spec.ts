import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { AgentDialog } from './agent-dialog';

/**
 * The Model field used to be free text for every provider, including Ollama -- where the only
 * valid values are whatever is actually pulled on the host, a fact `ollama.json/listModels`
 * already knows and the AI Models screen already surfaces. Typing a name that was never pulled
 * saved an agent that would fail at the first message, with nothing at save time to say so.
 */
function dialogFor(agent?: Record<string, unknown>, listModelsResponse?: unknown, providers = ['Ollama', 'OpenAI']) {
  TestBed.resetTestingModule();
  const get = vi.fn().mockReturnValue(of(listModelsResponse ?? {
    status: 'SUCCESS', message: '',
    data: [{ name: 'qwen3:8b' }, { name: 'llama3.1:8b' }],
  }));
  TestBed.configureTestingModule({
    providers: [
      { provide: DIALOG_DATA, useValue: { agent, providers } },
      { provide: DialogRef, useValue: { close: () => {} } },
      { provide: HttpClient, useValue: { get } },
    ],
  });
  const dialog = TestBed.runInInjectionContext(() => new AgentDialog());
  return { dialog, get };
}

describe('AgentDialog -- the Model field for Ollama', () => {
  it('fetches the installed model list when the dialog opens on Ollama', () => {
    const { get } = dialogFor(undefined, undefined, ['Ollama']);
    expect(get).toHaveBeenCalledWith(expect.stringContaining('/ollama.json/listModels'));
  });

  it('does NOT fetch the model list for a hosted provider -- there is nothing local to list', () => {
    const { get } = dialogFor({ provider: 'OpenAI' }, undefined, ['Ollama', 'OpenAI']);
    expect(get).not.toHaveBeenCalled();
  });

  it('offers the installed models once the list has loaded', () => {
    const { dialog } = dialogFor(undefined, undefined, ['Ollama']);
    expect(dialog.ollamaModels()).toEqual(['qwen3:8b', 'llama3.1:8b']);
    expect(dialog.modelOptions()).toEqual(['qwen3:8b', 'llama3.1:8b']);
  });

  it('keeps a saved model that is no longer installed, rather than silently blanking the field', () => {
    // The exact scenario this exists for: an agent was configured against a model that was
    // later deleted on the AI Models screen (or pulled on a different host entirely). The
    // saved value is still what the agent runs with until someone changes it -- it must not
    // vanish from the field just because this dialog opened.
    const { dialog } = dialogFor({ provider: 'Ollama', model: 'mistral:7b' }, undefined, ['Ollama']);
    expect(dialog.form.get('model')!.value).toBe('mistral:7b');
    expect(dialog.modelOptions()).toContain('mistral:7b');
    expect(dialog.modelOptions()).toContain('qwen3:8b');
  });

  it('does not list a saved model twice when it happens to already be installed', () => {
    const { dialog } = dialogFor({ provider: 'Ollama', model: 'qwen3:8b' }, undefined, ['Ollama']);
    expect(dialog.modelOptions().filter(m => m === 'qwen3:8b')).toHaveLength(1);
  });

  it('switching the provider TO Ollama mid-dialog fetches the list', () => {
    const { dialog, get } = dialogFor({ provider: 'OpenAI' }, undefined, ['Ollama', 'OpenAI']);
    expect(get).not.toHaveBeenCalled();
    dialog.form.get('provider')!.setValue('Ollama');
    expect(get).toHaveBeenCalledWith(expect.stringContaining('/ollama.json/listModels'));
  });

  it('a failed fetch leaves the field usable rather than stuck loading forever', () => {
    TestBed.resetTestingModule();
    const get = vi.fn().mockReturnValue(of({ status: 'ERROR', message: 'Could not reach Ollama.' }));
    TestBed.configureTestingModule({
      providers: [
        { provide: DIALOG_DATA, useValue: { agent: undefined, providers: ['Ollama'] } },
        { provide: DialogRef, useValue: { close: () => {} } },
        { provide: HttpClient, useValue: { get } },
      ],
    });
    const dialog = TestBed.runInInjectionContext(() => new AgentDialog());
    expect(dialog.loadingOllamaModels()).toBe(false);
    expect(dialog.ollamaModels()).toEqual([]);
  });

  it('does not refetch on a second switch back to Ollama once the list is already loaded', () => {
    const { dialog, get } = dialogFor({ provider: 'Ollama' }, undefined, ['Ollama', 'OpenAI']);
    expect(get).toHaveBeenCalledTimes(1);
    dialog.form.get('provider')!.setValue('OpenAI');
    dialog.form.get('provider')!.setValue('Ollama');
    expect(get).toHaveBeenCalledTimes(1);
  });
});
