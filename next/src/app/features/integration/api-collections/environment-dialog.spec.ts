import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { ToastService } from '../../../shared/ui/toast.service';
import { ApiCollectionsApi } from './api-collections.service';
import { EnvironmentDialog, EnvironmentDialogData } from './environment-dialog';

/**
 * MIG-247, the business rule: no secret value ever reaches the browser. A stored secret shows "••• configured"
 * with Replace; Replace opens a write-only box whose value is sent once and never read back; a secret not
 * replaced is sent without a value, which keeps the sealed one.
 */
const ENV = {
  environmentId: 41, name: 'Prod', isDefault: true, variables: [
    { key: 'baseUrl', secret: false, value: 'https://api.example.test', configured: true },
    { key: 'token', secret: true, value: null, configured: true },
    { key: 'clientSecret', secret: true, value: null, configured: false },
  ],
};

function dialogWith(data: EnvironmentDialogData) {
  const stub = { saveEnvironment: vi.fn(() => of({ status: 'SUCCESS', message: 'API environment saved.', data: { id: 41, collectionId: 11, version: 5 } })) };
  const ref = { close: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: DIALOG_DATA, useValue: data },
      { provide: DialogRef, useValue: ref },
      { provide: ApiCollectionsApi, useValue: stub },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
    ],
  });
  return { stub, ref };
}

describe('EnvironmentDialog -- secrets are replace-only', () => {
  it('keeps every stored secret when nothing is replaced: sent without a value', () => {
    const { stub } = dialogWith({ collectionId: 11, environment: ENV });
    const dialog = TestBed.runInInjectionContext(() => new EnvironmentDialog());
    dialog.save();
    expect(stub.saveEnvironment).toHaveBeenCalledWith({ environmentId: 41, collectionId: 11, name: 'Prod', isDefault: true, variables: [
      { key: 'baseUrl', secret: false, value: 'https://api.example.test' },
      { key: 'token', secret: true },
      { key: 'clientSecret', secret: true },
    ] });
  });

  it('sends a replaced secret\'s new value, and only that', () => {
    const { stub } = dialogWith({ collectionId: 11, environment: ENV });
    const dialog = TestBed.runInInjectionContext(() => new EnvironmentDialog());
    dialog.replace(1);
    dialog.setValue(1, 'UI-CHECK-rotated');
    dialog.save();
    const sent = (stub.saveEnvironment.mock.calls[0] as unknown[])[0] as { variables: unknown[] };
    expect(sent.variables[1]).toEqual({ key: 'token', secret: true, value: 'UI-CHECK-rotated' });
  });

  it('draws a stored secret masked, with Replace, and a replacement as a write-only box', () => {
    dialogWith({ collectionId: 11, environment: ENV });
    const fixture = TestBed.createComponent(EnvironmentDialog);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const row = el.querySelectorAll('tbody tr')[1] as HTMLElement;
    expect(row.textContent).toContain('configured');
    expect(row.querySelector('.secret-mask')).not.toBeNull();
    expect(row.querySelector('input[aria-label="Value of token"]')).toBeNull();
    (Array.from(row.querySelectorAll('button')).find(b => b.textContent!.includes('Replace')) as HTMLButtonElement).click();
    fixture.detectChanges();
    const box = row.querySelector('input[aria-label="New value of token"]') as HTMLInputElement;
    expect(box.type).toBe('password');
    expect(box.getAttribute('autocomplete')).toBe('new-password');
    expect(box.value).toBe('');
  });

  it('says a secret with nothing stored is not set, rather than masking nothing', () => {
    dialogWith({ collectionId: 11, environment: ENV });
    const fixture = TestBed.createComponent(EnvironmentDialog);
    fixture.detectChanges();
    const row = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr')[2] as HTMLElement;
    const box = row.querySelector('input[aria-label="Value of clientSecret"]') as HTMLInputElement;
    expect(box.type).toBe('password');
    expect(row.textContent).toContain('not set');
  });

  it('warns that switching a stored secret to plain discards it, and never fills in the old value', () => {
    dialogWith({ collectionId: 11, environment: ENV });
    const dialog = TestBed.runInInjectionContext(() => new EnvironmentDialog());
    dialog.setSecret(1, false);
    expect(dialog.rows()[1].value).toBe('');
    expect(dialog.discards()).toEqual(['token']);
  });
});

describe('EnvironmentDialog -- the environment', () => {
  it('makes the first environment the default', () => {
    const { stub } = dialogWith({ collectionId: 11, first: true });
    const dialog = TestBed.runInInjectionContext(() => new EnvironmentDialog());
    expect(dialog.isDefault()).toBe(true);
    dialog.name.set('UI-CHECK Prod');
    dialog.addVariable();
    dialog.setKey(0, 'baseUrl');
    dialog.setValue(0, 'https://httpbin.org');
    dialog.save();
    expect(stub.saveEnvironment).toHaveBeenCalledWith({ environmentId: null, collectionId: 11, name: 'UI-CHECK Prod', isDefault: true,
      variables: [{ key: 'baseUrl', secret: false, value: 'https://httpbin.org' }] });
  });

  it('refuses a key listed twice before the service does', () => {
    const { stub } = dialogWith({ collectionId: 11, environment: ENV });
    const dialog = TestBed.runInInjectionContext(() => new EnvironmentDialog());
    dialog.addVariable();
    dialog.setKey(3, 'token');
    dialog.save();
    expect(stub.saveEnvironment).not.toHaveBeenCalled();
    expect(dialog.error()).toBe('token is listed twice.');
  });
});
