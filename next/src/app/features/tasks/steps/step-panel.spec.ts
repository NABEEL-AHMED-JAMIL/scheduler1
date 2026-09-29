import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { StepPanel, StepPanelData } from './step-panel';

/**
 * MIG-249: the selected step in the wide side panel -- its key and name, what it reads, how often it is tried, how long
 * it may take and what its failure means, and its task's settings: a form drawn from the task's configSchema, or
 * raw JSON when the task has none (every task until the Task Registry, MIG-231, sends one). Apply hands the edited
 * step back to the builder; nothing is saved from here.
 */
const SELECT_SCHEMA = {
  type: 'object',
  required: ['columns'],
  properties: { columns: { type: 'array', items: { type: 'string' } }, required: { type: 'boolean', title: 'Every column is required' } },
};

function open(data: Partial<StepPanelData>) {
  const ref = { close: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [StepPanel],
    providers: [
      provideZonelessChangeDetection(),
      { provide: DialogRef, useValue: ref },
      { provide: DIALOG_DATA, useValue: {
        step: { key: 'keep', task: 'select', config: { columns: { name: 'patient' } } },
        index: 1, earlierKeys: ['read'], problems: [], canManage: true,
        task: { code: 'select', description: 'Keeps the columns it names.', runsInEngine: true },
        ...data,
      } },
    ],
  });
  const fixture = TestBed.createComponent(StepPanel);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const type = (selector: string, text: string, event = 'input') => {
    const box = el.querySelector<HTMLInputElement>(selector)!;
    box.value = text;
    box.dispatchEvent(new Event(event));
    fixture.detectChanges();
  };
  const button = (name: string) => Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent!.trim() === name);
  return { fixture, el, ref, type, button, panel: fixture.componentInstance };
}

describe('StepPanel', () => {
  it('names the step and its task', () => {
    const { panel, el } = open({});
    expect(panel.heading()).toBe('Step 2 · keep');
    expect(panel.subtitle()).toBe('select · Keeps the columns it names.');
    expect(el.querySelector<HTMLInputElement>('#stepKey')!.value).toBe('keep');
  });

  it('offers only earlier steps as what the step reads', () => {
    const { el } = open({ earlierKeys: ['read', 'shape'] });
    const options = Array.from(el.querySelectorAll<HTMLOptionElement>('#stepInput option')).map(o => o.textContent!.trim());
    expect(options).toEqual(['The latest output before this step', 'read', 'shape']);
  });

  it('edits a task with no schema as raw JSON', () => {
    const { el, type, button, ref } = open({});
    const json = el.querySelector<HTMLTextAreaElement>('#stepConfig')!;
    expect(JSON.parse(json.value)).toEqual({ columns: { name: 'patient' } });
    type('#stepConfig', '{"columns": ["name"]}');
    button('Apply')!.click();
    expect(ref.close).toHaveBeenCalledWith({ key: 'keep', task: 'select', config: { columns: ['name'] } });
  });

  it('will not apply settings that are not JSON', () => {
    const { el, type, button, ref, fixture } = open({});
    type('#stepConfig', '{"columns": [');
    fixture.detectChanges();
    expect(el.textContent).toContain('Not JSON');
    expect(button('Apply')!.disabled).toBe(true);
    expect(ref.close).not.toHaveBeenCalled();
  });

  it('draws the settings from the task\'s schema, and can still switch to JSON', () => {
    const { el, type, button, ref, fixture } = open({
      step: { key: 'keep', task: 'select', config: { columns: ['name'] } },
      task: { code: 'select', name: 'Select columns', runsInEngine: true, configSchema: SELECT_SCHEMA },
    });
    expect(el.querySelector<HTMLTextAreaElement>('#cfg-columns')!.value).toBe('name');
    type('#cfg-columns', 'name\nid');
    button('Edit as JSON')!.click();
    fixture.detectChanges();
    expect(JSON.parse(el.querySelector<HTMLTextAreaElement>('#stepConfig')!.value)).toEqual({ columns: ['name', 'id'] });
    button('Apply')!.click();
    expect(ref.close).toHaveBeenCalledWith({ key: 'keep', task: 'select', config: { columns: ['name', 'id'] } });
  });

  it('hands back retry, timeout and on-error as numbers and words, and leaves out what was cleared', () => {
    const { type, button, ref } = open({ step: { key: 'keep', task: 'select', config: { columns: ['a'] }, timeoutSeconds: 30, name: 'Keep' } });
    type('#stepName', '');
    type('#stepTries', '3');
    type('#stepDelay', '5');
    type('#stepTimeout', '');
    type('#stepOnError', 'skip_rest', 'change');
    type('#stepInput', 'read', 'change');
    button('Apply')!.click();
    expect(ref.close).toHaveBeenCalledWith({
      key: 'keep', task: 'select', input: 'read', config: { columns: ['a'] }, retry: { maxAttempts: 3, delaySeconds: 5 }, onError: 'skip_rest',
    });
  });

  it('shows the server\'s problems at the fields they name', () => {
    const { el } = open({ problems: [
      { field: 'key', message: "'keep' is already the key of an earlier step" },
      { field: 'retry.maxAttempts', message: 'between 1 and 10' },
      { field: 'config.columns', message: 'a list of column names, or an object {from: to}' },
    ] });
    const alerts = Array.from(el.querySelectorAll('[role="alert"]')).map(a => a.textContent!.trim());
    expect(alerts).toContain("'keep' is already the key of an earlier step");
    expect(alerts).toContain('between 1 and 10');
    expect(alerts.some(a => a.includes('a list of column names'))).toBe(true);
  });

  it('is read-only for someone who cannot save', () => {
    const { el, button } = open({ canManage: false });
    expect(button('Apply')).toBeUndefined();
    expect(el.querySelector<HTMLInputElement>('#stepKey')!.disabled).toBe(true);
  });

  it('hands the form the earlier steps and the columns this step reads, and says the task\'s own defaults', () => {
    const { el } = open({
      step: { key: 'both', task: 'join', config: { with: 'read', on: [] } },
      index: 2, earlierKeys: ['read', 'keep'], columns: ['id', 'patient'],
      task: { code: 'join', name: 'Join', kind: 'Process', runsInEngine: true, retry: { maxAttempts: 2, delaySeconds: 5 }, timeoutSeconds: 120,
        configSchema: { type: 'object', additionalProperties: false, required: ['with'], properties: {
          with: { type: 'string', title: 'Join with', format: 'step' },
          left: { type: 'string', title: 'Left column', format: 'column' },
        } } },
    });
    expect(Array.from(el.querySelectorAll<HTMLOptionElement>('#cfg-with option')).map(o => o.value)).toEqual(['', 'read', 'keep']);
    const left = el.querySelector<HTMLInputElement>('#cfg-left')!;
    expect(Array.from(el.querySelectorAll(`#${left.getAttribute('list')} option`)).map(o => o.getAttribute('value'))).toEqual(['id', 'patient']);
    expect(el.textContent).toContain('Blank: 2 tries, the task\'s default.');
    expect(el.textContent).toContain('Blank: 120 s, the task\'s default.');
  });
});
