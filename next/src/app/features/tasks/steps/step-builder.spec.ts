import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { ToastService } from '../../../shared/ui/toast.service';
import { Confirm } from '../../../shared/ui/confirm';
import { StepsApi } from './steps.service';
import { StepBuilder } from './step-builder';
import { StepPanel } from './step-panel';
import { RunDrawer } from './run-drawer';
import { SampleDialog } from './sample-dialog';
import { DefinitionView, definitionJson } from './steps.model';
import { HandedDraft, PipelineDraftHandoff } from './draft-handoff';

/**
 * MIG-249: the step builder on a pipeline's edit page. Ordered step cards (drag, move up/down, delete, open in the
 * side panel), Add step from the Task Registry, Settings, and YAML and JSON tabs showing the same definition; then
 * Validate, Test with sample, Run now, Schedule and Save. Editing in YAML and in the builder save the same definition;
 * validation errors point at the step.
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

function build(opts: { view?: DefinitionView; jobs?: unknown[]; dialogAnswer?: unknown; canManage?: boolean; isAdmin?: boolean; tasks?: unknown[]; offer?: HandedDraft } = {}) {
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
  const router = { navigate: vi.fn() };
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [StepBuilder],
    providers: [
      provideZonelessChangeDetection(),
      { provide: StepsApi, useValue: api },
      { provide: Dialog, useValue: dialog },
      { provide: Router, useValue: router },
      { provide: ToastService, useValue: toast },
    ],
  });
  if (opts.offer) TestBed.inject(PipelineDraftHandoff).offer(view.pipelineKey, opts.offer);
  const fixture = TestBed.createComponent(StepBuilder);
  fixture.componentRef.setInput('view', view);
  fixture.componentRef.setInput('taskDetailId', 1864);
  fixture.componentRef.setInput('canManage', opts.canManage ?? true);
  fixture.componentRef.setInput('isAdmin', opts.isAdmin ?? true);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const builder = fixture.componentInstance;
  const tab = (name: string) => { fixture.componentRef.setInput('tab', name); fixture.detectChanges(); };
  const button = (name: string | RegExp) => Array.from(el.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => { const n = (b.getAttribute('aria-label') || b.textContent || '').trim(); return typeof name === 'string' ? n === name : name.test(n); });
  const click = (name: string | RegExp) => { const b = button(name); expect(b, String(name)).toBeTruthy(); b!.click(); fixture.detectChanges(); };
  const cards = () => Array.from(el.querySelectorAll('.step-card')).map(c => c.getAttribute('data-step'));
  return { fixture, el, builder, api, dialog, opened, router, toast, tab, button, click, cards, setAnswer: (a: unknown) => { answer = a; } };
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
    expect(el.textContent).toContain('Unsaved changes');
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
    tab('settings');
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
    const { click, api, builder, el } = build();
    click('Move keep up');
    click('Save');
    expect(api.definition).toHaveBeenCalledWith(100175);
    expect(builder.dirty()).toBe(false);
    expect(el.textContent).toContain('Version 2');
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

  it('lists the saved versions', () => {
    const { tab, el } = build();
    tab('settings');
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

describe('StepBuilder -- a legacy pipeline', () => {
  it('says it runs as its legacy step, and a real step replaces it', () => {
    const { el, cards, builder, fixture } = build({ view: LEGACY });
    expect(el.textContent).toContain('runs as its legacy step');
    expect(cards()).toEqual(['legacy']);
    builder.add('sample');
    fixture.detectChanges();
    expect(cards()).toEqual(['sample']);
  });

  it('asks before the first save moves every task on the pipeline to the steps', async () => {
    const { builder, api, dialog, fixture, click } = build({ view: LEGACY });
    builder.add('sample');
    fixture.detectChanges();
    click('Save');
    expect(dialog.open).toHaveBeenCalledWith(Confirm, expect.anything());
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

  it('runs the task\'s schedule and opens the run as it happens', () => {
    const { click, api, opened } = build();
    click('Run now');
    expect(api.run).toHaveBeenCalledWith(2848);
    expect(api.runs).toHaveBeenCalledWith(2848);
    const drawer = opened.find(o => o.component === RunDrawer)!;
    expect(drawer.data).toMatchObject({ jobQueueId: 7401, jobId: 2848 });
  });

  it('saves unsaved changes before it runs, and does not run when the save is refused', () => {
    const { click, api } = build();
    click('Move keep up');
    expect(api.run).not.toHaveBeenCalled();
    api.save.mockReturnValueOnce(of({ status: 'ERROR', message: 'no', data: { problems: [] } }) as any);
    click('Save & run now');
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.run).not.toHaveBeenCalled();
    click('Save & run now');
    expect(api.save).toHaveBeenCalledTimes(2);
    expect(api.run).toHaveBeenCalledWith(2848);
  });

  it('cannot run a task no schedule runs, and says to schedule one', () => {
    const { button, el } = build({ jobs: [] });
    expect(button('Run now')!.disabled).toBe(true);
    expect(el.textContent).toContain('No schedule runs this pipeline yet');
  });

  it('opens a new schedule for this task', () => {
    const { click, router } = build();
    click('Schedule');
    expect(router.navigate).toHaveBeenCalledWith(['/pipelines/schedules/new'], { queryParams: { taskDetailId: 1864 } });
  });

  it('offers no Save, Run now or edits to someone who cannot save', () => {
    const { button } = build({ canManage: false });
    expect(button('Save')).toBeUndefined();
    expect(button('Run now')).toBeUndefined();
    expect(button('Delete step read')).toBeUndefined();
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

  it('lists the workspace\'s tasks under Settings, legacy aside, and switches one', () => {
    const { tab, el, api, fixture, builder } = build();
    tab('settings');
    const rows = Array.from(el.querySelectorAll('[data-task]')).map(r => r.getAttribute('data-task'));
    expect(rows).toEqual(['sample', 'select', 'filter', 'read_api']);
    const unavailable = el.querySelector<HTMLInputElement>('[data-task="read_api"] input[role="switch"]')!;
    expect(unavailable.disabled).toBe(true);
    expect(el.querySelector('[data-task="read_api"]')!.textContent).toContain('integration-service is not there yet');
    const select = el.querySelector<HTMLInputElement>('[data-task="select"] input[role="switch"]')!;
    select.checked = false;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(api.switchTask).toHaveBeenCalledWith('select', false);
    expect(builder.tasks().find(t => t.code === 'select')!.enabled).toBe(false);
    expect(builder.taskOptions().find(o => o.value === 'select')!.disabled).toBe(true);
  });

  it('puts a switched task back to its default', () => {
    const { tab, api, click } = build();
    tab('settings');
    click('Put Filter rows back to its default');
    expect(api.switchTask).toHaveBeenCalledWith('filter', null);
  });

  it('shows no switches to someone who is not a workspace administrator', () => {
    const { tab, el } = build({ isAdmin: false });
    tab('settings');
    expect(el.querySelectorAll('[data-task]')).toHaveLength(0);
  });
});

/** MIG-237: a pipeline says whose review its results wait for; the customer's waits for customer integration. */
describe('StepBuilder -- the review setting', () => {
  it('writes settings.review.required, and drops it when nobody is ticked', () => {
    const { builder, fixture, el, tab } = build();
    tab('settings');
    const internal = el.querySelector<HTMLInputElement>('#reviewInternal')!;
    const customer = el.querySelector<HTMLInputElement>('#reviewCustomer')!;
    expect(internal.checked).toBe(false);
    expect(customer.disabled).toBe(true);
    internal.click();
    fixture.detectChanges();
    expect(builder.draft().settings?.review).toEqual({ required: ['internal'] });
    internal.click();
    fixture.detectChanges();
    expect(builder.draft().settings?.review).toBeUndefined();
  });
});
