import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { RunWithDialog } from './run-with-dialog';
import { ToastService } from '../../../shared/ui/toast.service';
import { API_SUCCESS } from '../../../core/api/api.config';
import { choiceBody, optionLabel, picksChanged, picksOf, stepsOf } from './ai-model-choice';

/**
 * MIG-251: "Run with…" from a schedule's row -- run now, with a model chosen per AI step for this run only
 * (sourceJob.json/runSourceJobWith). A job whose pipeline has no AI step says so rather than offering an empty choice.
 */
const CHOICES = { jobId: 2849, taskDetailId: 1865, steps: [
  { stepKey: 'summary', label: 'Summarise the file', runIn: 'server', promptId: 12, modelOptionId: '8', options: [
    { modelOptionId: 7, connectionId: 5, connectionName: 'OpenAI prod', model: 'gpt-4.1', isDefault: true, connectionActive: true },
    { modelOptionId: 8, connectionId: 6, connectionName: 'Claude', model: 'claude-x', isDefault: false, connectionActive: true },
    { modelOptionId: 9, connectionId: 9, connectionName: 'Old', model: 'legacy', isDefault: false, connectionActive: false },
  ] },
  { stepKey: 'tags', label: null, runIn: 'worker', promptId: 13, optionsError: 'The AI service could not be reached to list this step\'s models.' },
] };

function openDialog() {
  const close = vi.fn();
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [RunWithDialog], providers: [provideHttpClient(), provideHttpClientTesting(),
    { provide: DIALOG_DATA, useValue: { jobId: 2849, jobName: 'UI-CHECK registry chain job 0929' } },
    { provide: DialogRef, useValue: { close } },
    { provide: ToastService, useValue: toast }] });
  const fixture = TestBed.createComponent(RunWithDialog);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  const ask = http.expectOne(r => r.url.endsWith('/sourceJob.json/aiModelChoice'));
  expect(ask.request.params.get('jobId')).toBe('2849');
  return { fixture, http, ask, close, toast, el: fixture.nativeElement as HTMLElement };
}

const button = (el: HTMLElement, text: string) =>
  [...el.querySelectorAll('button')].find(b => b.textContent!.trim() === text) as HTMLButtonElement | undefined;

describe('Run with…', () => {
  it('lists each AI step with the models it may run on, starting from the schedule\'s setting', () => {
    const { fixture, ask, el } = openDialog();
    ask.flush({ status: API_SUCCESS, data: CHOICES });
    fixture.detectChanges();
    const select = el.querySelector<HTMLSelectElement>('[data-step="summary"] select')!;
    const options = [...select.options].map(o => o.textContent!.trim());
    expect(options).toEqual(['The step\'s default', 'OpenAI prod · gpt-4.1 (default)', 'Claude · claude-x', 'Old · legacy — connection off']);
    expect(select.value).toBe('8');
    expect(select.options[3].disabled).toBe(true);
    expect(el.querySelector('[data-step="tags"]')!.textContent).toContain('could not be reached');
  });

  it('runs with the models chosen, for this run only, and closes', () => {
    const { fixture, http, ask, el, close, toast } = openDialog();
    ask.flush({ status: API_SUCCESS, data: CHOICES });
    fixture.detectChanges();
    const select = el.querySelector<HTMLSelectElement>('[data-step="summary"] select')!;
    select.value = '7';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    button(el, 'Run')!.click();
    const run = http.expectOne(r => r.url.endsWith('/sourceJob.json/runSourceJobWith'));
    expect(run.request.method).toBe('POST');
    expect(run.request.body).toEqual({ jobId: 2849, steps: [{ stepKey: 'summary', modelOptionId: '7' }] });
    run.flush({ status: API_SUCCESS, message: 'SourceJob run successfully.' });
    expect(toast.success).toHaveBeenCalled();
    expect(close).toHaveBeenCalledWith(true);
  });

  it('keeps the dialog open and says why when the run is refused', () => {
    const { fixture, http, ask, el, close, toast } = openDialog();
    ask.flush({ status: API_SUCCESS, data: CHOICES });
    fixture.detectChanges();
    button(el, 'Run')!.click();
    http.expectOne(r => r.url.endsWith('/sourceJob.json/runSourceJobWith'))
      .flush({ status: 'ERROR', message: 'A job can\'t be run while its last run is still in flight (\'Queue\', \'Start\', \'Running\').' });
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('still in flight'));
    expect(close).not.toHaveBeenCalled();
  });

  it('says there is nothing to choose for a pipeline with no AI step, and offers no Run', () => {
    const { fixture, ask, el } = openDialog();
    ask.flush({ status: API_SUCCESS, message: '0 AI step(s).', data: { jobId: 2849, taskDetailId: 1865, steps: [] } });
    fixture.detectChanges();
    expect(el.textContent).toContain('no AI steps');
    expect(button(el, 'Run')).toBeUndefined();
    expect(button(el, 'Close')).toBeTruthy();
  });

  it('says so when the job\'s steps cannot be read', () => {
    const { fixture, ask, el } = openDialog();
    ask.flush({ status: 'ERROR', message: 'SourceJob not found.' });
    fixture.detectChanges();
    expect(el.textContent).toContain('SourceJob not found.');
    expect(button(el, 'Run')).toBeUndefined();
  });
});

describe('ai model choice', () => {
  const steps = stepsOf(CHOICES);
  it('reads the steps and what each runs on today', () => {
    expect(steps.map(s => s.stepKey)).toEqual(['summary', 'tags']);
    expect(picksOf(steps)).toEqual({ summary: '8', tags: '' });
    expect(stepsOf([])).toEqual([]);
  });

  it('sends only the steps with a model chosen', () => {
    expect(choiceBody(2849, { summary: '7', tags: '' })).toEqual({ jobId: 2849, steps: [{ stepKey: 'summary', modelOptionId: '7' }] });
    expect(picksChanged(steps, { summary: '8', tags: '' })).toBe(false);
    expect(picksChanged(steps, { summary: '', tags: '' })).toBe(true);
  });

  it('names a model by its connection', () => {
    expect(optionLabel({ modelOptionId: 1, model: 'm', effectiveModel: 'm-2026' })).toBe('m-2026');
  });
});
