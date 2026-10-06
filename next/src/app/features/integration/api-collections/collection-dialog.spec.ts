import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { ToastService } from '../../../shared/ui/toast.service';
import { ApiCollectionsApi } from './api-collections.service';
import { CollectionDialog, CollectionDialogData } from './collection-dialog';

/**
 * MIG-247: a collection's details and its default auth -- the scheme its APIs inherit. A secret in the auth is
 * always a {{variable}}: its value lives, sealed, in an environment. On an edit the auth is the row's own: the list
 * and /get carry it (MIG-310), so nothing is read first.
 */
function dialogWith(data: CollectionDialogData, api: Partial<Record<string, unknown>> = {}) {
  const stub = {
    version: vi.fn(),
    saveCollection: vi.fn(() => of({ status: 'SUCCESS', message: 'API collection saved.', data: { id: 7, collectionId: 7, version: 3 } })),
    ...api,
  };
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
  const dialog = TestBed.runInInjectionContext(() => new CollectionDialog());
  return { dialog, stub, ref };
}

const ROW = { collectionId: 7, name: 'Clinic API', description: 'Patients', sensitivity: 'sensitive', sensitivityLabel: 'PHI', status: 'Active', currentVersion: 2,
  defaultAuth: { type: 'BEARER', bearer: { token: '{{token}}' }, apikey: { key: 'X-Key', value: '{{k}}' } } };

describe('CollectionDialog -- a new collection', () => {
  it('creates with a name, and no auth unless one is chosen', () => {
    const { dialog, stub, ref } = dialogWith({});
    dialog.name.set('  UI-CHECK Clinic  ');
    dialog.save();
    expect(stub.saveCollection).toHaveBeenCalledWith({ collectionId: null, name: 'UI-CHECK Clinic', description: null,
      sensitivity: null, status: 'Active', defaultAuth: null });
    expect(ref.close).toHaveBeenCalledWith(7);
  });

  it('asks a platform administrator which workspace it is for', () => {
    const { dialog, stub } = dialogWith({ tenants: [{ value: '2924', label: 'Claude Demo' }] });
    dialog.name.set('x');
    dialog.save();
    expect(stub.saveCollection).not.toHaveBeenCalled();
    expect(dialog.error()).toBe('Choose the workspace the collection is for.');
    dialog.tenantId.set('2924');
    dialog.save();
    expect(stub.saveCollection).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 2924 }));
  });

  it('refuses a secret typed into the auth, and asks for a {{variable}}', () => {
    const { dialog, stub } = dialogWith({});
    dialog.name.set('x');
    dialog.authType.set('BEARER');
    dialog.setAuthField('token', 'eyJhbGciOi.real.token');
    dialog.save();
    expect(stub.saveCollection).not.toHaveBeenCalled();
    expect(dialog.error()).toBe('Token must be a {{variable}}: put the secret in an environment, marked Secret.');
  });

  it('sends the scheme\'s block under its own name', () => {
    const { dialog, stub } = dialogWith({});
    dialog.name.set('x');
    dialog.authType.set('APIKEY');
    dialog.setAuthField('key', 'X-Api-Key');
    dialog.setAuthField('value', '{{apiKey}}');
    dialog.save();
    expect(stub.saveCollection).toHaveBeenCalledWith(expect.objectContaining({
      defaultAuth: { type: 'APIKEY', apikey: { key: 'X-Api-Key', value: '{{apiKey}}' } },
    }));
  });
});

describe('CollectionDialog -- editing', () => {
  it('reads the auth from the row, with no version read, and keeps the other schemes\' blocks', () => {
    const { dialog, stub } = dialogWith({ collection: ROW });
    expect(stub.version).not.toHaveBeenCalled();
    expect(dialog.authType()).toBe('BEARER');
    expect(dialog.authValue('token')).toBe('{{token}}');
    dialog.description.set('All patients');
    dialog.save();
    expect(stub.saveCollection).toHaveBeenCalledWith({ collectionId: 7, name: 'Clinic API', description: 'All patients', sensitivity: 'PHI',
      status: 'Active', defaultAuth: { type: 'BEARER', bearer: { token: '{{token}}' }, apikey: { key: 'X-Key', value: '{{k}}' } } });
  });

  it('opens a collection with no default auth on None', () => {
    const { defaultAuth: _none, ...plain } = ROW;
    const { dialog } = dialogWith({ collection: plain });
    expect(dialog.authType()).toBe('NONE');
  });

  it('shows the service\'s refusal in the dialog', () => {
    const { dialog, ref } = dialogWith({ collection: ROW }, { saveCollection: vi.fn(() => of({ status: 'ERROR', message: 'An API collection named Clinic API already exists.' })) });
    dialog.save();
    expect(dialog.error()).toBe('An API collection named Clinic API already exists.');
    expect(ref.close).not.toHaveBeenCalled();
  });
});

describe('CollectionDialog -- sensitivity (MIG-243)', () => {
  it('edits the word the collection was given, and sends it back as it is', () => {
    const { dialog, stub } = dialogWith({ collection: { ...ROW, sensitivity: 'sensitive', sensitivityLabel: 'PHI' } });
    expect(dialog.sensitivity()).toBe('PHI');
    dialog.save();
    expect(stub.saveCollection).toHaveBeenCalledWith(expect.objectContaining({ sensitivity: 'PHI' }));
  });

  it('reads a collection nobody set as not set, though the service reads it as internal', () => {
    const { dialog } = dialogWith({ collection: { ...ROW, sensitivity: 'internal', sensitivityLabel: null } });
    expect(dialog.sensitivity()).toBe('');
  });
});
