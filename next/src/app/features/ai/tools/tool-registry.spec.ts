import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { AssistantApi } from '../assistant/assistant.api';
import { ToolDef } from '../assistant/assistant.model';
import { ToolRegistry } from './tool-registry';
import { Dialog } from '@angular/cdk/dialog';

const tool = (t: Partial<ToolDef>): ToolDef => ({ name: 'get_jobs', title: 'Pipeline jobs', description: 'List jobs.', kind: 'read',
  requiresConfirmation: false, requiredRole: 'TENANT_USER', page: 'jobs', coreTask: null, returnsDatasetReference: false,
  parameters: { type: 'object', properties: { search: { type: 'string' } } }, available: true, unavailableReason: null,
  enabledInWorkspace: true, switchedInWorkspace: false, youMayUse: true, ...t });

const TOOLS = [
  tool({ lastUsedAt: '2026-09-28T11:57:55.926-05:00' }),
  tool({ name: 'run_pipeline', title: 'Run a pipeline job', kind: 'write', requiresConfirmation: true, parameters: { type: 'object', required: ['jobId'], properties: { jobId: { type: 'integer' } } },
    lastUsedAt: '2026-09-28T06:05:00-05:00' }),
  tool({ name: 'call_api', title: 'Call a saved API request', requiredRole: 'TENANT_ADMIN', page: 'api-collections', returnsDatasetReference: true, youMayUse: false }),
  tool({ name: 'join_data', title: 'Join datasets', page: null, coreTask: 'join_datasets', available: false, unavailableReason: 'No user-facing endpoint.', youMayUse: false }),
  tool({ name: 'get_reports', title: 'Run report', page: 'reports', enabledInWorkspace: false, switchedInWorkspace: true, youMayUse: false }),
  tool({ name: 'read_s3', title: 'Read storage', page: 'objects', service: 'Object storage', output: 'A file\'s rows as a dataset reference' }),
];

function render(opts: { admin?: boolean; platform?: boolean; setEnabled?: () => Observable<any> } = {}) {
  // ai-service as it answers: a switch moves its tool, and whether you may use it follows (youMayUse is the server's).
  const server = structuredClone(TOOLS);
  const switched = (name: string, enabled: boolean | null) => {
    const t = server.find(x => x.name === name);
    if (t) Object.assign(t, { enabledInWorkspace: enabled ?? true, switchedInWorkspace: enabled !== null, youMayUse: t.available && (enabled ?? true) });
  };
  const api = {
    tools: vi.fn(() => of({ status: 'SUCCESS', data: structuredClone(server) })),
    runs: vi.fn(),
    trace: vi.fn(),
    setEnabled: vi.fn(opts.setEnabled ?? ((name: string, enabled: boolean | null) => {
      switched(name, enabled);
      return of({ status: 'SUCCESS', message: enabled === null
        ? `${name} is back to its default in this workspace: on.` : `${name} is ${enabled ? 'on' : 'off'} in this workspace.` });
    })),
    // Owner item #15: the platform's control, and the audit of the switches.
    setPlatformState: vi.fn((name: string, state: string, _tenant: number, reason?: string | null) => {
      const t = server.find(x => x.name === name)!;
      if (state === 'blocked') Object.assign(t, { blocked: true, blockReason: reason ?? null, blockedBy: 4639, blockedByName: 'QA Platform', youMayUse: false,
        enabledInWorkspace: false, effectiveState: 'blocked' });
      else Object.assign(t, { blocked: false, enabledInWorkspace: state !== 'disabled', switchedInWorkspace: state !== 'default',
        switchedByRole: state === 'default' ? null : 'PLATFORM_ADMIN', youMayUse: state !== 'disabled' });
      return of({ status: 'SUCCESS', message: `${name} is ${state}.` });
    }),
    toolHistory: vi.fn(() => of({ status: 'SUCCESS', data: [{ toolName: 'get_reports', action: 'disable', from: 'default', to: 'off', reason: null,
      by: 4640, byName: 'Riverside admin', byRole: 'TENANT_ADMIN', at: '2026-10-19T09:00:00-05:00' }] })),
  };
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  const admin = opts.admin ?? true;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ToolRegistry],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AssistantApi, useValue: api },
      { provide: ToastService, useValue: toast },
      // A platform administrator's block asks why: the dialog answers as a person typing a reason would.
      { provide: Dialog, useValue: { open: () => ({ closed: of('Under review') }) } },
      { provide: AuthService, useValue: { canManageAgents: () => admin, builderLocked: () => false, isTenantAdmin: () => admin, isPlatformAdmin: () => !!opts.platform } },
    ],
  });
  const fixture = TestBed.createComponent(ToolRegistry);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const row = (name: string) => el.querySelector(`tr[data-row="${name}"]`) as HTMLElement;
  const cells = (name: string) => Array.from(row(name).querySelectorAll('td')).map(td => td.textContent!.replace(/\s+/g, ' ').trim());
  return { fixture, el, api, toast, row, cells, screen: fixture.componentInstance };
}

describe('Tool Registry', () => {
  it('lists each tool with service, input to output, permission, asks-first, state and last use', () => {
    const { cells } = render();
    const run = cells('run_pipeline');
    expect(run[0]).toContain('run_pipeline');
    expect(run[1]).toBe('Pipelines');
    expect(run[2]).toBe('jobId → result');
    expect(run[3]).toContain('Workspace member');
    expect(run[4]).toBe('Asks first');
    expect(run[5]).toContain('Enabled');
    expect(run[6]).toBe('28 Sep, 06:05');
    expect(cells('get_jobs')[4]).toBe('—');
    expect(cells('get_jobs')[6]).toBe('28 Sep, 11:57');
    expect(cells('call_api')[2]).toBe('search? → dataset ref');
    expect(cells('get_reports')[6]).toBe('Never');
  });

  it('shows every tool in one piece: the page scrolls, not a box inside it (MIG-321)', () => {
    const { el } = render();
    expect(el.querySelector('.scroll-table')).toBeNull();
  });

  it('says the service and the output in ai-service\'s words when it gives them', () => {
    const { cells } = render();
    expect(cells('read_s3')[1]).toBe('Object storage');
    expect(cells('read_s3')[2]).toBe('search? → A file\'s rows as a dataset reference');
  });

  it('shows a blocked tool as blocked, with why, and its switch cannot be moved', () => {
    const { row, cells } = render();
    expect(cells('join_data')[5]).toContain('Blocked');
    expect(cells('join_data')[5]).toContain('No user-facing endpoint.');
    expect(cells('join_data')[1]).toBe('Pipeline engine');
    expect(cells('call_api')[5]).toContain('Needs the Workspace administrator role.');
    expect(row('join_data').querySelector<HTMLInputElement>('input[role="switch"]')!.disabled).toBe(true);
    expect(cells('get_reports')[5]).toContain('Off');
  });

  it('reads "last used" from tools/list alone, no run or trace (MIG-317)', () => {
    const { api } = render();
    expect(api.tools).toHaveBeenCalledTimes(1);
    expect(api.runs).not.toHaveBeenCalled();
    expect(api.trace).not.toHaveBeenCalled();
  });

  it('an administrator puts a switched tool back to its default', () => {
    const { row, api, toast, fixture, cells } = render();
    expect(row('get_jobs').querySelector('button[aria-label^="Put"]')).toBeNull();
    row('get_reports').querySelector<HTMLButtonElement>('button[aria-label="Put get_reports back to its default"]')!.click();
    fixture.detectChanges();
    expect(api.setEnabled).toHaveBeenCalledWith('get_reports', null);
    expect(toast.success).toHaveBeenCalledWith('get_reports is back to its default in this workspace: on.');
    expect(cells('get_reports')[5]).toContain('Enabled');
    expect(cells('get_reports')[5]).not.toContain('switched here');
    expect(row('get_reports').querySelector('button[aria-label^="Put"]')).toBeNull();
  });

  it('reads the list again after a switch moves, so whether you may use the tool is the server\'s word', () => {
    const { row, api, fixture, cells } = render();
    row('get_reports').querySelector<HTMLButtonElement>('button[aria-label="Put get_reports back to its default"]')!.click();
    fixture.detectChanges();
    expect(api.tools).toHaveBeenCalledTimes(2);
    expect(cells('get_reports')[5]).toContain('Enabled');
  });

  it('a tenant user cannot reset a switch', () => {
    const { row } = render({ admin: false });
    expect(row('get_reports').querySelector('button[aria-label^="Put"]')).toBeNull();
  });

  it('an administrator switches a tool off in the workspace', () => {
    const { row, api, toast, fixture, cells } = render();
    const box = row('get_jobs').querySelector<HTMLInputElement>('input[role="switch"]')!;
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(api.setEnabled).toHaveBeenCalledWith('get_jobs', false);
    expect(toast.success).toHaveBeenCalledWith('get_jobs is off in this workspace.');
    expect(cells('get_jobs')[5]).toContain('Off');
  });

  it('puts the switch back when the server refuses', () => {
    const { row, toast, fixture } = render({ setEnabled: () => of({ status: 'ERROR', message: 'Not allowed.' }) });
    const box = row('get_jobs').querySelector<HTMLInputElement>('input[role="switch"]')!;
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(toast.error).toHaveBeenCalledWith('Not allowed.');
    expect(box.checked).toBe(true);
  });

  it('a tenant user reads the states but has no switch', () => {
    const { el } = render({ admin: false });
    expect(el.querySelectorAll('input[role="switch"]').length).toBe(0);
    expect(el.textContent).toContain('Blocked');
  });

  it('narrows to blocked tools, and by search', () => {
    const { screen } = render();
    screen.stateFilter.set('Blocked');
    expect(screen.filtered().map(t => t.name)).toEqual(['call_api', 'join_data']);
    screen.stateFilter.set('');
    screen.search.set('pipeline');
    expect(screen.filtered().map(t => t.name)).toEqual(['get_jobs', 'run_pipeline']);
  });
  // A platform administrator has no workspace of its own: tools/list refused it ("names none") and the page showed
  // an empty registry. It now picks the workspace first, the way Access profiles does.
  it('a platform administrator picks a workspace before any tool is read', () => {
    const { el, api } = render({ platform: true });
    expect(api.tools).not.toHaveBeenCalled();
    expect(el.querySelector('[data-testid="tool-tenant-picker"]')).not.toBeNull();
    expect(el.textContent).toContain('Choose a workspace to see its tools.');
  });

  it('reads the picked workspace\'s tools and sets the platform\'s control over each (owner item #15)', async () => {
    const { screen, api, fixture, row, cells } = render({ platform: true });
    screen.pickTenant('2924');
    fixture.detectChanges();
    expect(api.tools).toHaveBeenCalledWith(2924);
    expect(row('get_jobs').querySelector('input[role="switch"]')).toBeNull();
    const control = row('get_jobs').querySelector<HTMLSelectElement>('select[data-test="platform-control"]')!;
    expect(control.value).toBe('default');
    control.value = 'disabled';
    control.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(api.setPlatformState).toHaveBeenCalledWith('get_jobs', 'disabled', 2924, null);

    control.value = 'blocked';
    control.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.setPlatformState).toHaveBeenCalledWith('get_jobs', 'blocked', 2924, 'Under review');
    expect(cells('get_jobs')[5]).toContain('Blocked');
    expect(cells('get_jobs')[5]).toContain('Blocked for this workspace by QA Platform (platform administrator): Under review.');
  });

  it('a tool the platform blocked is locked for the workspace\'s administrator, with who blocked it and why', () => {
    const { row, cells, el } = render();
    TOOLS_BLOCKED(row, cells, el);
  });

  // UX final TL1: the name in words leads, the machine name under it; Reads and Writes are grouped; a blocked tool's
  // reason is whole and muted, not cut in red.
  it('leads each row with the tool\'s name in words, its machine name small beneath', () => {
    const { row } = render();
    const first = row('run_pipeline').querySelector('td')!;
    const [title, name] = [first.querySelector('[data-test="tool-title"]')!, first.querySelector('[data-test="tool-name"]')!];
    expect(title.textContent!.trim()).toBe('Run a pipeline job');
    expect(name.textContent!.trim()).toBe('run_pipeline');
    expect(name.classList).toContain('mono');
    expect(title.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('groups the rows Reads, then Writes, with a count, and follows the kind filter', () => {
    const { el, screen, fixture } = render();
    const order = Array.from(el.querySelectorAll('tbody tr')).map(tr => tr.getAttribute('data-group') ?? tr.getAttribute('data-row'));
    expect(order).toEqual(['read', 'get_jobs', 'call_api', 'join_data', 'get_reports', 'read_s3', 'write', 'run_pipeline']);
    const head = el.querySelector('tr[data-group="read"]')!;
    expect(head.querySelector('.tool-group-title')!.textContent).toBe('Reads');
    expect(head.querySelector('.tool-group-count')!.textContent).toBe('5');
    screen.kindFilter.set('write');
    fixture.detectChanges();
    expect(Array.from(el.querySelectorAll('tbody tr[data-group]')).map(tr => tr.getAttribute('data-group'))).toEqual(['write']);
  });

  it('says why a tool is blocked in full, muted, with an icon', () => {
    const { row } = render();
    const reason = row('join_data').querySelector('[data-test="tool-reason"]')!;
    expect(reason.textContent!.trim()).toBe('No user-facing endpoint.');
    expect(reason.className).not.toContain('line-clamp');
    expect(reason.className).not.toContain('text-crit');
    expect(reason.querySelector('app-icon')).not.toBeNull();
  });
});

/** The workspace administrator's view of a tool the platform blocked (owner item #15). */
function TOOLS_BLOCKED(row: (n: string) => HTMLElement, cells: (n: string) => string[], el: HTMLElement): void {
  TestBed.resetTestingModule();
  const blocked = tool({ name: 'delete_file', title: 'Delete a file', kind: 'write', requiresConfirmation: true, blocked: true, blockReason: 'Not for this customer',
    blockedBy: 4639, blockedByName: 'QA Platform', blockedAt: '2026-10-19T09:00:00-05:00', enabledInWorkspace: false, youMayUse: false, effectiveState: 'blocked',
    setBy: 'platform' });
  const api = { tools: vi.fn(() => of({ status: 'SUCCESS', data: [blocked] })), runs: vi.fn(), trace: vi.fn(), setEnabled: vi.fn(), workspaces: vi.fn(),
    setPlatformState: vi.fn(), toolHistory: vi.fn(() => of({ status: 'SUCCESS', data: [] })) };
  TestBed.configureTestingModule({
    imports: [ToolRegistry],
    providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: AssistantApi, useValue: api },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      { provide: AuthService, useValue: { canManageAgents: () => true, builderLocked: () => false, isTenantAdmin: () => true, isPlatformAdmin: () => false } }],
  });
  const fixture = TestBed.createComponent(ToolRegistry);
  fixture.detectChanges();
  const r = (fixture.nativeElement as HTMLElement).querySelector('tr[data-row="delete_file"]') as HTMLElement;
  const box = r.querySelector<HTMLInputElement>('input[role="switch"]')!;
  expect(box.disabled).toBe(true);
  expect(r.textContent).toContain('Blocked for this workspace by QA Platform (platform administrator): Not for this customer.');
  expect(r.querySelector('[data-test="tool-set-by"]')!.textContent).toContain('QA Platform (platform administrator)');
  expect(r.querySelector('button[aria-label^="Put"]')).toBeNull();
  void row; void cells; void el;
}
