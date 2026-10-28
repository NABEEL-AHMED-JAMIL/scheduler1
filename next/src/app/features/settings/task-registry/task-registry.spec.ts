import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { StepTaskEntry } from '../../tasks/steps/steps.model';
import { TaskUsagePanel } from './task-usage-panel';
import { StepsApi } from '../../tasks/steps/steps.service';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { TaskPanel } from './task-panel';
import { TaskRegistry } from './task-registry';
import { LEGACY_FIELDS, LEGACY_ROW } from './legacy-save.golden';

const ROWS = { type: 'array', items: { type: 'object' } };
const TASKS: StepTaskEntry[] = [
  { code: 'filter', name: 'Filter', kind: 'Process', backingService: 'core', inputSchema: ROWS, outputSchema: ROWS, enabled: true, available: true, overridable: true },
  { code: 'sample', name: 'Sample rows', kind: 'Read', backingService: 'core', inputSchema: null, outputSchema: ROWS, enabled: true, available: true, overridable: true },
  { code: 'write_database', name: 'Write Database', kind: 'Output', backingService: 'integration-service', enabled: false, available: false,
    disabledReason: 'integration-service has no database write path', overridable: true },
  { code: 'legacy', name: 'Legacy pipeline', kind: 'Legacy', backingService: 'worker', overridable: false, enabled: true, available: true, runsInEngine: false },
  { code: 'legacy', name: 'Legacy: Reference: CSV check and summarise', kind: 'Legacy', backingService: 'worker', overridable: false,
    enabled: true, available: true, runsInEngine: false, pipelineKey: 100167, pipelineId: 'REF_CSV_CHECK_V1', config: { pipelineId: 'REF_CSV_CHECK_V1' } },
];
const OTHER = { pipelineKey: 100175, pipelineId: 'UI_CHECK_STEPS_0928', pipelineName: 'UI-CHECK step engine 0928', sourceTaskTypeId: 11831,
  topicName: 'service-1 reference worker', status: 'Inactive', fieldCount: 1, requiredCount: 0 };

const USAGE = { since: '2026-10-01T05:00:00Z', month: '2026-10', tasks: [{ code: 'filter', pipelines: 3, runs: 41 }],
  legacy: [{ pipelineKey: 100167, pipelines: 1, runs: 2 }] };

interface Setup {
  usage?: () => Observable<any>;
  tasks?: () => Observable<any>;
  list?: () => Observable<any>;
  del?: () => Observable<any>;
  topic?: string | null;
  role?: 'TENANT_ADMIN' | 'PLATFORM_ADMIN';
  tenant?: number | null;
}

function screenWith(setup: Setup = {}) {
  const opened: { component: unknown; config: any }[] = [];
  const answers: any[] = [];
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  const gets: { url: string; params: any }[] = [];
  const get = vi.fn((url: string, options?: { params?: any }) => {
    gets.push({ url, params: options?.params });
    if (url.endsWith('/pipeline.json/steps/tasks')) return setup.tasks?.() ?? of({ status: 'SUCCESS', data: structuredClone(TASKS) });
    if (url.endsWith('/pipeline.json/list')) return setup.list?.() ?? of({ status: 'SUCCESS', data: { rows: [structuredClone(LEGACY_ROW), structuredClone(OTHER)],
      summary: { total: 2, active: 1, fields: 5, topics: 1, untopped: 0 } } });
    if (url.endsWith('/pipeline.json/fields')) return of({ status: 'SUCCESS', data: structuredClone(LEGACY_FIELDS) });
    if (url.endsWith('/pipeline.json/steps/tasks/usage')) return setup.usage?.() ?? of({ status: 'SUCCESS', data: structuredClone(USAGE) });
    return of({ status: 'SUCCESS', data: [] });
  });
  const role = setup.role ?? 'TENANT_ADMIN';
  const navigate = vi.fn();
  TestBed.resetTestingModule();
  try { localStorage.clear(); } catch { /* none: the sort remembers its choice there */ }
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: HttpClient, useValue: { get, delete: setup.del ?? (() => of({ status: 'SUCCESS', message: 'Deleted.' })), post: vi.fn() } },
      { provide: Dialog, useValue: { open: (component: unknown, config: any) => {
        opened.push({ component, config });
        return { closed: of(answers.shift()) };
      } } },
      { provide: ToastService, useValue: toast },
      { provide: Router, useValue: { navigate } },
      { provide: WorkspaceDirectory, useValue: { remembered: () => setup.tenant ?? null, names: () => new Map() } },
      { provide: AuthService, useValue: { isPlatformAdmin: () => role === 'PLATFORM_ADMIN', isTenantAdmin: () => true, user: () => null, builderLocked: () => false } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (k: string) => (k === 'topic' ? setup.topic ?? null : null) } } } },
    ],
  });
  const screen = TestBed.runInInjectionContext(() => new TaskRegistry());
  screen.ngOnInit();
  TestBed.tick();
  return { screen, opened, answers, toast, gets, navigate };
}

describe('Task Registry -- the list', () => {
  it('lists the step tasks by kind, then every pipeline as a Legacy task', () => {
    const { screen, gets } = screenWith();
    expect(screen.rows().map(r => `${r.kind}:${r.code}:${r.state}`)).toEqual([
      'Read:sample:On', 'Process:filter:On', 'Output:write_database:Unavailable',
      'Legacy:REF_CSV_CHECK_V1:On', 'Legacy:UI_CHECK_STEPS_0928:Off',
    ]);
    expect(screen.counts()).toEqual({ '': 5, Read: 1, Process: 1, Output: 1, Legacy: 2 });
    // The pipelines come whole: kind, state and search are this page's own.
    expect(gets.find(g => g.url.endsWith('/pipeline.json/list'))!.params).toEqual({ page: '1', limit: '1000' });
    expect(screen.taskTiles()).toEqual({ total: 3, on: 2, unavailable: 1, blocked: 0, inUse: 1 });
  });

  it('narrows by kind, state and search, back to page one', () => {
    const { screen } = screenWith();
    screen.setFilter(screen.kindFilter, 'Legacy');
    expect(screen.filtered().map(r => r.code)).toEqual(['REF_CSV_CHECK_V1', 'UI_CHECK_STEPS_0928']);
    screen.setFilter(screen.stateFilter, 'Off');
    expect(screen.filtered().map(r => r.code)).toEqual(['UI_CHECK_STEPS_0928']);
    screen.clearFilters();
    screen.setFilter(screen.search, 'integration');
    expect(screen.filtered().map(r => r.code)).toEqual(['write_database']);
    expect(screen.pager.page()).toBe(1);
  });

  it('opens narrowed to a topic from Kafka & Topics: the pipelines on it, and no step tasks', () => {
    const { screen, gets } = screenWith({ topic: '11831' });
    expect(gets.find(g => g.url.endsWith('/pipeline.json/list'))!.params).toEqual({ page: '1', limit: '1000', topic: '11831' });
    expect(screen.rows().every(r => r.legacy)).toBe(true);
    expect(screen.hasFilters()).toBe(true);
  });

  it('still lists every pipeline when the registry cannot be read, and says so', () => {
    const { screen } = screenWith({ tasks: () => of({ status: 'ERROR', message: 'Core is restarting.' }) });
    expect(screen.tasksError()).toBe('Core is restarting.');
    expect(screen.rows().map(r => r.code)).toEqual(['REF_CSV_CHECK_V1', 'UI_CHECK_STEPS_0928']);
    expect(screen.rows()[0].task.code).toBe('legacy');
  });

  it('says the pipelines could not be loaded', () => {
    const { screen } = screenWith({ list: () => new Observable(sub => sub.error({ error: {} })) });
    expect(screen.error()).toBe('The pipelines could not be read.');
  });
});

describe('Task Registry -- a row\'s panel', () => {
  it('opens a step task in the wide side panel, and shows a switch made there in the list', () => {
    const { screen, opened } = screenWith();
    const filter = screen.rows().find(r => r.code === 'filter')!;
    screen.open(filter);
    expect(opened[0].component).toBe(TaskPanel);
    expect(opened[0].config.panelClass).toContain('side-panel-wide');
    expect(opened[0].config.data.row).toBe(filter);
    expect(opened[0].config.data.isAdmin).toBe(true);
    opened[0].config.data.onSwitched({ code: 'filter', enabled: false, overridden: true });
    expect(screen.rows().find(r => r.code === 'filter')).toMatchObject({ state: 'Off', overridden: true });
  });

  it('opens a Legacy row with its fields, and Edit registry task opens its own page', async () => {
    const { screen, opened, answers, navigate } = screenWith();
    answers.push('edit');
    await screen.open(screen.rows().find(r => r.code === 'REF_CSV_CHECK_V1')!);
    await Promise.resolve();
    expect(opened[0].config.data.row.pipeline.fields).toEqual(LEGACY_FIELDS);
    expect(navigate).toHaveBeenCalledWith(['/settings/task-registry', 100167]);
  });
});

/** Owner #18: New, Edit and Duplicate are the registry task's own page (registry-task-editor.spec.ts holds its save). */
describe('Task Registry -- a Legacy row opens its own page', () => {
  it('Edit, Duplicate and New registry task go to their addresses', () => {
    const { screen, navigate, opened } = screenWith();
    const row = screen.rows().find(r => r.code === 'REF_CSV_CHECK_V1')!.pipeline!;
    screen.edit(row);
    screen.duplicate(row);
    screen.create();
    expect(navigate.mock.calls).toEqual([
      [['/settings/task-registry', 100167]],
      [['/settings/task-registry/new'], { queryParams: { copyOf: 100167 } }],
      [['/settings/task-registry/new']],
    ]);
    expect(opened).toEqual([]);
  });

  it('asks to "Delete pipeline", and names the pipeline when it cannot', async () => {
    const { screen, opened, answers, toast } = screenWith({ del: () => new Observable(sub => sub.error({ error: {} })) });
    answers.push(true);
    await screen.remove(screen.rows().find(r => r.code === 'REF_CSV_CHECK_V1')!.pipeline!);
    expect(opened[0].config.data.confirmLabel).toBe('Delete pipeline');
    expect(opened[0].config.data.danger).toBe(true);
    expect(toast.error).toHaveBeenCalledWith('The pipeline could not be deleted.');
  });
});

/** Owner #17: each row's pipelines and runs this month, Core's counts; a count opens the list, zero is zero. */
describe('Task Registry -- usage counts', () => {
  it('reads the counts once and shows them by row, zero where Core has none', () => {
    const { screen, gets } = screenWith();
    expect(gets.filter(g => g.url.endsWith('/pipeline.json/steps/tasks/usage'))).toHaveLength(1);
    const filter = screen.rows().find(r => r.code === 'filter')!;
    expect(screen.countOf(filter)).toEqual({ code: 'filter', pipelines: 3, runs: 41 });
    expect(screen.countOf(screen.rows().find(r => r.code === 'REF_CSV_CHECK_V1')!)).toMatchObject({ pipelines: 1, runs: 2 });
    expect(screen.countOf(screen.rows().find(r => r.code === 'sample')!)).toEqual({ pipelines: 0, runs: 0 });
    expect(screen.monthLabel()).toBe('Oct');
  });

  it('a count opens its list in the drawer: a task by code, a Legacy row by its pipeline', () => {
    const { screen, opened } = screenWith();
    screen.openUsage(screen.rows().find(r => r.code === 'filter')!, 'runs');
    screen.openUsage(screen.rows().find(r => r.code === 'REF_CSV_CHECK_V1')!, 'pipelines');
    expect(opened[0].component).toBe(TaskUsagePanel);
    expect(opened[0].config.data).toMatchObject({ list: 'runs', of: { code: 'filter' }, count: 41, tenantId: null });
    expect(opened[1].config.data).toMatchObject({ list: 'pipelines', of: { pipelineKey: 100167 }, count: 1 });
  });

  it('says when the counts cannot be read', () => {
    const { screen } = screenWith({ usage: () => of({ status: 'ERROR', message: 'Core is restarting.' }) });
    expect(screen.usageError()).toBe('Core is restarting.');
    expect(screen.countOf(screen.rows().find(r => r.code === 'filter')!)).toEqual({ pipelines: 0, runs: 0 });
  });
});

/** Owner #16: a platform administrator controls each task for the workspace chosen in the shared selector. */
describe('Task Registry -- the platform\'s control per workspace', () => {
  it('asks for the chosen workspace\'s registry and counts, and offers the control only with one chosen', () => {
    const { screen, gets } = screenWith({ role: 'PLATFORM_ADMIN', tenant: 2960 });
    expect(gets.find(g => g.url.endsWith('/pipeline.json/steps/tasks'))!.params).toEqual({ tenantId: 2960 });
    expect(gets.find(g => g.url.endsWith('/pipeline.json/steps/tasks/usage'))!.params).toEqual({ tenantId: 2960 });
    expect(screen.canControl()).toBe(true);
    expect(screen.canSwitch()).toBe(false);
    const none = screenWith({ role: 'PLATFORM_ADMIN', tenant: null });
    expect(none.screen.canControl()).toBe(false);
  });

  it('blocks a task with a reason, and shows Core\'s answer on the row', async () => {
    const { screen, opened, answers, toast } = screenWith({ role: 'PLATFORM_ADMIN', tenant: 2960 });
    const post = TestBed.inject(HttpClient).post as unknown as ReturnType<typeof vi.fn>;
    post.mockReturnValue(of({ status: 'SUCCESS', message: 'Filter is blocked for this workspace.',
      data: { ...TASKS[0], enabled: false, blocked: true, blockReason: 'Under review', disabledReason: 'Blocked for this workspace by a platform administrator: Under review' } }));
    answers.push('Under review');
    const select = { value: 'blocked' } as HTMLSelectElement;
    await screen.setPlatform(screen.rows().find(r => r.code === 'filter')!.task, select);
    expect(opened[0].config.data.confirmLabel).toBe('Block task');
    expect(post).toHaveBeenCalledWith(expect.stringContaining('/pipeline.json/steps/tasks/platformState'),
      { code: 'filter', state: 'blocked', reason: 'Under review' }, { params: { tenantId: 2960 } });
    expect(toast.success).toHaveBeenCalled();
    expect(screen.rows().find(r => r.code === 'filter')!).toMatchObject({ state: 'Blocked' });
    expect(screen.platformValue(screen.rows().find(r => r.code === 'filter')!.task)).toBe('blocked');
  });

  it('a block that is cancelled changes nothing', async () => {
    const { screen, answers } = screenWith({ role: 'PLATFORM_ADMIN', tenant: 2960 });
    const post = TestBed.inject(HttpClient).post as unknown as ReturnType<typeof vi.fn>;
    answers.push(null);
    const select = { value: 'blocked' } as HTMLSelectElement;
    await screen.setPlatform(screen.rows().find(r => r.code === 'filter')!.task, select);
    expect(post).not.toHaveBeenCalled();
    expect(select.value).toBe('default');
  });
});

/** UX review 2026-10-12 (B2, P7): the workspace's task switches moved here from a pipeline's Settings tab. */
describe('Task Registry -- the workspace\'s task switches', () => {
  it('switches a step task on its row and shows Core\'s answer; a legacy row has no switch', () => {
    const { screen, toast } = screenWith();
    const post = TestBed.inject(HttpClient).post as unknown as ReturnType<typeof vi.fn>;
    post.mockReturnValue(of({ status: 'SUCCESS', message: "'filter' is off in this workspace.",
      data: { ...TASKS[0], enabled: false, overridden: true, disabledReason: 'Switched off in this workspace.' } }));
    expect(screen.canSwitch()).toBe(true);
    const filter = screen.rows().find(r => r.code === 'filter')!;
    screen.switchTask(filter.task, false);
    expect(post).toHaveBeenCalledWith(expect.stringContaining('/pipeline.json/steps/tasks/enabled'), { code: 'filter', enabled: false });
    expect(toast.success).toHaveBeenCalled();
    expect(screen.rows().find(r => r.code === 'filter')!).toMatchObject({ state: 'Off', overridden: true });
  });

  it('shows a task a platform administrator blocked as Blocked, with who and why, and its switch locked', () => {
    const blocked = { ...TASKS[0], enabled: false, overridden: true, blocked: true, blockedBy: 4639, blockedByName: 'QA platform administrator',
      blockedAt: '2026-10-19T22:00:00Z', blockReason: 'Under review', disabledReason: 'Blocked for this workspace by a platform administrator: Under review' };
    const { screen } = screenWith({ tasks: () => of({ status: 'SUCCESS', data: [blocked, ...structuredClone(TASKS.slice(1))] }) });
    const row = screen.rows().find(r => r.code === 'filter')!;
    expect(row).toMatchObject({ state: 'Blocked', reason: 'Blocked for this workspace by a platform administrator: Under review' });
    expect(screen.setBy(row.task)).toEqual({ who: expect.stringContaining('QA platform administrator'), at: '2026-10-19T22:00:00Z' });
    expect(screen.taskTiles().blocked).toBe(1);
  });

  it('keeps the row as it was when Core refuses', () => {
    const { screen, toast } = screenWith();
    const post = TestBed.inject(HttpClient).post as unknown as ReturnType<typeof vi.fn>;
    post.mockReturnValue(of({ status: 'ERROR', message: 'Only a workspace administrator switches tasks.' }));
    screen.switchTask(screen.rows().find(r => r.code === 'filter')!.task, false);
    expect(toast.error).toHaveBeenCalledWith('Only a workspace administrator switches tasks.');
    expect(screen.rows().find(r => r.code === 'filter')!.state).toBe('On');
  });
});

describe('Task Registry -- sorting, loading, empty, error (owner 2026-10-27)', () => {
  it('keeps the kind order until a heading is picked, then sorts before paging, both ways', () => {
    const { screen } = screenWith();
    expect(screen.shown()[0].code).toBe('sample');
    screen.sort.toggle('task');
    expect(screen.sorted().map(r => r.name)[0]).toBe('Filter');
    screen.sort.toggle('task');
    expect(screen.sorted().map(r => r.name)[0]).toBe('Write Database');
    screen.sort.toggle('runs');
    expect(screen.sorted()[0].code).toBe('filter');
  });

  it('is loading, with the step-task tiles waiting, until the registry answers', () => {
    const { screen } = screenWith({ tasks: () => NEVER, usage: () => NEVER });
    expect(screen.tasksLoading()).toBe(true);
    expect(screen.tasksLoaded()).toBe(false);
    expect(screen.countsKnown()).toBe(false);
  });

  it('is empty, not loading, once both lists answer empty', () => {
    const { screen } = screenWith({ tasks: () => of({ status: 'SUCCESS', data: [] }),
      list: () => of({ status: 'SUCCESS', data: { rows: [], summary: { total: 0, active: 0, fields: 0, topics: 0, untopped: 0 } } }) });
    expect(screen.tasksLoading()).toBe(false);
    expect(screen.loading()).toBe(false);
    expect(screen.tasksLoaded()).toBe(true);
    expect(screen.pipelinesLoaded()).toBe(true);
    expect(screen.filtered()).toEqual([]);
  });

  it('says the registry could not be read, in plain words, when the read fails', () => {
    const { screen } = screenWith({ tasks: () => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' })) });
    expect(screen.tasksLoading()).toBe(false);
    expect(screen.tasksError()).toBe('The Task Registry could not be read.');
  });
});

describe('Task usage drawer -- loading, empty, error (owner 2026-10-27)', () => {
  function drawer(answer: () => Observable<any>) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: DialogRef, useValue: { close: vi.fn() } },
        { provide: DIALOG_DATA, useValue: { list: 'pipelines', of: { code: 'filter' }, name: 'Filter', count: 3, tenantId: null } },
        { provide: StepsApi, useValue: { taskPipelines: vi.fn(answer), taskRuns: vi.fn(answer) } },
        { provide: WorkspaceDirectory, useValue: { names: () => new Map() } },
      ],
    });
    const panel = TestBed.runInInjectionContext(() => new TaskUsagePanel());
    panel.ngOnInit();
    return panel;
  }

  it('is loading until the list answers', () => {
    expect(drawer(() => NEVER).loading()).toBe(true);
  });

  it('is empty once an empty list answers', () => {
    const panel = drawer(() => of({ status: 'SUCCESS', data: [] }));
    expect(panel.loading()).toBe(false);
    expect(panel.pipelines()).toEqual([]);
  });

  it('says the list could not be read and reads again on Try again', () => {
    let answer: () => Observable<any> = () => throwError(() => new HttpErrorResponse({ status: 500 }));
    const panel = drawer(() => answer());
    expect(panel.loading()).toBe(false);
    expect(panel.error()).toBe('The list could not be read.');
    answer = () => of({ status: 'SUCCESS', data: [] });
    panel.load();
    expect(panel.error()).toBe('');
  });
});
