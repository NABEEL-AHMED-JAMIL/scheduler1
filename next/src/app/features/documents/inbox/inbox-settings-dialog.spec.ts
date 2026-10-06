import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { of, throwError } from 'rxjs';
import { ToastService } from '../../../shared/ui/toast.service';
import { InboxApi } from './inbox.service';
import { InboxSettings } from './inbox.model';
import { InboxSettingsDialog, InboxSettingsData } from './inbox-settings-dialog';

/**
 * MIG-239 console: an administrator's inbox settings -- which of the workspace's own storage connections takes the
 * files, an optional lower size limit, and turning the inbox off (after a confirm: the files stay). Closes true when
 * something changed, false when nothing did.
 */
const SETTINGS: InboxSettings = {
  configured: true, alias: 'ui-review-s3', connectionName: 'UI-REVIEW LocalStack S3 (fake keys)', connectionActive: true,
  maxBytes: 104857600, platformMaxBytes: 104857600,
};
const BUCKETS = [
  { label: 'UI-REVIEW LocalStack S3 (fake keys)', bucket: 'ui-review-s3', provider: 'S3', connectionStatus: 'SUCCESS' },
  { label: 'Archive', bucket: 'archive-s3', provider: 'S3', connectionStatus: 'UNTESTED' },
];

function dialogWith(settings: InboxSettings = SETTINGS, confirm = true) {
  const api = {
    buckets: vi.fn(() => of({ status: 'SUCCESS', message: '', data: BUCKETS })),
    configure: vi.fn(() => of({ status: 'SUCCESS', message: 'Inbox saved.', data: settings })),
    turnOff: vi.fn(() => of({ status: 'SUCCESS', message: 'Inbox turned off.' })),
  };
  const ref = { close: vi.fn() };
  const toast = { success: vi.fn(), error: vi.fn() };
  const dialog = { open: vi.fn(() => ({ closed: of(confirm) })) };
  const data: InboxSettingsData = { settings };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: InboxApi, useValue: api },
      { provide: DialogRef, useValue: ref },
      { provide: DIALOG_DATA, useValue: data },
      { provide: Dialog, useValue: dialog },
      { provide: ToastService, useValue: toast },
    ],
  });
  const form = TestBed.runInInjectionContext(() => new InboxSettingsDialog());
  return { api, ref, toast, dialog, form };
}

describe('Inbox settings dialog', () => {
  it('offers the workspace\'s connections, with the current one chosen', () => {
    const { api, form } = dialogWith();
    expect(api.buckets).toHaveBeenCalled();
    expect(form.options().map(o => o.value)).toEqual(['ui-review-s3', 'archive-s3']);
    expect(form.alias()).toBe('ui-review-s3');
    expect(form.capMb()).toBe('');
  });

  it('starts from the workspace\'s lower limit when there is one', () => {
    const { form } = dialogWith({ ...SETTINGS, maxBytes: 5 * 1048576, workspaceMaxBytes: 5 * 1048576 });
    expect(form.capMb()).toBe('5');
  });

  it('saves the connection and the limit in bytes, and closes saying something changed', () => {
    const { api, ref, form } = dialogWith();
    form.alias.set('archive-s3');
    form.capMb.set('25');
    form.save();
    expect(api.configure).toHaveBeenCalledWith('archive-s3', 25 * 1048576);
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('saves no limit when the field is empty: the platform\'s applies', () => {
    const { api, form } = dialogWith();
    form.save();
    expect(api.configure).toHaveBeenCalledWith('ui-review-s3', null);
  });

  it('checks the limit before the round trip', () => {
    const { api, form } = dialogWith();
    form.capMb.set('500');
    form.save();
    expect(api.configure).not.toHaveBeenCalled();
    expect(form.capError()).toBe('The platform allows at most 100 MB a file.');
  });

  it('asks for a connection before saving', () => {
    const { api, form } = dialogWith({ configured: false, maxBytes: 104857600, platformMaxBytes: 104857600 });
    form.alias.set('');
    form.save();
    expect(api.configure).not.toHaveBeenCalled();
    expect(form.aliasError()).toBe('Choose the storage connection the inbox uses.');
  });

  it('shows the service\'s refusal as it is, and stays open', () => {
    const { api, ref, form } = dialogWith();
    api.configure.mockReturnValueOnce(throwError(() => ({ status: 400,
      error: { message: 'The connection \'archive-s3\' is not active; activate it or choose another.' } })) as never);
    form.save();
    expect(form.error()).toBe('The connection \'archive-s3\' is not active; activate it or choose another.');
    expect(ref.close).not.toHaveBeenCalled();
  });

  it('cancels with nothing changed', () => {
    const { api, ref, form } = dialogWith();
    form.cancel();
    expect(ref.close).toHaveBeenCalledWith(false);
    expect(api.configure).not.toHaveBeenCalled();
    expect(api.turnOff).not.toHaveBeenCalled();
  });

  it('turns the inbox off only after the confirm, which says the files stay', async () => {
    const { api, ref, dialog, form } = dialogWith();
    await form.turnOff();
    const confirm = (dialog.open.mock.calls[0] as unknown[])[1] as { data: { body: string } };
    expect(confirm.data.body).toContain('files already in the inbox stay');
    expect(api.turnOff).toHaveBeenCalled();
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('leaves the inbox on when the confirm is declined', async () => {
    const { api, ref, form } = dialogWith(SETTINGS, false);
    await form.turnOff();
    expect(api.turnOff).not.toHaveBeenCalled();
    expect(ref.close).not.toHaveBeenCalled();
  });
});
