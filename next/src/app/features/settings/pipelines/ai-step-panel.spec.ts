import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { AiStepPanel } from './ai-step-panel';
import { API_SUCCESS } from '../../../core/api/api.config';

/**
 * A prompt list that could not be read is not a workspace without prompts. The panel used to
 * say "No active prompt in this workspace. Create one first." whenever the request failed,
 * sending somebody off to create a prompt that already existed.
 */
function panelWith(answer: () => Observable<any>) {
  let calls = 0;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: DIALOG_DATA, useValue: { tagKey: 'summary', fieldsAbove: [] } },
      { provide: DialogRef, useValue: { close: () => {} } },
      { provide: HttpClient, useValue: { get: () => { calls++; return answer(); } } },
    ],
  });
  const panel = TestBed.runInInjectionContext(() => new AiStepPanel());
  return { panel, calls: () => calls };
}

describe('AiStepPanel -- loading the prompts', () => {
  it('records the failure rather than reporting an empty workspace', () => {
    const { panel } = panelWith(() => new Observable(sub => sub.error({ error: {} })));
    expect(panel.loadError()).toBe('The prompts could not be loaded.');
  });

  it('records a refused answer with the server\'s sentence', () => {
    const { panel } = panelWith(() => of({ status: 'ERROR', message: 'Not allowed.' }));
    expect(panel.loadError()).toBe('Not allowed.');
  });

  it('asks again on retry and clears the error once it works', () => {
    let fail = true;
    const { panel, calls } = panelWith(() => fail
      ? new Observable(sub => sub.error({ error: {} }))
      : of({ status: API_SUCCESS, message: '', data: [{ promptId: 1, name: 'Summarise', version: 1, status: 'Active', variables: [] }] }));
    fail = false;
    panel.loadPrompts();
    expect(calls()).toBe(2);
    expect(panel.loadError()).toBe('');
    expect(panel.prompts().length).toBe(1);
  });
});
