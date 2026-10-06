import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { AccessProfilesService } from '../admin/access-profiles/access-profiles.service';
import { WorkflowDesigner } from './workflow-designer';
import { WorkflowDetail, WorkflowSummary, WorkflowsApi } from './workflows.api';
import { STEP_TYPES } from './designer.model';
import { splitTail } from './inbox-list';

/**
 * The Workflow designer's design (owner, 2026-10-06: "redesign the page, check the issue"), on the Task inbox's layout:
 * a list with a pinned search and status filter and rows by name, the workflow's header with real tabs, the publish bar
 * pinned at the pane's foot and loud once something is unpublished, steps with a type badge and move buttons that say
 * which step they move, and an add button between every two steps. Below 1024 px is CSS (data-pane, data-sheet); what
 * these pin is the state behind it.
 */
const summary = (key: string, name: string, extra: Partial<WorkflowSummary> = {}): WorkflowSummary =>
  ({ id: key.length, key, name, subjectType: 'request', currentVersion: 1, status: 'Active', running: 0, ...extra });

const LIST: WorkflowSummary[] = [
  summary('data-access', 'Data access request'),
  summary('e2e-1', 'E2E purchase 1006022333'),
  summary('e2e-2', 'E2E purchase 1006022934', { status: 'Inactive' }),
  summary('visit', 'MIG-279 visit approval (synthetic)', { running: 2, description: 'Wound care visit' }),
];

const STEPS = { steps: [
  { key: 'admin', type: 'approval', name: 'A workspace admin approves', assignee: { kind: 'role', value: 'TENANT_ADMIN' }, slaHours: 48 },
  { key: 'tell', type: 'notify', to: { kind: 'requester' }, message: 'Decided.' },
  { key: 'wait', type: 'wait', name: 'Cool off', hours: 24 },
] };

const DETAIL: WorkflowDetail = {
  ...LIST[0], createdBy: 0, description: 'Built in by the Data Catalog.',
  versions: [{ version: 1, steps: JSON.stringify(STEPS), note: 'Built in by analytics', createdBy: 0, dateCreated: '2026-10-01T14:05:00' }],
};

function screen(opts: { key?: string } = {}) {
  const api = {
    colleagues: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
    list: vi.fn(() => of({ status: 'SUCCESS', message: '', data: LIST })),
    fetch: vi.fn(() => of({ status: 'SUCCESS', message: '', data: DETAIL })),
    publish: vi.fn(),
    setStatus: vi.fn(),
    start: vi.fn(),
    create: vi.fn(),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      ...(opts.key ? [{ provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ key: opts.key }) } } }] : []),
      { provide: WorkflowsApi, useValue: api },
      { provide: AccessProfilesService, useValue: { list: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })) } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: AuthService, useValue: { isTenantAdmin: () => true, builderLocked: () => false, canOpen: () => true, user: signal({ appUserId: 4537 }) } },
    ],
  });
  const fixture = TestBed.createComponent(WorkflowDesigner);
  fixture.detectChanges();
  TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush({ status: 'SUCCESS', data: [] }));
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const text = (sel: string) => (el.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const rows = () => [...el.querySelectorAll('[data-workflow]')].map(r => r.getAttribute('data-workflow'));
  return { api, fixture, designer: fixture.componentInstance, el, text, rows, render: () => fixture.detectChanges() };
}

describe('Workflow designer, the design -- the list', () => {
  it('reads a row by name, its trailing number never cut, version and running under it, the status at the side', () => {
    const { el } = screen();
    const row = el.querySelector('[data-workflow="e2e-1"]')!;
    expect(row.querySelector('.inbox-title-name')!.textContent).toBe('E2E purchase');
    expect(row.querySelector('.inbox-title-ref')!.textContent).toBe(' 1006022333');
    expect(row.querySelector('.inbox-row-sub')!.textContent!.trim()).toBe('v1');
    expect(row.querySelector('.inbox-row-status')!.textContent!.trim()).toBe('Active');
    const visit = el.querySelector('[data-workflow="visit"]')!;
    expect(visit.querySelector('.inbox-title-ref')).toBeNull();
    expect(visit.querySelector('.inbox-row-time')!.textContent!.trim()).toBe('2 running');
    expect(el.querySelector('[data-workflow="data-access"]')!.getAttribute('aria-current')).toBe('true');
    expect(el.querySelector('[data-workflow="data-access"]')!.classList).toContain('is-on');
  });

  it('searches by name, key or description, filters by status, says how many show, and clears', () => {
    const { designer, render, rows, text, el } = screen();
    expect(text('[data-test="shown-line"]')).toBe('4 workflows');
    designer.setQuery('purchase 2934');
    render();
    expect(rows()).toEqual(['e2e-2']);
    expect(text('[data-test="shown-line"]')).toBe('1 of 4');
    designer.setQuery('wound');
    render();
    expect(rows()).toEqual(['visit']);
    designer.setQuery('');
    (el.querySelector('[data-status="Inactive"]') as HTMLButtonElement).click();
    render();
    expect(rows()).toEqual(['e2e-2']);
    expect(text('[data-status="Active"]')).toBe('Active 3');
    expect(el.querySelector('[data-status="Inactive"]')!.getAttribute('aria-checked')).toBe('true');
    (el.querySelector('[data-test="clear-filters"]') as HTMLButtonElement).click();
    render();
    expect(rows()).toHaveLength(4);
    designer.setQuery('nothing like it');
    render();
    expect(text('[data-test="workflow-list"] .inbox-scroll')).toContain('Nothing matches.');
  });

  it('opens a workflow in place of the list below 1024 px, and goes back', async () => {
    const { designer, el, render } = screen();
    const split = () => el.querySelector('.inbox-split')!.getAttribute('data-pane');
    expect(split()).toBe('list');
    await designer.choose('data-access');
    render();
    expect(split()).toBe('detail');
    (el.querySelector('[data-test="back-to-list"]') as HTMLButtonElement).click();
    render();
    expect(split()).toBe('list');
    // A link to one workflow opens on it.
    expect(screen({ key: 'data-access' }).el.querySelector('.inbox-split')!.getAttribute('data-pane')).toBe('detail');
  });

  it('cuts a name before a trailing number or #reference, and leaves other names whole', () => {
    expect(splitTail('E2E purchase 1006022333')).toEqual({ name: 'E2E purchase', ref: '1006022333' });
    expect(splitTail('Visit check #1016')).toEqual({ name: 'Visit check', ref: '#1016' });
    expect(splitTail('Claims v2')).toEqual({ name: 'Claims', ref: 'v2' });
    expect(splitTail('MIG-279 visit approval (synthetic)')).toEqual({ name: 'MIG-279 visit approval (synthetic)', ref: '' });
    expect(splitTail('1006022333')).toEqual({ name: '1006022333', ref: '' });
  });
});

describe('Workflow designer, the design -- the workflow', () => {
  it('heads the workflow with its name, status, built-in mark, key and version, real tabs and its action', () => {
    const { el, text } = screen();
    const head = el.querySelector('[data-test="workflow-head"]')!;
    expect(text('[data-test="workflow-head"] .inbox-detail-title')).toBe('Data access request');
    expect(text('[data-test="workflow-head"] .inbox-detail-sub')).toBe('data-access · version 1');
    expect(head.querySelector('[data-test="built-in"]')).not.toBeNull();
    expect([...head.querySelectorAll('[role="tablist"] .tab')].map(t => t.getAttribute('data-test'))).toEqual(['tab-steps', 'tab-history', 'tab-test']);
    expect(text('[data-test="tab-steps"]')).toBe('Steps 3');
    expect(text('[data-test="tab-history"]')).toBe('Versions 1');
    expect(head.querySelector('[data-test="tab-steps"]')!.classList).toContain('tab-active');
    expect(head.querySelector('[data-test="toggle-status"]')!.textContent).toContain('Make inactive');
    expect(head.querySelector('[data-test="unpublished-chip"]')).toBeNull();
  });

  it('keeps the publish bar at the pane\'s foot: quiet when nothing changed, loud with a note once something did', () => {
    const { designer, el, render } = screen();
    const detail = el.querySelector('[data-test="workflow-detail"]')!;
    const bar = () => el.querySelector('[data-test="publish-bar"]')!;
    expect(detail.lastElementChild).toBe(bar());
    expect(bar().classList).not.toContain('is-dirty');
    expect(bar().querySelector('[data-test="publish-clean"]')!.textContent).toContain('Version 1 is live.');
    expect(bar().querySelector('[data-test="publish-note"]')).toBeNull();
    expect((bar().querySelector('[data-test="publish"]') as HTMLButtonElement).disabled).toBe(true);

    designer.set('name', 'Admins approve');
    render();
    expect(bar().classList).toContain('is-dirty');
    expect(bar().textContent).toContain('Unpublished changes');
    expect(bar().querySelector('[data-test="publish-note"]')).not.toBeNull();
    expect(bar().querySelector('[data-test="discard"]')).not.toBeNull();
    expect((bar().querySelector('[data-test="publish"]') as HTMLButtonElement).disabled).toBe(false);
    expect(bar().querySelector('[data-test="publish"]')!.textContent).toContain('Publish version 2');
    expect(el.querySelector('[data-test="unpublished-chip"]')).not.toBeNull();
    // Still in sight on another tab while the draft is unpublished.
    designer.view.set('history');
    render();
    expect(el.querySelector('[data-test="publish-bar"]')).not.toBeNull();
    designer.discard();
    render();
    expect(el.querySelector('[data-test="publish-bar"]')).toBeNull();
  });

  it('opens the step\'s properties beside the canvas, sliding over it below 1024 px until closed', () => {
    const { designer, el, render } = screen();
    const body = () => el.querySelector('.designer-body')!;
    const panel = () => el.querySelector('[data-test="step-panel"]')!;
    // Side by side: the canvas and the panel are the body's columns, the panel after the canvas.
    expect(body().querySelector(':scope > [data-test="chain"]')).not.toBeNull();
    expect(body().querySelector(':scope > [data-test="step-panel"]')).not.toBeNull();
    expect(body().getAttribute('data-sheet')).toBe('closed');
    expect(panel().classList).not.toContain('is-open');

    (el.querySelector('[data-step="tell"] .designer-step-main') as HTMLButtonElement).click();
    render();
    expect(designer.selected()).toBe(1);
    expect(body().getAttribute('data-sheet')).toBe('open');
    expect(panel().classList).toContain('is-open');
    expect(panel().querySelector('h3')!.textContent).toBe('Notify');
    expect(panel().textContent).toContain('Step 2 of 3');

    (panel().querySelector('[data-test="close-props"]') as HTMLButtonElement).click();
    render();
    expect(body().getAttribute('data-sheet')).toBe('closed');
    designer.pick(0);
    render();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    render();
    expect(designer.sheet()).toBe(false);
    // The panel's fields are still a fieldset that locks for a member, with no size container inside it.
    expect(panel().querySelector('fieldset.form-lock')).not.toBeNull();
  });

  it('marks each step with its type\'s badge and colour, and the picked one', () => {
    const { el } = screen();
    const badge = (key: string) => el.querySelector(`[data-step="${key}"] [data-test="step-type"]`)!;
    expect(badge('admin').textContent!.trim()).toBe('Approval');
    expect(badge('admin').classList).toContain('pill-ok');
    expect(badge('tell').classList).toContain('pill-brand');
    expect(badge('wait').classList).toContain('pill-neutral');
    expect(new Set(STEP_TYPES.filter(t => ['approval', 'task', 'condition'].includes(t.type)).map(t => t.tone)).size).toBe(3);
    expect(el.querySelector('[data-step="admin"]')!.classList).toContain('is-on');
    expect(el.querySelector('[data-step="admin"] .designer-step-main')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('moves a step with buttons that name it, none past either end', () => {
    const { designer, el, render } = screen();
    const up = (key: string) => el.querySelector(`[data-step="${key}"] [data-test="move-up"]`) as HTMLButtonElement;
    const down = (key: string) => el.querySelector(`[data-step="${key}"] [data-test="move-down"]`) as HTMLButtonElement;
    expect(up('admin').disabled).toBe(true);
    expect(down('wait').disabled).toBe(true);
    expect(up('tell').getAttribute('aria-label')).toBe('Move “tell” up');
    expect(down('admin').getAttribute('aria-label')).toBe('Move “A workspace admin approves” down');
    down('admin').click();
    render();
    expect(designer.steps().map(s => s.key)).toEqual(['tell', 'admin', 'wait']);
    expect(designer.selected()).toBe(1);
    expect(designer.dirty()).toBe(true);
    up('wait').click();
    render();
    expect(designer.steps().map(s => s.key)).toEqual(['tell', 'wait', 'admin']);
  });

  it('adds a step between any two, or at the end, from a menu in that place', () => {
    const { designer, el, render } = screen();
    const inserts = [...el.querySelectorAll('[data-test="insert-step"]')];
    expect(inserts.map(b => b.getAttribute('data-at'))).toEqual(['1', '2']);
    expect(inserts[0].getAttribute('aria-label')).toBe('Add a step after “A workspace admin approves”');
    (inserts[0] as HTMLButtonElement).click();
    render();
    const menu = el.querySelector('[data-test="add-menu"]')!;
    expect(menu.previousElementSibling!.previousElementSibling!.getAttribute('data-step')).toBe('admin');
    (menu.querySelector('[data-add="condition"]') as HTMLButtonElement).click();
    render();
    expect(designer.steps().map(s => s.key)).toEqual(['admin', 'condition', 'tell', 'wait']);
    expect(designer.selected()).toBe(1);
    expect(el.querySelector('[data-test="add-menu"]')).toBeNull();

    (el.querySelector('[data-test="add-step"]') as HTMLButtonElement).click();
    render();
    (el.querySelector('[data-test="add-menu"] [data-add="task"]') as HTMLButtonElement).click();
    expect(designer.steps().map(s => s.key)).toEqual(['admin', 'condition', 'tell', 'wait', 'task']);
  });
});
