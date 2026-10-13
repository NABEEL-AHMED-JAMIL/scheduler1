import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ToastService } from '../../../shared/ui/toast.service';
import { StepsApi } from '../../tasks/steps/steps.service';
import { StepTaskEntry } from '../../tasks/steps/steps.model';
import { TaskPanel, TaskPanelData } from './task-panel';
import { registryRows } from './task-registry.model';
import { LEGACY_FIELDS, LEGACY_ROW } from './legacy-save.golden';

const ROWS = { type: 'array', description: 'Any rows.', items: { type: 'object' } };
const FILTER: StepTaskEntry = {
  code: 'filter', name: 'Filter', kind: 'Process', description: 'Keeps the rows that meet all (or any) of its conditions.',
  inputSchema: ROWS, outputSchema: { ...ROWS, description: 'The rows that meet the conditions, unchanged.' },
  configSchema: {
    type: 'object', required: ['conditions'], properties: {
      match: { type: 'string', enum: ['all', 'any'], title: 'Keep a row that meets', default: 'all' },
      conditions: { type: 'array', title: 'Conditions', minItems: 1, maxItems: 50, items: { type: 'object', required: ['column'],
        properties: { column: { type: 'string', format: 'column', title: 'Column' } } } },
    },
  },
  backingService: 'core', retry: { maxAttempts: 1, delaySeconds: 0 }, timeoutSeconds: null, requiredPermission: 'TENANT_USER',
  enabledByDefault: true, overridable: true, aiToolName: 'filter_rows', runsInEngine: true, enabled: true, overridden: false, available: true,
};
const LEGACY: StepTaskEntry = {
  code: 'legacy', name: 'Legacy: Reference', kind: 'Legacy', backingService: 'worker', runsInEngine: false, overridable: false,
  aiToolName: 'run_legacy_pipeline', enabled: true, available: true, pipelineKey: 100167, pipelineId: 'REF_CSV_CHECK_V1',
  inputSchema: { ...ROWS, description: 'The job\'s task payload, handed to the worker as it is today.' }, outputSchema: null,
  configSchema: { type: 'object', properties: { pipelineId: { type: 'string', title: 'Pipeline', format: 'pipeline' } } },
};

function open(task: StepTaskEntry, isAdmin = true, pipelineWithFields = true) {
  const pipelines = task.kind === 'Legacy' ? [{ ...LEGACY_ROW, ...(pipelineWithFields ? { fields: LEGACY_FIELDS } : {}) } as any] : [];
  const row = registryRows(task.kind === 'Legacy' ? [task] : [task], pipelines)[0];
  const close = vi.fn();
  const onSwitched = vi.fn();
  const api = { switchTask: vi.fn((code: string, enabled: boolean | null) =>
    of({ status: 'SUCCESS', message: `'${code}' is switched.`, data: { ...task, enabled: enabled ?? true, overridden: enabled !== null } })) };
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(), provideRouter([]),
      { provide: DIALOG_DATA, useValue: { row, isAdmin, onSwitched } satisfies TaskPanelData },
      { provide: DialogRef, useValue: { close } },
      { provide: StepsApi, useValue: api },
      { provide: ToastService, useValue: toast },
    ],
  });
  const fixture = TestBed.createComponent(TaskPanel);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  // Each text node apart, as a person reads them: "Retry" and its value are separate cells.
  const text = () => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const parts: string[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) parts.push(n.textContent ?? '');
    return parts.join(' ').replace(/\s+/g, ' ');
  };
  return { fixture, el, text, close, onSwitched, api, toast };
}

describe('TaskPanel -- a step task', () => {
  it('reads its settings, a repeatable group\'s own settings included', () => {
    const { el } = open(FILTER);
    const settings = Array.from(el.querySelectorAll('[data-setting]')).map(s => s.getAttribute('data-setting'));
    expect(settings).toEqual(['match', 'conditions', 'column']);
    const conditions = el.querySelector('[data-setting="conditions"]')!.textContent!.replace(/\s+/g, ' ');
    expect(conditions).toContain('Repeatable group');
    expect(conditions).toContain('Required');
    expect(conditions).toContain('1 to 50 rows');
    expect(el.querySelector('[data-setting="match"]')!.textContent).toContain('Choices: all, any');
  });

  it('says what it takes and gives, and how it runs', () => {
    const { text } = open({ ...FILTER, retry: { maxAttempts: 3, delaySeconds: 10 }, timeoutSeconds: 300, requiredPermission: 'TENANT_ADMIN' });
    expect(text()).toContain('Input Rows Any rows.');
    expect(text()).toContain('Output Rows The rows that meet the conditions, unchanged.');
    expect(text()).toContain('Service core');
    expect(text()).toContain('Retry Up to 3 tries, 10 s apart');
    expect(text()).toContain('Timeout 5 min');
    expect(text()).toContain('Who may add it Workspace administrators');
    expect(text()).toContain('AI tool name filter_rows');
    expect(text()).toContain('Runs In the step engine');
  });

  it('lets a workspace administrator switch it off, and tells the page', () => {
    const { el, api, onSwitched, fixture, toast } = open(FILTER);
    const box = el.querySelector<HTMLInputElement>('input[role="switch"]')!;
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(api.switchTask).toHaveBeenCalledWith('filter', false);
    expect(toast.success).toHaveBeenCalledWith("'filter' is switched.");
    expect(onSwitched).toHaveBeenCalledWith(expect.objectContaining({ code: 'filter', enabled: false, overridden: true }));
    expect(el.querySelector('app-task-state')!.textContent).toContain('Off');
    // Back to its default.
    (el.querySelector('button[aria-label="Put Filter back to its default"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(api.switchTask).toHaveBeenLastCalledWith('filter', null);
    expect(el.querySelector('app-task-state')!.textContent).toContain('On');
  });

  it('says why a refused switch was refused, and leaves the task as it was', () => {
    const { el, api, toast, fixture, onSwitched } = open(FILTER);
    api.switchTask.mockReturnValueOnce(of({ status: 'ERROR', message: 'Only a workspace administrator can switch tasks.', data: undefined as any }));
    const box = el.querySelector<HTMLInputElement>('input[role="switch"]')!;
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(toast.error).toHaveBeenCalledWith('Only a workspace administrator can switch tasks.');
    expect(onSwitched).not.toHaveBeenCalled();
    expect(box.checked).toBe(true);
  });

  it('shows no switch to someone who is not a workspace administrator', () => {
    const { el } = open(FILTER, false);
    expect(el.querySelector('input[role="switch"]')).toBeNull();
  });
});

describe('TaskPanel -- a Legacy row', () => {
  it('shows the pipeline, its topic and payload fields, and no switch', () => {
    const { el, text } = open(LEGACY);
    expect(text()).toContain('Pipeline ID REF_CSV_CHECK_V1');
    expect(text()).toContain('service-1 reference worker');
    expect(Array.from(el.querySelectorAll('.pipeline-fields .mono')).map(m => m.textContent)).toEqual(['inputKey', 'format', 'output', 'bucket', 'summary']);
    expect(el.querySelector('input[role="switch"]')).toBeNull();
    expect(text()).toContain('Always on');
    expect(text()).toContain('Input Payload: 5 fields');
    expect(text()).toContain('Output Worker The worker does the rest');
    expect(text()).toContain('AI tool name run_legacy_pipeline');
  });

  it('asks the page to open the pipeline dialog', () => {
    const { el, close } = open(LEGACY);
    const edit = Array.from(el.querySelectorAll('button')).find(b => b.textContent!.includes('Edit registry task'))!;
    edit.click();
    expect(close).toHaveBeenCalledWith('edit');
  });

  it('counts the fields when they could not be read', () => {
    const { text } = open(LEGACY, true, false);
    expect(text()).toContain('4 field(s), 2 required.');
  });
});
