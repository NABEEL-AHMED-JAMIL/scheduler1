import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { ConnectionDialog } from './connection-dialog';

/**
 * The dialog builds its own form in a field initializer, so the class is constructed inside an
 * injection context rather than rendered -- the rules under test are on the controls, not in the
 * markup.
 */
function dialogFor(connection?: Record<string, unknown>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: DIALOG_DATA, useValue: { connection } },
      { provide: DialogRef, useValue: { close: () => {} } },
      { provide: HttpClient, useValue: { get: () => of({ status: 'SUCCESS', message: '', data: [] }) } },
    ],
  });
  return TestBed.runInInjectionContext(() => new ConnectionDialog());
}

const requires = (dialog: ConnectionDialog, field: string) =>
  dialog.form.get(field)!.hasError('required');

/**
 * S3 no longer falls back to the host's IAM role, so a connection saved without keys is refused
 * by the server. Without the matching rule here the only feedback is a toast at the edge of the
 * screen with nothing marked on the field that caused it.
 */
describe('ConnectionDialog S3 credential rules', () => {
  it('requires both keys on a new S3 connection', () => {
    const dialog = dialogFor();
    dialog.form.get('provider')!.setValue('S3');
    expect(requires(dialog, 'accessKey')).toBe(true);
    expect(requires(dialog, 'secretKey')).toBe(true);
  });

  it('still requires the access key when editing, since it is sent back and can be blanked', () => {
    const dialog = dialogFor({ provider: 'S3', accessKey: 'AKIAEXAMPLE', secretKeyConfigured: true });
    expect(dialog.form.get('accessKey')!.value).toBe('AKIAEXAMPLE');
    expect(requires(dialog, 'accessKey')).toBe(false);
    dialog.form.get('accessKey')!.setValue('');
    expect(requires(dialog, 'accessKey')).toBe(true);
  });

  it('leaves the secret optional when editing, where blank means "keep the stored one"', () => {
    const dialog = dialogFor({ provider: 'S3', accessKey: 'AKIAEXAMPLE', secretKeyConfigured: true });
    expect(requires(dialog, 'secretKey')).toBe(false);
  });

  it('asks for no keys on MinIO, which the server does not demand them for', () => {
    const dialog = dialogFor();
    expect(dialog.form.get('provider')!.value).toBe('MINIO');
    expect(requires(dialog, 'accessKey')).toBe(false);
    expect(requires(dialog, 'secretKey')).toBe(false);
  });

  it('drops the S3 rules again when the provider changes', () => {
    const dialog = dialogFor();
    dialog.form.get('provider')!.setValue('S3');
    dialog.form.get('provider')!.setValue('FTP');
    // A rule left behind here would make an FTP connection unsaveable over fields the form
    // does not even show.
    expect(requires(dialog, 'accessKey')).toBe(false);
    expect(requires(dialog, 'secretKey')).toBe(false);
  });
});
