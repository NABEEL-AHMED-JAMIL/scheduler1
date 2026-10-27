import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastService } from '../../../shared/ui/toast.service';
import { Confirm } from '../../../shared/ui/confirm';
import { StepsApi } from './steps.service';
import { StepBuilder, savedStepsLayout } from './step-builder';
import { useMemoryStorage } from '../../../shared/testing/memory-storage';
import { StepPanel } from './step-panel';
import { SampleDialog } from './sample-dialog';
import { DefinitionView, definitionJson } from './steps.model';
import { HandedDraft, PipelineDraftHandoff } from './draft-handoff';

/**
 * MIG-249: the step builder on a pipeline's edit page. Ordered step cards (drag, move up/down, delete, open in the
 * side panel), grouped by stage, Add step from the Task Registry, Settings, History, and YAML and JSON tabs showing
 * the same definition; Test with sample. Validate, Save and Discard are the page's save bar's (UX review 2026-10-12,
 * B2), which calls them here; Run now and Schedule are the page header's (task-edit.spec.ts). Editing in YAML and in the
 * builder save the same definition; validation errors point at the step.
 */
const VIEW: DefinitionView = {
  legacy: false,
  definition: {
    version: 1,
    steps: [
      { key: 'read', task: 'sample', config: { rows: [{ id: 1, name: 'Ada' }, { id: 2, name: 'Bo' }] } },
      { key: 'keep', task: 'select', config: { columns: { name: 'patient' } } },
    ],
  },
  json: '{}',
  yaml: 'version: 1\nsteps:\n- key: read\n  task: sample\n  config:\n    rows:\n    - id: 1\n      name: Ada\n    - id: 2\n      name: Bo\n- key: keep\n  task: select\n  config:\n    columns:\n      name: patient\n',
  pipelineKey: 100175,
  pipelineId: 'UI_CHECK_STEPS_0928',
  stored: true,
  version: 1,
  versions: [{ version: 1, pipelineDefinitionId: 1000, createdBy: 4537, dateCreated: '2026-09-29T04:14:59.098917Z' }],
};

const LEGACY: DefinitionView = {
  ...VIEW, legacy: true, stored: false, version: null, versions: [],
  definition: { version: 1, source: { type: 'task' }, steps: [{ key: 'legacy', name: 'Legacy pipeline REF', task: 'legacy', config: { pipelineId: 'REF' } }] },
};

/** The registry's lines (MIG-231), cut to what the builder reads. */
const TASKS = [
  { code: 'legacy', name: 'Legacy: REF', kind: 'Legacy', description: 'An existing pipeline.', runsInEngine: false, enabled: true, overridable: false, pipelineKey: 100167, pipelineId: 'REF', config: { pipelineId: 'REF' } },
  { code: 'sample', name: 'sample', kind: 'Read', description: 'Rows written in the step itself.', runsInEngine: true, enabled: true, available: true, overridable: true, overridden: false },
  { code: 'select', name: 'select', kind: 'Process', description: 'Keeps the columns it names.', runsInEngine: true, enabled: true, available: true, overridable: true, overridden: false },
  { code: 'filter', name: 'Filter rows', kind: 'Process', description: 'Keeps matching rows.', runsInEngine: true, enabled: false, available: true, overridable: true, overridden: true,
    disabledReason: 'Switched off in this workspace.' },
  { code: 'read_api', name: 'Read API', kind: 'Read', description: 'Calls an API.', runsInEngine: true, enabled: false, available: false, overridable: true, overridden: false,
    disabledReason: 'integration-service is not there yet' },
];

function build(opts: { view?: DefinitionView; jobs?: unknown[]; jobIds?: number[]; dialogAnswer?: unknown; canManage?: boolean; isAdmin?: boolean; tasks?: unknown[]; offer?: HandedDraft; openStep?: string } = {}) {
  const view = opts.view ?? VIEW;
  const api = {
    definition: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { ...view, version: 2 } })),
    validate: vi.fn((format: string, text: string) => of({ status: 'SUCCESS', message: 'The definition is valid.', data: { valid: true, problems: [], definition: format === 'json' ? JSON.parse(text) : view.definition } })),
    save: vi.fn(() => of({ status: 'SUCCESS', message: 'Saved as version 2.', data: { version: 2 } })),
    tasks: vi.fn(() => of({ status: 'SUCCESS', message: '', data: opts.tasks ?? TASKS })),
    switchTask: vi.fn((code: string, enabled: boolean | null) => of({ status: 'SUCCESS', message: `'${code}' is switched.`,
      data: { ...(TASKS.find(t => t.code === code) as object), enabled: enabled ?? true, overridden: enabled !== null, disabledReason: enabled === false ? 'Switched off in this workspace.' : null } })),
    jobsOf: vi.fn(() => of({ status: 'SUCCESS', message: '', data: opts.jobs ?? [{ jobId: 2848, jobName: 'UI-CHECK step engine job 0928', jobStatus: 'Active' }] })),
    run: vi.fn(() => of({ status: 'SUCCESS', message: 'SourceJob job successfully added into queue.' })),
    runs: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { jobQueues: [{ jobQueueId: 7385, jobStatus: 'Completed' }, { jobQueueId: 7401, jobStatus: 'Queue' }] } })),
    timeline: vi.fn(() => of({ status: 'SUCCESS', message: '', data: null })),
    stepLog: vi.fn(),
    prompts: vi.fn(() => of([{ id: 41, label: 'Wound assessment' }])),
    buckets: vi.fn(() => of([{ alias: 'ui-review-s3', label: 'Review bucket' }])),
  };
  const opened: { component: unknown; data: any }[] = [];
  let answer: unknown = opts.dialogAnswer;
  const dialog = {
    open: vi.fn((component: unknown, config: { data: any }) => {
      opened.push({ component, data: config?.data });
      const reply = component === Confirm ? true : typeof answer === 'function' ? (answer as any)(component, config?.data) : answer;
      return { closed: of(reply) };
    }),
  };
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [StepBuilder],
    providers: [
      provideZonelessChangeDetection(),
      { provide: StepsApi, useValue: api },
      { provide: Dialog, useValue: dialog },
      provideRouter([]),
      { provide: ToastService, useValue: toast },
    ],
  });
  if (opts.offer) TestBed.inject(PipelineDraftHandoff).offer(view.pipelineKey, opts.offer);
  const fixture = TestBed.createComponent(StepBuilder);
  fixture.componentRef.setInput('view', view);
  fixture.componentRef.setInput('canManage', opts.canManage ?? true);
  fixture.componentRef.setInput('isAdmin', opts.isAdmin ?? true);
  if (opts.jobIds) fixture.componentRef.setInput('jobIds', opts.jobIds);
  if (opts.openStep) fixture.componentRef.setInput('openStep', opts.openStep);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const builder = fixture.componentInstance;
  const tab = (name: string) => { fixture.componentRef.setInput('tab', name); fixture.detectChanges(); };
  const button = (name: string | RegExp) => Array.from(el.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => { const n = (b.getAttribute('aria-label') || b.textContent || '').trim(); return typeof name === 'string' ? n === name : name.test(n); });
  // The page's save bar (B2) calls these: its Save, Validate and Discard are not the builder's buttons any more.
  const bar: Record<string, () => void> = { Save: () => builder.save(), Validate: () => builder.validate(), Discard: () => builder.discard() };
  const click = (name: string | RegExp) => {
    if (typeof name === 'string' && bar[name]) { bar[name](); fixture.detectChanges(); return; }
    const b = button(name); expect(b, String(name)).toBeTruthy(); b!.click(); fixture.detectChanges();
  };
  const cards = () => Array.from(el.querySelectorAll('.step-card')).map(c => c.getAttribute('data-step'));
  return { fixture, el, builder, api, dialog, opened, toast, tab, button, click, cards, setAnswer: (a: unknown) => { answer = a; } };
}

describe('StepBuilder -- the step cards', () => {
  it('shows the saved steps in order, each with its task', () => {
    const { cards, el } = build();
    expect(cards()).toEqual(['read', 'keep']);
    expect(el.querySelector('[data-step="keep"]')!.textContent).toContain('select');
  });

  it('reorders with Move up and Move down, and says there are unsaved changes', () => {
    const { click, cards, builder, el } = build();
    click('Move keep up');
    expect(cards()).toEqual(['keep', 'read']);
    expect(builder.dirty()).toBe(true);
    expect(el.querySelector('[data-step="keep"] .step-index')!.textContent!.trim()).toBe('1');
    click('Move keep down');
    expect(cards()).toEqual(['read', 'keep']);
    expect(builder.dirty()).toBe(false);
  });

  it('reorders by dragging a card by its handle and dropping it on another', () => {
    const { builder, cards, fixture } = build();
    builder.dragStart(0);
    builder.dragOver(1, new Event('dragover'));
    builder.drop(1, new Event('drop'));
    fixture.detectChanges();
    expect(cards()).toEqual(['keep', 'read']);
  });

  it('moves a step with the handle\'s arrow keys too', () => {
    const { builder, cards, fixture } = build();
    builder.handleKey(0, new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.detectChanges();
    expect(cards()).toEqual(['keep', 'read']);
  });

  it('deletes a step, and Discard puts the saved steps back', () => {
    const { click, cards } = build();
    click('Delete step read');
    expect(cards()).toEqual(['keep']);
    click('Discard');
    expect(cards()).toEqual(['read', 'keep']);
  });

  it('opens a step in the side panel and puts the edited step back', () => {
    const { click, opened, cards, setAnswer } = build();
    setAnswer({ key: 'shape', task: 'select', config: { columns: ['name'] } });
    click('Edit step keep');
    const panel = opened.find(o => o.component === StepPanel)!;
    expect(panel.data).toMatchObject({ index: 1, earlierKeys: ['read'], canManage: true, step: { key: 'keep' } });
    expect(panel.data.task.code).toBe('select');
    expect(cards()).toEqual(['read', 'shape']);
  });

  // Owner 2026-10-21: a report over its page limit links to its Generate report step (?step=): that step opens, once.
  it('opens the step the address names, once its task is known, and only that one', () => {
    const { opened, fixture } = build({ openStep: 'keep' });
    fixture.detectChanges();
    const panels = opened.filter(o => o.component === StepPanel);
    expect(panels).toHaveLength(1);
    expect(panels[0].data).toMatchObject({ index: 1, step: { key: 'keep' } });
    expect(build({ openStep: 'no-such-step' }).opened.filter(o => o.component === StepPanel)).toHaveLength(0);
  });

  // MIG-245: a task with a prompt setting gets the workspace's prompts to choose from -- asked for once, only then.
  it('hands an AI prompt step the prompts to choose from, loading them once and only for such a step', () => {
    const aiTask = { code: 'ai_prompt', name: 'AI prompt', kind: 'Process', description: 'Runs a saved prompt per row.', runsInEngine: true,
      enabled: true, available: true, overridable: true, overridden: false,
      configSchema: { type: 'object', properties: { promptId: { type: 'integer', format: 'prompt' } } } };
    const { builder, api, opened, fixture } = build({ tasks: [...TASKS, aiTask] });
    builder.open(1);
    expect(api.prompts).not.toHaveBeenCalled();
    builder.add('ai_prompt');
    fixture.detectChanges();
    const panel = opened.filter(o => o.component === StepPanel).pop()!;
    expect(panel.data.prompts).toEqual([{ id: 41, label: 'Wound assessment' }]);
    builder.open(2);
    expect(api.prompts).toHaveBeenCalledTimes(1);
  });

  it('hands a step that names a bucket the workspace\'s buckets, loading them once (MIG-321)', () => {
    const readTask = { code: 'read_file', name: 'Read file', kind: 'Source', description: 'Reads a file.', runsInEngine: true,
      enabled: true, available: true, overridable: true, overridden: false,
      configSchema: { type: 'object', properties: { bucket: { type: 'string', format: 'bucket' } } } };
    const { builder, api, opened, fixture } = build({ tasks: [...TASKS, readTask] });
    builder.open(1);
    expect(api.buckets).not.toHaveBeenCalled();
    builder.add('read_file');
    fixture.detectChanges();
    const panel = opened.filter(o => o.component === StepPanel).pop()!;
    expect(panel.data.buckets).toEqual([{ alias: 'ui-review-s3', label: 'Review bucket' }]);
    builder.open(2);
    expect(api.buckets).toHaveBeenCalledTimes(1);
  });

  it('adds a step from the Task Registry and opens it; a disabled task is listed but not added', () => {
    const { builder, cards, opened, fixture } = build();
    expect(builder.taskOptions().map(o => [o.group, o.value, o.disabled])).toEqual([
      ['Read', 'sample', false], ['Read', 'read_api', true], ['Process', 'select', false], ['Process', 'filter', true],
    ]);
    builder.add('filter');
    fixture.detectChanges();
    expect(cards()).toEqual(['read', 'keep']);
    builder.add('select');
    fixture.detectChanges();
    expect(cards()).toEqual(['read', 'keep', 'select']);
    expect(opened.some(o => o.component === StepPanel && o.data.index === 2)).toBe(true);
  });
});

describe('StepBuilder -- a draft handed over (MIG-252)', () => {
  it('names who saved each version, and falls back to the number of someone no longer known', () => {
    const versions = [
      { version: 2, pipelineDefinitionId: 1001, createdBy: 4537, createdByName: 'Claude Demo Admin', dateCreated: '2026-09-30T04:14:59.098917Z' },
      { version: 1, pipelineDefinitionId: 1000, createdBy: 12, dateCreated: '2026-09-29T04:14:59.098917Z' },
    ];
    const { tab, el } = build({ view: { ...VIEW, version: 2, versions } });
    tab('history');
    const rows = [...el.querySelectorAll('tbody tr')].filter(r => r.textContent!.includes('v2') || r.textContent!.includes('v1'));
    expect(rows.map(r => r.lastElementChild!.textContent!.trim())).toEqual(['Claude Demo Admin', 'User #12']);
  });

  it('shows the AI Assistant\'s drafted YAML as typed text, unsaved', () => {
    const { tab, el, builder, api } = build({ offer: { format: 'yaml', text: 'version: 1\nsteps: []\n' } });
    tab('yaml');
    expect(el.querySelector<HTMLTextAreaElement>('#definitionYaml')!.value).toBe('version: 1\nsteps: []\n');
    expect(builder.dirty()).toBe(true);
    expect(api.save).not.toHaveBeenCalled();
  });

  it('shows a drafted JSON on the JSON tab', () => {
    const { tab, el } = build({ offer: { format: 'json', text: '{"version":1,"steps":[]}' } });
    tab('json');
    expect(el.querySelector<HTMLTextAreaElement>('#definitionJson')!.value).toBe('{"version":1,"steps":[]}');
  });

  it('ignores a draft offered for another pipeline', () => {
    TestBed.resetTestingModule();
    const { tab, el, builder } = build();
    TestBed.inject(PipelineDraftHandoff).offer(1, { format: 'yaml', text: 'x' });
    tab('yaml');
    expect(el.querySelector<HTMLTextAreaElement>('#definitionYaml')!.value).toBe(VIEW.yaml);
    expect(builder.dirty()).toBe(false);
  });
});

describe('StepBuilder -- one definition, three views', () => {
  it('shows the saved definition as the server\'s YAML, and as JSON', () => {
    const { tab, el } = build();
    tab('yaml');
    expect(el.querySelector<HTMLTextAreaElement>('#definitionYaml')!.value).toBe(VIEW.yaml);
    tab('json');
    expect(el.querySelector<HTMLTextAreaElement>('#definitionJson')!.value).toBe(definitionJson(VIEW.definition));
  });

  it('shows an edited draft as YAML too, before anything is saved', () => {
    const { tab, el, click } = build();
    click('Delete step read');
    tab('yaml');
    expect(el.querySelector<HTMLTextAreaElement>('#definitionYaml')!.value).toContain('- key: keep');
    expect(el.querySelector<HTMLTextAreaElement>('#definitionYaml')!.value).not.toContain('key: read');
  });

  it('applies edited YAML to the builder through the server, which reads YAML', () => {
    const { tab, el, api, cards, fixture } = build();
    const edited = { version: 1, steps: [{ key: 'only', task: 'sample', config: { rows: [{ id: 3 }] } }] };
    api.validate.mockReturnValueOnce(of({ status: 'SUCCESS', message: 'The definition is valid.', data: { valid: true, problems: [], definition: edited, yaml: 'x', json: 'y' } }) as any);
    tab('yaml');
    const box = el.querySelector<HTMLTextAreaElement>('#definitionYaml')!;
    box.value = 'version: 1\nsteps:\n- key: only\n  task: sample\n  config:\n    rows:\n    - id: 3\n';
    box.dispatchEvent(new Event('input'));
    tab('steps');
    fixture.detectChanges();
    expect(api.validate).toHaveBeenCalledWith('yaml', box.value);
    expect(cards()).toEqual(['only']);
  });

  it('applies edited JSON to the builder, and keeps the text when it is not JSON', () => {
    const { tab, el, cards, fixture } = build();
    tab('json');
    const box = el.querySelector<HTMLTextAreaElement>('#definitionJson')!;
    box.value = JSON.stringify({ version: 1, steps: [{ key: 'keep', task: 'select', config: { columns: ['id'] } }] });
    box.dispatchEvent(new Event('input'));
    tab('steps');
    expect(cards()).toEqual(['keep']);
    tab('json');
    const again = el.querySelector<HTMLTextAreaElement>('#definitionJson')!;
    again.value = '{ nope';
    again.dispatchEvent(new Event('input'));
    tab('steps');
    fixture.detectChanges();
    expect(cards()).toEqual(['keep']);
    expect(el.textContent).toContain('The JSON tab is not JSON');
    tab('json');
    expect(el.querySelector<HTMLTextAreaElement>('#definitionJson')!.value).toBe('{ nope');
  });

  it('saves a builder edit as the canonical JSON, and a YAML edit as the YAML typed: the server stores both as one JSON', () => {
    const { click, api, tab, el, fixture } = build();
    click('Move keep up');
    click('Save');
    expect(api.save).toHaveBeenLastCalledWith(100175, 'json', JSON.stringify(JSON.parse(definitionJson({ version: 1, steps: [VIEW.definition.steps[1], VIEW.definition.steps[0]] }))));
    tab('yaml');
    const box = el.querySelector<HTMLTextAreaElement>('#definitionYaml')!;
    const typed = VIEW.yaml.replace('name: patient', 'name: person');
    box.value = typed;
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    click('Save');
    expect(api.save).toHaveBeenLastCalledWith(100175, 'yaml', typed);
  });

  it('reads the pipeline again after a save, for its new version', () => {
    const { click, api, builder } = build();
    click('Move keep up');
    click('Save');
    expect(api.definition).toHaveBeenCalledWith(100175);
    expect(builder.dirty()).toBe(false);
    expect(builder.versionText()).toBe('Version 2');
  });
});

describe('StepBuilder -- Settings', () => {
  it('sets the source and the defaults every step inherits', () => {
    const { tab, el, builder, fixture } = build();
    tab('settings');
    const set = (id: string, value: string, event = 'input') => {
      const box = el.querySelector<HTMLInputElement>(`#${id}`)!;
      box.value = value;
      box.dispatchEvent(new Event(event));
      fixture.detectChanges();
    };
    set('defSource', 'task', 'change');
    set('defRetention', '48');
    set('defTimeout', '120');
    set('defOnError', 'continue', 'change');
    expect(builder.draft().source).toEqual({ type: 'task' });
    expect(builder.draft().settings).toEqual({ datasetRetentionHours: 48, defaultTimeoutSeconds: 120, defaultOnError: 'continue' });
    set('defRetention', '');
    expect(builder.draft().settings).toEqual({ defaultTimeoutSeconds: 120, defaultOnError: 'continue' });
  });

  /** Owner #23: a pipeline's tags, which a rate card's Tag rule may price by. */
  it('takes tags as comma-separated words, drops blanks and repeats, and takes them back', () => {
    const { tab, el, builder, fixture } = build();
    tab('settings');
    const box = el.querySelector<HTMLInputElement>('#defTags')!;
    box.value = ' research, pilot,, research ';
    box.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(builder.draft().settings).toEqual({ tags: ['research', 'pilot'] });
    expect(box.value).toBe('research, pilot');
    box.value = ' ';
    box.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(builder.draft().settings).toBeUndefined();
  });

  it('declares the level of the data the pipeline handles, and takes it back', () => {
    const { tab, el, builder, fixture } = build();
    tab('settings');
    const box = el.querySelector<HTMLSelectElement>('#defSensitivity')!;
    expect(Array.from(box.options).map(o => o.value)).toEqual(['', 'public', 'internal', 'sensitive']);
    box.value = 'sensitive';
    box.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(builder.draft().settings).toEqual({ sensitivity: 'sensitive' });
    box.value = '';
    box.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(builder.draft().settings).toBeUndefined();
  });

  it('lists the saved versions on History, not on Settings (B2)', () => {
    const { tab, el } = build();
    tab('settings');
    expect(Array.from(el.querySelectorAll('th')).some(th => th.textContent === 'Version')).toBe(false);
    tab('history');
    const versions = Array.from(el.querySelectorAll('table')).find(t => t.querySelector('th')!.textContent === 'Version')!;
    expect(versions.textContent).toContain('v1');
  });
});

describe('StepBuilder -- Validate points at the step', () => {
  it('marks the step each problem names, and lists the definition\'s own problems', () => {
    const { click, api, el, fixture } = build();
    api.validate.mockReturnValueOnce(of({ status: 'ERROR', message: 'The definition has 2 problem(s)', data: { valid: false, problems: [
      { path: 'steps[1].config.columns', message: 'a list of column names, or an object {from: to}' },
      { path: 'settings.defaultOnError', message: 'one of [fail, continue, skip_rest]' },
    ] } }) as any);
    click('Validate');
    fixture.detectChanges();
    const keep = el.querySelector('[data-step="keep"]')!;
    expect(keep.classList).toContain('has-problems');
    expect(keep.textContent).toContain('a list of column names');
    expect(el.querySelector('[data-step="read"]')!.classList).not.toContain('has-problems');
    expect(el.textContent).toContain('settings.defaultOnError');
  });

  it('hands a step\'s problems to its side panel', () => {
    const { click, api, opened, fixture } = build();
    api.validate.mockReturnValueOnce(of({ status: 'ERROR', message: '1 problem', data: { valid: false, problems: [
      { path: 'steps[1].retry.maxAttempts', message: 'between 1 and 10' },
    ] } }) as any);
    click('Validate');
    fixture.detectChanges();
    click('Edit step keep');
    expect(opened.find(o => o.component === StepPanel)!.data.problems).toEqual([{ field: 'retry.maxAttempts', message: 'between 1 and 10' }]);
  });

  it('says so when the definition is valid', () => {
    const { click, el } = build();
    click('Validate');
    expect(el.textContent).toContain('The definition is valid.');
  });

  // ZT-S4: Validate's warnings -- valid, but a required prompt variable nothing fills -- are said, and shown on their step.
  it('says a valid definition\'s warnings and shows each on its step', () => {
    const { click, api, el, fixture, opened } = build();
    api.validate.mockReturnValueOnce(of({ status: 'SUCCESS', message: 'The definition is valid.', data: { valid: true, problems: [], warnings: [
      { path: 'steps[1].config.values', message: "Prompt variable 'reason' is required and not mapped in Variables." },
    ] } }) as any);
    click('Validate');
    fixture.detectChanges();
    expect(el.textContent).toContain('The definition is valid, with 1 warning: it is shown on its step.');
    click('Edit step keep');
    expect(opened.find(o => o.component === StepPanel)!.data.warnings)
      .toEqual([{ field: 'config.values', message: "Prompt variable 'reason' is required and not mapped in Variables." }]);
  });

  it('keeps a refused save\'s problems on the steps, and does not read the pipeline again', () => {
    const { click, api, el, fixture } = build();
    api.save.mockReturnValueOnce(of({ status: 'ERROR', message: 'The definition has 1 problem(s)', data: { valid: false, problems: [{ path: 'steps[0].key', message: 'lower case' }] } }) as any);
    click('Move keep up');
    click('Save');
    fixture.detectChanges();
    expect(api.definition).not.toHaveBeenCalled();
    expect(el.querySelector('[data-step="keep"]')!.classList).toContain('has-problems');
  });
});

describe('StepBuilder -- a report step with no design (ZT-R40)', () => {
  const NO_DESIGN = 'This report step has no design yet: open the step and design it or pick a saved template.';
  const refusal = {
    status: 'ERROR', message: `Not saved: step 'report' (config.templateId): ${NO_DESIGN}`,
    data: { valid: false, problems: [{ path: 'steps[1].config.templateId', message: NO_DESIGN }] },
  };

  it('says a 422 refusal in its own words and keeps the problem on the step it names', () => {
    const { click, api, el, fixture, toast, builder } = build();
    api.save.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 422, error: refusal })) as any);
    click('Move keep up');
    click('Save');
    fixture.detectChanges();
    expect(api.definition).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(refusal.message);
    expect(el.textContent).toContain(refusal.message);
    expect(el.querySelector('[data-step="read"]')!.classList, 'steps[1] after the move').toContain('has-problems');
    expect(builder.dirty()).toBe(true);
  });

  it('hands the step\'s panel the pipeline\'s key before its first save, so its report can be designed', () => {
    const { click, opened } = build({ view: { ...VIEW, stored: false, version: null, versions: [] } });
    click('Edit step keep');
    expect(opened.find(o => o.component === StepPanel)!.data.pipeline.key).toBe(100175);
  });
});

describe('StepBuilder -- a legacy pipeline', () => {
  it('says it runs as its legacy step, and a real step replaces it', () => {
    const { el, cards, builder, fixture } = build({ view: LEGACY, jobIds: [2848] });
    expect(el.textContent).toContain('runs as its legacy step');
    expect(cards()).toEqual(['legacy']);
    builder.add('sample');
    fixture.detectChanges();
    expect(cards()).toEqual(['sample']);
  });

  it('asks before the first save moves every task on the pipeline to the steps', async () => {
    const { builder, api, dialog, fixture, click } = build({ view: LEGACY, jobIds: [2848] });
    builder.add('sample');
    fixture.detectChanges();
    click('Save');
    expect(dialog.open).toHaveBeenCalledWith(Confirm, expect.anything());
    await new Promise(resolve => setTimeout(resolve));
    expect(api.save).toHaveBeenCalled();
  });
});

describe('StepBuilder -- a new pipeline (ZT-P5)', () => {
  it('saves its first steps without the legacy question, and never says it runs as its legacy step', async () => {
    const { builder, api, dialog, fixture, click, el } = build({ view: LEGACY, jobIds: [] });
    expect(el.textContent).not.toContain('legacy step');
    builder.add('sample');
    fixture.detectChanges();
    click('Save');
    expect(dialog.open).not.toHaveBeenCalledWith(Confirm, expect.anything());
    await new Promise(resolve => setTimeout(resolve));
    expect(api.save).toHaveBeenCalled();
  });
});

describe('StepBuilder -- Test with sample, Run now, Schedule', () => {
  it('puts sample rows in front of the steps and validates them', () => {
    const { click, api, cards, builder, setAnswer } = build();
    setAnswer((component: unknown) => (component === SampleDialog ? [{ id: 7, name: 'Cy' }] : undefined));
    click('Test with sample');
    expect(cards()).toEqual(['read', 'keep']);
    expect(builder.draft().steps[0].config).toEqual({ rows: [{ id: 7, name: 'Cy' }] });
    expect(api.validate).toHaveBeenCalled();
  });

  it('offers no edits to someone who cannot save, and its save saves nothing', async () => {
    const { button, builder, api } = build({ canManage: false });
    expect(button(/Test with sample/)).toBeUndefined();
    expect(button('Delete step read')).toBeUndefined();
    builder.move(1, -1);
    expect(await builder.saveNow()).toBe(false);
    expect(api.save).not.toHaveBeenCalled();
  });

  it('saves for the page\'s save bar, and says whether it saved (B2)', async () => {
    const { builder, api } = build();
    expect(await builder.saveNow()).toBe(true);
    expect(api.save).not.toHaveBeenCalled();
    builder.move(1, -1);
    api.save.mockReturnValueOnce(of({ status: 'ERROR', message: 'no', data: { problems: [] } }) as any);
    expect(await builder.saveNow()).toBe(false);
    expect(await builder.saveNow()).toBe(true);
    expect(api.save).toHaveBeenCalledTimes(2);
  });
});

describe('StepBuilder -- the Task Registry', () => {
  it('opens a step with the columns it reads, from the steps before it', () => {
    const { click, opened } = build();
    click('Edit step keep');
    expect(opened.find(o => o.component === StepPanel)!.data.columns).toEqual(['id', 'name']);
  });

  it('will not add a task someone who is not a workspace administrator may not, and says why', () => {
    const tasks = [...TASKS, { code: 'upload_bucket', name: 'Upload to Bucket', kind: 'Output', runsInEngine: true, enabled: true, available: true, requiredPermission: 'TENANT_ADMIN' }];
    const { builder, cards, fixture, el } = build({ isAdmin: false, tasks });
    expect(builder.taskOptions().find(o => o.value === 'upload_bucket')!.disabled).toBe(true);
    builder.add('upload_bucket');
    fixture.detectChanges();
    expect(cards()).toEqual(['read', 'keep']);
    expect(el.textContent).toContain('Only a workspace administrator can add this task.');
  });

  it('leaves the workspace\'s task switches to Settings › Task Registry (B2, P7)', () => {
    const { tab, el } = build();
    tab('settings');
    expect(el.querySelectorAll('[data-task]')).toHaveLength(0);
    expect(el.querySelectorAll('input[role="switch"]')).toHaveLength(0);
    const moved = el.querySelector('[data-test="task-switches-moved"] a')!;
    expect(moved.getAttribute('href')).toBe('/settings/task-registry');
  });
});

describe('StepBuilder -- stages and the ways to review (B2)', () => {
  const STAGED: DefinitionView = { ...VIEW, definition: { version: 1, steps: [
    { key: 'read', task: 'sample' }, { key: 'check', task: 'validate' }, { key: 'label', task: 'ai_prompt' },
    { key: 'keep', task: 'select' }, { key: 'ok', task: 'approval', name: 'Clinical sign-off' }, { key: 'save', task: 'save_file' },
  ] } };
  const STAGE_TASKS = [...TASKS,
    { code: 'validate', name: 'Validate', kind: 'Process', backingService: 'integration-service', enabled: true, available: true },
    { code: 'ai_prompt', name: 'AI prompt', kind: 'Process', backingService: 'ai-service', enabled: true, available: true },
    { code: 'approval', name: 'Approval', kind: 'Process', backingService: 'core', enabled: true, available: true },
    { code: 'save_file', name: 'Save File', kind: 'Output', backingService: 'core', enabled: true, available: true },
  ];

  it('groups the steps by stage, in order, numbered as they run', () => {
    const { el, cards } = build({ view: STAGED, tasks: STAGE_TASKS });
    const stages = Array.from(el.querySelectorAll('.step-stage')).map(s => s.getAttribute('data-stage'));
    expect(stages).toEqual(['read', 'check', 'ai', 'transform', 'review', 'write']);
    expect(cards()).toEqual(['read', 'check', 'label', 'keep', 'ok', 'save']);
    expect(el.querySelector('#stage-read')).toBeTruthy();
    expect(el.querySelector('#stage-write')!.textContent).toContain('Where the results go');
    expect(el.querySelector('[data-step="save"] .step-index')!.textContent!.trim()).toBe('6');
  });

  it('names the three ways a person approves the work, each linked (W2)', () => {
    const { tab, el } = build({ view: STAGED, tasks: STAGE_TASKS });
    tab('settings');
    const ways = el.querySelector('[data-test="review-ways"]')!;
    expect(ways.textContent).toContain('This pipeline has 1 (Clinical sign-off)');
    const links = Array.from(ways.querySelectorAll('a')).map(a => a.getAttribute('href'));
    expect(links).toEqual(['/workflows/designer?key=pipeline-run-review', '/workflows/designer?key=pipeline-step-approval']);
  });
});

/** MIG-237: a pipeline says whose review its results wait for; MIG-334: the customer's is decided through the API. */
describe('StepBuilder -- the review setting', () => {
  it('writes settings.review.required, and drops it when nobody is ticked', () => {
    const { builder, fixture, el, tab } = build();
    tab('settings');
    const internal = el.querySelector<HTMLInputElement>('#reviewInternal')!;
    const customer = el.querySelector<HTMLInputElement>('#reviewCustomer')!;
    expect(internal.checked).toBe(false);
    expect(customer.disabled).toBe(false);
    internal.click();
    fixture.detectChanges();
    expect(builder.draft().settings?.review).toEqual({ required: ['internal'] });
    internal.click();
    fixture.detectChanges();
    expect(builder.draft().settings?.review).toBeUndefined();
  });

  it('asks for the customer\'s review too, now that the API takes it (MIG-334)', () => {
    const { builder, fixture, el, tab } = build();
    tab('settings');
    el.querySelector<HTMLInputElement>('#reviewCustomer')!.click();
    fixture.detectChanges();
    expect(builder.draft().settings?.review).toEqual({ required: ['customer'] });
    el.querySelector<HTMLInputElement>('#reviewInternal')!.click();
    fixture.detectChanges();
    expect(builder.draft().settings?.review).toEqual({ required: ['customer', 'internal'] });
    expect(el.textContent).toContain('The customer (through the API)');
  });
});

/** Bulk review (2026-10-12): a pipeline may require individual review -- its runs and its Approval steps, never in bulk. */
describe('StepBuilder -- individual review', () => {
  const withReview = (review: object): DefinitionView => ({ ...VIEW, definition: { ...VIEW.definition, settings: { review } } as DefinitionView['definition'] });

  it('writes settings.review.individual: true, and drops it when unticked', () => {
    const { builder, fixture, el, tab } = build();
    tab('settings');
    const box = el.querySelector<HTMLInputElement>('#reviewIndividual')!;
    expect(box.checked).toBe(false);
    expect(el.textContent).toContain('Requires individual review (never approved or rejected in bulk)');
    expect(el.textContent).toContain('Approval steps');
    box.click();
    fixture.detectChanges();
    expect(builder.draft().settings?.review).toEqual({ individual: true });
    box.click();
    fixture.detectChanges();
    expect(builder.draft().settings?.review).toBeUndefined();
  });

  it('ticking a party keeps the review\'s other keys -- its reviewers and individual review', () => {
    const reviewers = { kind: 'group', value: '1063' };
    const { builder, fixture, el, tab } = build({ view: withReview({ required: ['internal'], reviewers, individual: true }) });
    tab('settings');
    expect(el.querySelector<HTMLInputElement>('#reviewIndividual')!.checked).toBe(true);
    el.querySelector<HTMLInputElement>('#reviewCustomer')!.click();
    fixture.detectChanges();
    expect(builder.draft().settings?.review).toEqual({ required: ['customer', 'internal'], reviewers, individual: true });
    builder.setReviewRequired('internal', false);
    builder.setReviewRequired('customer', false);
    expect(builder.draft().settings?.review).toEqual({ reviewers, individual: true });
    builder.setReviewIndividual(false);
    expect(builder.draft().settings?.review).toEqual({ reviewers });
  });

  it('is read-only to someone who cannot change the pipeline', () => {
    const { el, tab } = build({ canManage: false });
    tab('settings');
    expect(el.querySelector<HTMLInputElement>('#reviewIndividual')!.disabled).toBe(true);
  });
});

/** 2026-10-12: the steps as a flow on the shared graph canvas, beside the list; the viewer's choice is remembered. */
describe('StepBuilder -- List or Flow', () => {
  useMemoryStorage();

  const flowNodes = (el: HTMLElement) => Array.from(el.querySelectorAll('app-step-flow g[data-node]')).map(n => n.getAttribute('data-id'));
  /** The Flow view's code loads on first use (a dynamic import): wait until it has drawn. */
  const drawn = (fixture: { detectChanges(): void }, el: HTMLElement) =>
    vi.waitFor(() => { fixture.detectChanges(); expect(el.querySelectorAll('app-step-flow g[data-node]').length).toBeGreaterThan(0); });

  it('shows the list until the viewer picks Flow, then the flow, and remembers the choice for the next pipeline', async () => {
    const first = build();
    expect(first.builder.layout()).toBe('list');
    expect(first.cards()).toEqual(['read', 'keep']);
    first.click('Flow');
    expect(first.cards()).toEqual([]);
    await drawn(first.fixture, first.el);
    expect(flowNodes(first.el)).toEqual(['@start', 'read', 'keep']);
    expect(localStorage.getItem('etl.view.pipeline-steps')).toBe('flow');

    const next = build();
    expect(next.builder.layout()).toBe('flow');
    next.click('List');
    expect(next.cards()).toEqual(['read', 'keep']);
    expect(localStorage.getItem('etl.view.pipeline-steps')).toBe('list');
  });

  it('falls back to the list when this browser keeps nothing', () => {
    localStorage.setItem('etl.view.pipeline-steps', 'nonsense');
    expect(savedStepsLayout()).toBe('list');
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(savedStepsLayout()).toBe('list');
    const { builder } = build();
    builder.setLayout('flow');
    expect(builder.layout()).toBe('flow');
  });

  it('opens the same side panel from a node, and marks a step not saved and a step with problems', async () => {
    const { builder, fixture, el, opened, api } = build({ dialogAnswer: undefined });
    builder.setLayout('flow');
    builder.add('select');
    api.validate.mockReturnValueOnce(of({ status: 'ERROR', message: 'Invalid.', data: { valid: false, problems: [{ path: 'steps[1].config.columns', message: 'needs one' }] } }) as never);
    builder.validate();
    fixture.detectChanges();
    await drawn(fixture, el);
    expect(flowNodes(el)).toEqual(['@start', 'read', 'keep', 'select']);
    const node = (key: string) => el.querySelector(`app-step-flow g[data-id="${key}"]`)!;
    expect(node('select').getAttribute('class')).toContain('pending');
    expect(node('select').getAttribute('aria-label')).toContain('unsaved');
    expect(node('keep').getAttribute('class')).toContain('t-crit');
    expect(node('keep').getAttribute('aria-label')).toContain('1 problem');
    expect(node('read').getAttribute('class')).not.toContain('pending');
    const before = opened.length;
    node('keep').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(opened.length).toBe(before + 1);
    expect(opened.at(-1)!.component).toBe(StepPanel);
    expect(opened.at(-1)!.data.step.key).toBe('keep');
    node('@start').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(opened.length).toBe(before + 1);
  });
});
