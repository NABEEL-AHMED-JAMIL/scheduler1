import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { API_BASE, API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { ConfigValues } from './config-values';
import { ConfigValueDialog, ConfigValueDialogData } from './config-value-dialog';
import { PipelineConfig } from './configuration.models';

/**
 * MIG-167: Configuration values, the per-workspace store a task's payload reads through
 * ${config:KEY} and ${secret:KEY}. The one rule every test here circles is that a secret is
 * write-only: the screen never shows one, never pre-fills one, and does not keep one after it
 * has been sent.
 */

const ENDPOINT = `${API_BASE}/setting.json/pipelineConfig`;
const LEAKED = 'hunter2-should-never-render';

const ROWS: PipelineConfig[] = [
  { id: 11, tenantId: 2901, key: 'INPUT_BUCKET', kind: 'VALUE', value: 's3://claims-in', description: 'Where claims land',
    setAt: '2026-09-20T15:00:00Z', setByName: 'Ada Admin', usedByTasks: 0 },
  // The server never sends a secret's value. This row does anyway, to prove the screen drops it.
  { id: 12, tenantId: 2901, key: 'DB_PASSWORD', kind: 'SECRET', secretSet: true, value: LEAKED,
    setAt: '2026-09-21T09:30:00Z', setByName: 'Ada Admin', usedByTasks: 2 },
];

function auth(platform: boolean) {
  return { isPlatformAdmin: () => platform, user: () => ({ appUserId: 7, tenantId: platform ? null : 2901 }) };
}

function screen(platform = false, confirmed = true) {
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  const open = vi.fn(() => ({ closed: of(confirmed) }));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ConfigValues],
    providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: auth(platform) },
      { provide: ToastService, useValue: toast },
      { provide: Dialog, useValue: { open } },
    ],
  });
  const fixture = TestBed.createComponent(ConfigValues);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  return { fixture, component: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, http, toast, open };
}

function flushList(http: HttpTestingController, rows: PipelineConfig[] = ROWS) {
  const req = http.expectOne(r => r.url === ENDPOINT && r.method === 'GET');
  req.flush({ status: API_SUCCESS, message: '', data: rows });
  return req;
}

describe('Configuration values -- the list', () => {
  it('asks for the caller\'s own workspace and lists every key', () => {
    const { fixture, el, http } = screen();
    const req = flushList(http);
    expect(req.request.params.has('tenantId')).toBe(false);
    fixture.detectChanges();
    const text = el.textContent ?? '';
    expect(text).toContain('INPUT_BUCKET');
    expect(text).toContain('s3://claims-in');
    expect(text).toContain('DB_PASSWORD');
    http.verify();
  });

  it('never puts a secret on screen, even when an answer carries one', () => {
    const { fixture, component, el, http } = screen();
    flushList(http);
    fixture.detectChanges();
    expect(el.innerHTML).not.toContain(LEAKED);
    expect(component.rows().find(r => r.key === 'DB_PASSWORD')).not.toHaveProperty('value');
    expect(JSON.stringify(component.rows())).not.toContain(LEAKED);
  });

  it('shows a secret as a mask, with when and by whom it was set', () => {
    const { fixture, el, http } = screen();
    flushList(http);
    fixture.detectChanges();
    const row = el.querySelector('[data-key="DB_PASSWORD"]')!;
    expect(row.querySelector('.secret-mask')).not.toBeNull();
    expect(row.textContent).toMatch(/set on .*2026.* by Ada Admin/);
  });

  it('offers "Replace secret" on a secret and never a way to show it', () => {
    const { fixture, el, http } = screen();
    flushList(http);
    fixture.detectChanges();
    const secretRow = el.querySelector('[data-key="DB_PASSWORD"]')!;
    const labels = [...secretRow.querySelectorAll('button')].map(b => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim());
    expect(labels.some(l => /Replace secret/.test(l))).toBe(true);
    expect(labels.some(l => /show|reveal/i.test(l))).toBe(false);
  });

  it('explains how a task references an entry, and that credential tags must use a secret', () => {
    const { fixture, el, http } = screen();
    flushList(http, []);
    fixture.detectChanges();
    const text = el.textContent ?? '';
    expect(text).toContain('${config:KEY}');
    expect(text).toContain('${secret:KEY}');
    expect(text).toMatch(/password|credential/i);
  });

  it('keeps delete off while a task still uses the key', () => {
    const { fixture, el, http } = screen();
    flushList(http);
    fixture.detectChanges();
    const del = (key: string) => el.querySelector(`[data-key="${key}"] button[aria-label^="Delete"]`) as HTMLButtonElement;
    expect(del('DB_PASSWORD').disabled).toBe(true);
    expect(del('DB_PASSWORD').title).toMatch(/2 tasks/);
    expect(del('INPUT_BUCKET').disabled).toBe(false);
  });

  it('shows the server\'s own sentence when it refuses a delete', async () => {
    const { component, http, toast } = screen();
    flushList(http);
    await component.remove(component.rows()[0]);
    const req = http.expectOne(r => r.url === ENDPOINT && r.method === 'DELETE');
    expect(req.request.params.get('id')).toBe('11');
    req.flush({ status: 'ERROR', message: '1 task still uses INPUT_BUCKET: Nightly claims load.' });
    expect(toast.error).toHaveBeenCalledWith('1 task still uses INPUT_BUCKET: Nightly claims load.');
  });

  it('refuses a delete of a key in use without asking the server', async () => {
    const { component, http, toast, open } = screen();
    flushList(http);
    await component.remove(component.rows()[1]);
    http.expectNone(r => r.method === 'DELETE');
    expect(open).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/2 tasks/));
  });

  it('lets a platform administrator narrow to one workspace', () => {
    const { component, http } = screen(true);
    http.expectOne(r => r.url.endsWith('/tenant.json/listTenants'))
      .flush({ status: API_SUCCESS, data: [{ tenantId: 2901, tenantName: 'CareBridge' }] });
    flushList(http);
    component.setTenant('2901');
    TestBed.tick();
    const req = http.expectOne(r => r.url === ENDPOINT && r.method === 'GET');
    expect(req.request.params.get('tenantId')).toBe('2901');
    req.flush({ status: API_SUCCESS, data: [] });
    expect(component.workspaceName(2901)).toBe('CareBridge');
  });
});

function dialog(data: ConfigValueDialogData, platform = false) {
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  const close = vi.fn();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ConfigValueDialog],
    providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: auth(platform) },
      { provide: ToastService, useValue: toast },
      { provide: DIALOG_DATA, useValue: data },
      { provide: DialogRef, useValue: { close } },
    ],
  });
  const fixture = TestBed.createComponent(ConfigValueDialog);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, el: fixture.nativeElement as HTMLElement,
    http: TestBed.inject(HttpTestingController), toast, close };
}

describe('Configuration values -- adding and changing an entry', () => {
  it('masks a secret while it is typed and keeps the browser from filling one in', () => {
    const { fixture, component, el } = dialog({ mode: 'create' });
    component.form.patchValue({ kind: 'SECRET' });
    fixture.detectChanges();
    const box = el.querySelector('#cfgValue') as HTMLInputElement;
    expect(box.type).toBe('password');
    expect(box.getAttribute('autocomplete')).toBe('new-password');
  });

  it('sends a new secret once and then forgets it', () => {
    const { component, http, close } = dialog({ mode: 'create' });
    component.form.patchValue({ key: 'DB_PASSWORD', kind: 'SECRET', value: 's3cr3t!', description: 'Claims DB' });
    component.save();
    const req = http.expectOne(r => r.url === ENDPOINT && r.method === 'POST');
    expect(req.request.body).toEqual({ key: 'DB_PASSWORD', kind: 'SECRET', value: 's3cr3t!', description: 'Claims DB' });
    // Gone from the form the moment it is sent -- before any answer arrives.
    expect(component.form.get('value')!.value).toBe('');
    req.flush({ status: API_SUCCESS, message: 'Saved.', data: { id: 3, key: 'DB_PASSWORD', kind: 'SECRET', usedByTasks: 0 } });
    expect(close).toHaveBeenCalledWith(true);
  });

  it('forgets a secret the server refused too, and shows why', () => {
    const { component, http, toast, close } = dialog({ mode: 'create' });
    component.form.patchValue({ key: 'DB_PASSWORD', kind: 'SECRET', value: 's3cr3t!' });
    component.save();
    http.expectOne(r => r.method === 'POST').flush({ status: 'ERROR', message: 'DB_PASSWORD already exists in this workspace.' });
    expect(toast.error).toHaveBeenCalledWith('DB_PASSWORD already exists in this workspace.');
    expect(component.form.get('value')!.value).toBe('');
    expect(close).not.toHaveBeenCalled();
  });

  it('refuses a key that is not UPPER_SNAKE and offers the upper-cased one', () => {
    const { fixture, component, el, http } = dialog({ mode: 'create' });
    component.form.patchValue({ key: 'input bucket', kind: 'VALUE', value: 's3://x' });
    component.save();
    http.expectNone(r => r.method === 'POST');
    fixture.detectChanges();
    expect(component.suggestion()).toBe('INPUT_BUCKET');
    const offer = [...el.querySelectorAll('button')].find(b => b.textContent?.includes('INPUT_BUCKET'))!;
    offer.click();
    expect(component.form.get('key')!.value).toBe('INPUT_BUCKET');
    expect(component.form.get('key')!.valid).toBe(true);
  });

  it('refuses a key that starts with a digit or runs past 64 characters', () => {
    const { component } = dialog({ mode: 'create' });
    for (const key of ['1BUCKET', '_BUCKET', 'A'.repeat(65), 'BUCKET-NAME']) {
      component.form.patchValue({ key });
      expect(component.form.get('key')!.valid, key).toBe(false);
    }
    component.form.patchValue({ key: 'A'.repeat(64) });
    expect(component.form.get('key')!.valid).toBe(true);
  });

  it('requires a value', () => {
    const { component, http } = dialog({ mode: 'create' });
    component.form.patchValue({ key: 'INPUT_BUCKET', kind: 'VALUE', value: '   ' });
    component.save();
    http.expectNone(r => r.method === 'POST');
  });

  it('files a platform administrator\'s new entry under the workspace picked', () => {
    const { component, http } = dialog({ mode: 'create', tenants: [{ tenantId: 2901, tenantName: 'CareBridge' }] }, true);
    component.form.patchValue({ key: 'INPUT_BUCKET', kind: 'VALUE', value: 's3://x' });
    component.save();
    http.expectNone(r => r.method === 'POST');
    component.form.patchValue({ tenantId: 2901 });
    component.save();
    expect(http.expectOne(r => r.method === 'POST').request.body.tenantId).toBe(2901);
  });

  it('replaces a secret with a new value, never pre-filled, and forgets it after', () => {
    const row: PipelineConfig = { id: 12, tenantId: 2901, key: 'DB_PASSWORD', kind: 'SECRET', secretSet: true, usedByTasks: 2 };
    const { fixture, component, el, http } = dialog({ mode: 'replace', row });
    fixture.detectChanges();
    const box = el.querySelector('#cfgValue') as HTMLInputElement;
    expect(box.value).toBe('');
    expect(box.type).toBe('password');
    component.save();
    http.expectNone(r => r.method === 'PUT');
    component.form.patchValue({ value: 'n3w-s3cr3t' });
    component.save();
    const req = http.expectOne(r => r.url === ENDPOINT && r.method === 'PUT');
    expect(req.request.body).toEqual({ id: 12, value: 'n3w-s3cr3t' });
    expect(component.form.get('value')!.value).toBe('');
  });

  it('edits a secret\'s description without touching the secret', () => {
    const row: PipelineConfig = { id: 12, tenantId: 2901, key: 'DB_PASSWORD', kind: 'SECRET', secretSet: true, description: 'old', usedByTasks: 0 };
    const { fixture, component, el, http } = dialog({ mode: 'edit', row });
    fixture.detectChanges();
    expect(el.querySelector('#cfgValue')).toBeNull();
    component.form.patchValue({ description: 'Claims DB' });
    component.save();
    expect(http.expectOne(r => r.method === 'PUT').request.body).toEqual({ id: 12, description: 'Claims DB' });
  });

  it('edits a plain value in place', () => {
    const row: PipelineConfig = { id: 11, tenantId: 2901, key: 'INPUT_BUCKET', kind: 'VALUE', value: 's3://claims-in', usedByTasks: 0 };
    const { component, http } = dialog({ mode: 'edit', row });
    expect(component.form.get('value')!.value).toBe('s3://claims-in');
    component.form.patchValue({ value: 's3://claims-in-2' });
    component.save();
    expect(http.expectOne(r => r.method === 'PUT').request.body).toEqual({ id: 11, value: 's3://claims-in-2', description: '' });
  });
});
