import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { ToastService } from '../../../shared/ui/toast.service';
import { SourcesApi } from './sources.service';
import { ConnectionDialog, ConnectionDialogData } from './connection-dialog';
import { ConnectionRow } from './sources.model';

/**
 * MIG-248: a PostgreSQL connection for database sources. Its password is write-only: the service answers
 * `passwordSet` and never the value, the dialog shows "••• configured" with Replace, and a save sends a password
 * only when one was typed -- otherwise the stored one stays.
 */
const ROW: ConnectionRow = { id: 5, tenantId: 2924, name: 'Warehouse', engine: 'POSTGRES', host: 'db.internal', port: 5432, database: 'dw',
  username: 'reader', passwordSet: true, sslMode: 'REQUIRE', status: 'Active' };

function dialogWith(data: Partial<ConnectionDialogData>, api: Partial<Record<string, unknown>> = {}) {
  const stub = {
    saveConnection: vi.fn(() => of({ status: 'SUCCESS', message: 'Database connection saved.', data: { ...ROW, id: 6 } })),
    testConnection: vi.fn(() => of({ status: 'SUCCESS', message: 'Connected.', data: { ok: true, message: 'Connected.' } })),
    ...api,
  };
  const ref = { close: vi.fn() };
  const toast = { success: vi.fn(), error: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: DIALOG_DATA, useValue: { connection: ROW, ...data } },
      { provide: DialogRef, useValue: ref },
      { provide: SourcesApi, useValue: stub },
      { provide: ToastService, useValue: toast },
    ],
  });
  return { stub, ref, toast };
}

describe('ConnectionDialog', () => {
  it('keeps the stored password: saving without Replace sends none', () => {
    const { stub, ref } = dialogWith({});
    const d = TestBed.runInInjectionContext(() => new ConnectionDialog());
    d.patch({ host: 'db2.internal' });
    d.save();
    const body = (stub.saveConnection.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(body['host']).toBe('db2.internal');
    expect('password' in body).toBe(false);
    expect(ref.close).toHaveBeenCalledWith(expect.objectContaining({ id: 6 }));
  });

  it('sends a replacement once, and forgets it the moment it is saved', () => {
    const { stub } = dialogWith({});
    const d = TestBed.runInInjectionContext(() => new ConnectionDialog());
    d.replace();
    d.patch({ password: 'n3w-secret' });
    d.save();
    expect(((stub.saveConnection.mock.calls[0] as unknown[])[0] as Record<string, unknown>)['password']).toBe('n3w-secret');
    expect(d.edit().password).toBe('');
  });

  it('asks a new connection for a password, and names a platform administrator\'s workspace', () => {
    const { stub } = dialogWith({ connection: null, tenants: [{ value: '2924', label: 'Claude Demo' }], tenantId: 2924 });
    const d = TestBed.runInInjectionContext(() => new ConnectionDialog());
    expect(d.edit().tenantId).toBe(2924);
    d.patch({ name: 'UI-CHECK db', host: 'h', database: 'd', username: 'u', password: 'p' });
    d.save();
    expect((stub.saveConnection.mock.calls[0] as unknown[])[0]).toEqual({ connectionId: null, tenantId: 2924, name: 'UI-CHECK db', engine: 'POSTGRES',
      host: 'h', port: 5432, database: 'd', username: 'u', sslMode: 'REQUIRE', password: 'p' });
  });

  it('shows what to fix before asking the service', () => {
    const { stub } = dialogWith({ connection: null });
    const d = TestBed.runInInjectionContext(() => new ConnectionDialog());
    d.save();
    expect(stub.saveConnection).not.toHaveBeenCalled();
    expect(d.error()).toBe('Give the connection a name.');
  });

  it('tests a saved connection, and says why it did not connect', () => {
    dialogWith({}, { testConnection: vi.fn(() => of({ status: 'SUCCESS', message: 'x', data: { ok: false, message: 'Connection refused.' } })) });
    const d = TestBed.runInInjectionContext(() => new ConnectionDialog());
    d.test();
    expect(d.testOutcome()).toEqual({ ok: false, message: 'Connection refused.' });
  });

  it('never draws a stored password: only that one is configured, and a Replace button', () => {
    dialogWith({});
    const fixture = TestBed.createComponent(ConnectionDialog);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('configured');
    const password = el.querySelector('input[type="password"]');
    expect(password).toBeNull();
    expect(Array.from(el.querySelectorAll('button')).map(b => b.textContent!.trim())).toContain('Replace');
  });
});
