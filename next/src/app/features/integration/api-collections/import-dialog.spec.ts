import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { ToastService } from '../../../shared/ui/toast.service';
import { ApiCollectionsApi } from './api-collections.service';
import { ImportDialog, ImportDialogData } from './import-dialog';

/**
 * MIG-247: Import. The files are read in the browser and their text sent (MIG-228): a Postman collection with any
 * environment files, or a Bruno folder -- or loose .bru files -- each by its path. Nothing in them is run. What
 * comes back is the report: what came across, what became a rule, what needs a look and what was skipped.
 */
const RESULT = {
  importId: 5, collectionId: 1002, version: 1, sourceFormat: 'POSTMAN', status: 'REVIEW',
  report: {
    counts: { imported: 2, converted: 0, review: 1, skipped: 1 },
    imported: [{ item: 'Patients/List', note: 'GET' }, { item: 'Patients/Get', note: 'GET' }],
    converted: [],
    review: [{ item: 'collection auth', note: 'the token became the secret variable token' }],
    skipped: [{ item: 'Patients/Upload', note: 'file bodies are not imported' }],
  },
};

function dialogWith(data: ImportDialogData = {}, answer: unknown = { status: 'SUCCESS', message: 'Collection imported; the report lists what needs a look.', data: RESULT }) {
  const stub = { import: vi.fn(() => of(answer)) };
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
  return { dialog: TestBed.runInInjectionContext(() => new ImportDialog()), stub, ref };
}

const json = (name: string, value: unknown) => new File([JSON.stringify(value)], name, { type: 'application/json' });

describe('ImportDialog -- Postman', () => {
  it('sends the collection and its environments as JSON, with the name when one is given', async () => {
    const { dialog, stub } = dialogWith();
    dialog.postmanFile.set(json('clinic.postman_collection.json', { info: { name: 'Clinic' }, item: [] }));
    dialog.environmentFiles.set([json('prod.postman_environment.json', { name: 'Prod', values: [] })]);
    dialog.name.set(' UI-CHECK Clinic ');
    await dialog.run();
    expect(stub.import).toHaveBeenCalledWith({ format: 'POSTMAN', collection: { info: { name: 'Clinic' }, item: [] },
      environments: [{ name: 'Prod', values: [] }], name: 'UI-CHECK Clinic' });
  });

  it('says which file is not JSON, and sends nothing', async () => {
    const { dialog, stub } = dialogWith();
    dialog.postmanFile.set(new File(['not json'], 'broken.json'));
    await dialog.run();
    expect(stub.import).not.toHaveBeenCalled();
    expect(dialog.error()).toBe('broken.json is not a JSON file.');
  });

  it('asks for the collection file first', async () => {
    const { dialog, stub } = dialogWith();
    await dialog.run();
    expect(stub.import).not.toHaveBeenCalled();
    expect(dialog.error()).toBe('Choose the Postman collection file.');
  });
});

describe('ImportDialog -- Bruno', () => {
  it('sends the folder\'s files by their paths inside it', async () => {
    const { dialog, stub } = dialogWith();
    dialog.format.set('BRUNO');
    dialog.brunoPicked.set([
      Object.assign(new File(['{"name":"Clinic"}'], 'bruno.json'), { webkitRelativePath: 'Clinic/bruno.json' }),
      Object.assign(new File(['meta { name: List }'], 'list.bru'), { webkitRelativePath: 'Clinic/patients/list.bru' }),
    ]);
    await dialog.run();
    expect(stub.import).toHaveBeenCalledWith({ format: 'BRUNO', files: [
      { path: 'bruno.json', content: '{"name":"Clinic"}' }, { path: 'patients/list.bru', content: 'meta { name: List }' },
    ] });
  });

  it('refuses a pick with no Bruno files in it', async () => {
    const { dialog, stub } = dialogWith();
    dialog.format.set('BRUNO');
    dialog.brunoPicked.set([new File(['x'], 'readme.md')]);
    await dialog.run();
    expect(stub.import).not.toHaveBeenCalled();
    expect(dialog.error()).toBe('No .bru files in what was picked.');
  });
});

describe('ImportDialog -- the report', () => {
  it('shows the report in the dialog, what needs a look first, and opens the new collection from it', async () => {
    const { dialog, ref } = dialogWith();
    dialog.postmanFile.set(json('c.json', { item: [] }));
    await dialog.run();
    expect(dialog.result()?.collectionId).toBe(1002);
    expect(dialog.rows().map(r => r.kind)).toEqual(['Review', 'Skipped', 'Imported', 'Imported']);
    expect(dialog.confirmLabel()).toBe('Open collection');
    dialog.confirm();
    expect(ref.close).toHaveBeenCalledWith({ collectionId: 1002, open: true });
  });

  it('closes to the list, which then shows the new collection', async () => {
    const { dialog, ref } = dialogWith();
    dialog.postmanFile.set(json('c.json', { item: [] }));
    await dialog.run();
    dialog.cancel();
    expect(ref.close).toHaveBeenCalledWith({ collectionId: 1002, open: false });
  });

  it('keeps the form and says why when the service refuses', async () => {
    const { dialog } = dialogWith({}, { status: 'ERROR', message: 'The file is not a Postman v2.1 collection.' });
    dialog.postmanFile.set(json('c.json', { item: [] }));
    await dialog.run();
    expect(dialog.result()).toBeNull();
    expect(dialog.error()).toBe('The file is not a Postman v2.1 collection.');
  });

  it('asks a platform administrator which workspace to import into', async () => {
    const { dialog, stub } = dialogWith({ tenants: [{ value: '2924', label: 'Claude Demo' }] });
    dialog.postmanFile.set(json('c.json', { item: [] }));
    await dialog.run();
    expect(dialog.error()).toBe('Choose the workspace to import into.');
    dialog.tenantId.set('2924');
    await dialog.run();
    expect(stub.import).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 2924 }));
  });
});
