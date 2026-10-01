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
    workspaces: vi.fn(() => of({ status: 'SUCCESS', data: [{ tenantId: 2924, tenantName: 'Claude Demo' }, { tenantId: 2900, tenantName: 'Default' }] })),
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
      { provide: AuthService, useValue: { canManageAgents: () => admin, isTenantAdmin: () => admin, isPlatformAdmin: () => !!opts.platform } },
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
    expect(run[3]).toContain('Tenant user');
    expect(run[4]).toBe('Asks first');
    expect(run[5]).toContain('Enabled');
    expect(run[6]).toBe('28 Sep, 06:05');
    expect(cells('get_jobs')[4]).toBe('—');
    expect(cells('get_jobs')[6]).toBe('28 Sep, 11:57');
    expect(cells('call_api')[2]).toBe('search? → dataset ref');
    expect(cells('get_reports')[6]).toBe('Never');
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
    expect(cells('call_api')[5]).toContain('Needs the Tenant administrator role.');
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
    expect(api.workspaces).toHaveBeenCalled();
    expect(api.tools).not.toHaveBeenCalled();
    expect(el.querySelector('[data-testid="tool-tenant-picker"]')).not.toBeNull();
    expect(el.textContent).toContain('Choose a workspace to see its tools.');
  });

  it('reads and switches the picked workspace\'s tools', () => {
    const { screen, api, fixture, row } = render({ platform: true });
    screen.pickTenant('2924');
    fixture.detectChanges();
    expect(api.tools).toHaveBeenCalledWith(2924);
    const box = row('get_jobs').querySelector<HTMLInputElement>('input[role="switch"]')!;
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect(api.setEnabled).toHaveBeenCalledWith('get_jobs', false, 2924);
  });
});
