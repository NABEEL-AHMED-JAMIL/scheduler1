import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { API_BASE, API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { TaskReferences } from './task-references';
import { TaskReferenceDialog, TaskReferenceDialogData } from './task-reference-dialog';
import { TaskReference, TaskReferenceKind } from './configuration.models';

/**
 * MIG-167: Home pages and Task groups -- what a task's Home page and Group fields point at. One
 * screen, two kinds: the route says which. A reference a live task uses cannot be deleted, and
 * a home page is a web address or nothing.
 */

const ENDPOINT = `${API_BASE}/setting.json/taskReferences`;

const HOME_PAGES: TaskReference[] = [
  { id: 2101, tenantId: 2901, kind: 'HOME_PAGE', name: 'Claims portal', value: 'https://claims.example.com',
    createdAt: '2026-09-01T10:00:00Z', createdByName: 'Ada Admin', usedByTasks: 3 },
  { id: 2102, tenantId: 2901, kind: 'HOME_PAGE', name: 'Status page', value: 'https://status.example.com', usedByTasks: 0 },
];

const auth = (platform: boolean) => ({ isPlatformAdmin: () => platform, user: () => ({ appUserId: 7 }) });

function screen(kind: TaskReferenceKind, platform = false) {
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  const open = vi.fn(() => ({ closed: of(true) }));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [TaskReferences],
    providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: auth(platform) },
      { provide: ToastService, useValue: toast },
      { provide: Dialog, useValue: { open } },
    ],
  });
  const fixture = TestBed.createComponent(TaskReferences);
  fixture.componentRef.setInput('kind', kind);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, el: fixture.nativeElement as HTMLElement,
    http: TestBed.inject(HttpTestingController), toast, open };
}

describe('Home pages and task groups -- the list', () => {
  it('asks for home pages and links each one', () => {
    const { fixture, el, http } = screen('HOME_PAGE');
    const req = http.expectOne(r => r.url === ENDPOINT && r.method === 'GET');
    expect(req.request.params.get('kind')).toBe('HOME_PAGE');
    expect(req.request.params.has('tenantId')).toBe(false);
    req.flush({ status: API_SUCCESS, data: HOME_PAGES });
    fixture.detectChanges();
    expect(el.querySelector('h1')?.textContent).toContain('Home pages');
    const link = el.querySelector('[data-id="2101"] a') as HTMLAnchorElement;
    expect(link.href).toBe('https://claims.example.com/');
    expect(link.rel).toContain('noopener');
  });

  it('asks for task groups on the task-groups route', () => {
    const { fixture, el, http } = screen('TASK_GROUP');
    const req = http.expectOne(r => r.url === ENDPOINT && r.method === 'GET');
    expect(req.request.params.get('kind')).toBe('TASK_GROUP');
    req.flush({ status: API_SUCCESS, data: [{ id: 2001, tenantId: 2901, kind: 'TASK_GROUP', name: 'Nightly', usedByTasks: 0 }] });
    fixture.detectChanges();
    expect(el.querySelector('h1')?.textContent).toContain('Task groups');
    expect(el.textContent).toContain('Nightly');
  });

  it('keeps delete off while a task uses the reference', () => {
    const { fixture, el, http } = screen('HOME_PAGE');
    http.expectOne(r => r.url === ENDPOINT).flush({ status: API_SUCCESS, data: HOME_PAGES });
    fixture.detectChanges();
    const del = (id: number) => el.querySelector(`[data-id="${id}"] button[aria-label^="Delete"]`) as HTMLButtonElement;
    expect(del(2101).disabled).toBe(true);
    expect(del(2101).title).toMatch(/3 tasks/);
    expect(del(2102).disabled).toBe(false);
  });

  it('shows the server\'s sentence when it refuses a delete', async () => {
    const { component, http, toast } = screen('HOME_PAGE');
    http.expectOne(r => r.url === ENDPOINT).flush({ status: API_SUCCESS, data: HOME_PAGES });
    await component.remove(HOME_PAGES[1]);
    const req = http.expectOne(r => r.method === 'DELETE');
    expect(req.request.params.get('id')).toBe('2102');
    req.flush({ status: 'ERROR', message: '1 task still uses Status page.' });
    expect(toast.error).toHaveBeenCalledWith('1 task still uses Status page.');
  });

  it('refuses a delete of a reference in use without asking the server', async () => {
    const { component, http, toast, open } = screen('HOME_PAGE');
    http.expectOne(r => r.url === ENDPOINT).flush({ status: API_SUCCESS, data: HOME_PAGES });
    await component.remove(HOME_PAGES[0]);
    http.expectNone(r => r.method === 'DELETE');
    expect(open).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/3 tasks/));
  });

  it('lets a platform administrator narrow to one workspace', () => {
    const { component, http } = screen('TASK_GROUP', true);
    http.expectOne(r => r.url.endsWith('/tenant.json/listTenants')).flush({ status: API_SUCCESS, data: [] });
    http.expectOne(r => r.url === ENDPOINT).flush({ status: API_SUCCESS, data: [] });
    component.setTenant('2901');
    const req = http.expectOne(r => r.url === ENDPOINT);
    expect(req.request.params.get('tenantId')).toBe('2901');
    expect(req.request.params.get('kind')).toBe('TASK_GROUP');
  });
});

function dialog(data: TaskReferenceDialogData, platform = false) {
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  const close = vi.fn();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [TaskReferenceDialog],
    providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: auth(platform) },
      { provide: ToastService, useValue: toast },
      { provide: DIALOG_DATA, useValue: data },
      { provide: DialogRef, useValue: { close } },
    ],
  });
  const fixture = TestBed.createComponent(TaskReferenceDialog);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, http: TestBed.inject(HttpTestingController), toast, close };
}

describe('Home pages and task groups -- adding and editing', () => {
  it('refuses a home page that is not an http or https address', () => {
    const { component, http } = dialog({ kind: 'HOME_PAGE' });
    for (const bad of ['claims.example.com', 'ftp://claims.example.com', 'javascript:alert(1)', 'https://', '']) {
      component.form.patchValue({ name: 'Claims portal', value: bad });
      component.save();
      expect(component.form.get('value')!.valid, bad).toBe(false);
    }
    http.expectNone(r => r.method === 'POST');
  });

  it('creates a home page with its address', () => {
    const { component, http, close } = dialog({ kind: 'HOME_PAGE' });
    component.form.patchValue({ name: 'Claims portal', value: 'https://claims.example.com/start', description: 'Where claims begin' });
    component.save();
    const req = http.expectOne(r => r.url === ENDPOINT && r.method === 'POST');
    expect(req.request.body).toEqual({ kind: 'HOME_PAGE', name: 'Claims portal', value: 'https://claims.example.com/start', description: 'Where claims begin' });
    req.flush({ status: API_SUCCESS, message: 'Saved.', data: {} });
    expect(close).toHaveBeenCalledWith(true);
  });

  it('lets a task group go without a value', () => {
    const { component, http } = dialog({ kind: 'TASK_GROUP' });
    component.form.patchValue({ name: 'Nightly' });
    component.save();
    expect(http.expectOne(r => r.method === 'POST').request.body).toEqual({ kind: 'TASK_GROUP', name: 'Nightly' });
  });

  it('requires a name', () => {
    const { component, http } = dialog({ kind: 'TASK_GROUP' });
    component.form.patchValue({ name: '   ' });
    component.save();
    http.expectNone(r => r.method === 'POST');
  });

  it('shows the server\'s sentence for a name the workspace already has', () => {
    const { component, http, toast, close } = dialog({ kind: 'TASK_GROUP' });
    component.form.patchValue({ name: 'Nightly' });
    component.save();
    http.expectOne(r => r.method === 'POST').flush({ status: 'ERROR', message: 'A task group named Nightly already exists in this workspace.' });
    expect(toast.error).toHaveBeenCalledWith('A task group named Nightly already exists in this workspace.');
    expect(close).not.toHaveBeenCalled();
  });

  it('edits by id, keeping the kind', () => {
    const { component, http } = dialog({ kind: 'HOME_PAGE', row: HOME_PAGES[1] });
    expect(component.form.get('name')!.value).toBe('Status page');
    component.form.patchValue({ value: 'https://status2.example.com' });
    component.save();
    expect(http.expectOne(r => r.method === 'PUT').request.body)
      .toEqual({ id: 2102, name: 'Status page', value: 'https://status2.example.com', description: '' });
  });

  it('files a platform administrator\'s new reference under the workspace picked', () => {
    const { component, http } = dialog({ kind: 'TASK_GROUP', tenants: [{ tenantId: 2901, tenantName: 'CareBridge' }] }, true);
    component.form.patchValue({ name: 'Nightly' });
    component.save();
    http.expectNone(r => r.method === 'POST');
    component.form.patchValue({ tenantId: 2901 });
    component.save();
    expect(http.expectOne(r => r.method === 'POST').request.body.tenantId).toBe(2901);
  });
});
