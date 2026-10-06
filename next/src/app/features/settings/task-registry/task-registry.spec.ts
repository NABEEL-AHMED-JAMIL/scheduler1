import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { ActivatedRoute } from '@angular/router';
import { Observable, of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { StepTaskEntry } from '../../tasks/steps/steps.model';
import { PipelineDialog } from '../pipelines/pipeline-dialog';
import { TaskPanel } from './task-panel';
import { TaskRegistry } from './task-registry';
import { CREATE_DATA, DUPLICATE_DATA, EDIT_DATA, LEGACY_FIELDS, LEGACY_ROW, SAVE_REQUEST } from './legacy-save.golden';

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

interface Setup {
  tasks?: () => Observable<any>;
  list?: () => Observable<any>;
  del?: () => Observable<any>;
  topic?: string | null;
  role?: 'TENANT_ADMIN' | 'PLATFORM_ADMIN';
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
    return of({ status: 'SUCCESS', data: [] });
  });
  const role = setup.role ?? 'TENANT_ADMIN';
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: HttpClient, useValue: { get, delete: setup.del ?? (() => of({ status: 'SUCCESS', message: 'Deleted.' })), post: vi.fn() } },
      { provide: Dialog, useValue: { open: (component: unknown, config: any) => {
        opened.push({ component, config });
        return { closed: of(answers.shift()) };
      } } },
      { provide: ToastService, useValue: toast },
      { provide: AuthService, useValue: { isPlatformAdmin: () => role === 'PLATFORM_ADMIN', isTenantAdmin: () => true, user: () => null, builderLocked: () => false } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (k: string) => (k === 'topic' ? setup.topic ?? null : null) } } } },
    ],
  });
  const screen = TestBed.runInInjectionContext(() => new TaskRegistry());
  screen.ngOnInit();
  TestBed.tick();
  return { screen, opened, answers, toast, gets };
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
    expect(screen.taskTiles()).toEqual({ total: 3, on: 2, unavailable: 1 });
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
    expect(screen.error()).toBe('Could not load pipelines.');
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

  it('opens a Legacy row with its fields, and Edit pipeline opens the pipeline dialog as the list did', async () => {
    const { screen, opened, answers } = screenWith();
    answers.push('edit');
    await screen.open(screen.rows().find(r => r.code === 'REF_CSV_CHECK_V1')!);
    await Promise.resolve();
    expect(opened[0].config.data.row.pipeline.fields).toEqual(LEGACY_FIELDS);
    expect(opened[1].component).toBe(PipelineDialog);
    expect(opened[1].config).toEqual({ data: EDIT_DATA });
  });
});

describe('Task Registry -- a Legacy row saves exactly as the Pipelines list did (legacy-save.golden.ts)', () => {
  it('Edit hands the dialog the same pipeline, fields and all', async () => {
    const { screen, opened } = screenWith();
    await screen.edit(screen.rows().find(r => r.code === 'REF_CSV_CHECK_V1')!.pipeline!);
    expect(opened[0].component).toBe(PipelineDialog);
    expect(opened[0].config).toEqual({ data: EDIT_DATA });
  });

  it('and the dialog, saved untouched, POSTs the same request, byte for byte', async () => {
    const { screen, opened } = screenWith();
    await screen.edit(screen.rows().find(r => r.code === 'REF_CSV_CHECK_V1')!.pipeline!);
    const post = vi.fn((_url: string, _body: unknown) => of({ status: 'SUCCESS', message: 'Saved.' }));
    const error = vi.fn();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: DIALOG_DATA, useValue: opened[0].config.data },
        { provide: DialogRef, useValue: { close: vi.fn() } },
        { provide: HttpClient, useValue: { post, get: () => of({ status: 'SUCCESS', data: [] }) } },
        { provide: ToastService, useValue: { success: vi.fn(), error, info: vi.fn() } },
      ],
    });
    TestBed.runInInjectionContext(() => new PipelineDialog()).save();
    expect(error).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toBe(SAVE_REQUEST.url);
    expect(JSON.stringify(post.mock.calls[0][1])).toBe(JSON.stringify(SAVE_REQUEST.body));
  });

  it('Duplicate and New registry task hand it what they did', async () => {
    const { screen, opened } = screenWith();
    await screen.duplicate(screen.rows().find(r => r.code === 'REF_CSV_CHECK_V1')!.pipeline!);
    screen.create();
    expect(JSON.parse(JSON.stringify(opened[0].config.data))).toEqual(DUPLICATE_DATA);
    expect(opened[1].config.data).toEqual(CREATE_DATA);
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
