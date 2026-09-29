import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { ToastService } from '../../../shared/ui/toast.service';
import { ApiCollectionsApi } from '../api-collections/api-collections.service';
import { SourcesApi } from './sources.service';
import { SourcePanel, SourcePanelData } from './source-panel';
import { ConnectionDialog } from './connection-dialog';
import { SourceDetail } from './sources.model';

/**
 * MIG-248: a source in the wide side panel. Its kind decides the fields -- an API (a collection, one of its APIs
 * and the version it pins), a file or a bucket folder (one of the workspace's Storage Connections, a path, a
 * format) or a database (a connection and a query). Test, Preview and Infer schema read the saved source, so
 * unsaved changes are saved first. Only a workspace administrator may run them; the panel is read-only for others.
 */
const FILE: SourceDetail = {
  id: 1000, uuid: 'cedebb76', tenantId: 2924, name: 'LIVE-CHECK 0928 customers CSV', description: null, kind: 'FILE', format: 'CSV',
  requestId: null, version: null, environmentId: null, rowsPath: null, storageAlias: 'ui-review-s3', path: 'sources-live-check/live-customers.csv',
  connectionId: null, query: null, options: {}, schema: null, fields: null, lastTestOk: null, lastTestMessage: null, lastTestedAt: null,
  status: 'Active', dateCreated: '2026-09-29T03:31:47.916+00:00',
};
const PREVIEW = {
  ok: true, columns: ['customer_id', 'name', 'ssn'], rows: [{ customer_id: '101', name: 'Ada Lovelace', ssn: '***' }], rowCount: 1, truncated: false, bytes: 80,
  schema: { type: 'object', required: ['customer_id'], properties: { customer_id: { type: 'integer' }, name: { type: 'string' }, ssn: { type: 'string' } } },
  fields: [{ path: 'customer_id', type: 'integer', nullable: false, required: true }, { path: 'name', type: 'string', nullable: false, required: true }],
};

function panelWith(data: Partial<SourcePanelData>, api: Partial<Record<string, unknown>> = {}, collections: Partial<Record<string, unknown>> = {}) {
  const stub = {
    get: vi.fn(() => of({ status: 'SUCCESS', message: '', data: FILE })),
    save: vi.fn(() => of({ status: 'SUCCESS', message: 'Source saved.', data: { id: 1000, uuid: 'cedebb76' } })),
    test: vi.fn(() => of({ status: 'SUCCESS', message: 'The source answered.', data: { ...PREVIEW, rows: PREVIEW.rows, message: 'The source answered: 3 columns.' } })),
    preview: vi.fn(() => of({ status: 'SUCCESS', message: 'Previewed 1 row.', data: PREVIEW })),
    schema: vi.fn(() => of({ status: 'SUCCESS', message: 'Schema inferred.', data: PREVIEW })),
    buckets: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [{ bucket: 'ui-review-s3', label: 'UI-REVIEW LocalStack S3', provider: 'S3' }] })),
    connections: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [
      { id: 5, tenantId: 2924, name: 'Warehouse', engine: 'POSTGRES', host: 'db', port: 5432, database: 'dw', username: 'r', passwordSet: true, sslMode: 'REQUIRE' },
    ] })),
    ...api,
  };
  const coll = {
    list: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [{ collectionId: 7, tenantId: 2924, name: 'Clinic API', currentVersion: 3, status: 'Active' }] })),
    get: vi.fn(() => of({ status: 'SUCCESS', message: '', data: {
      collection: { collectionId: 7, name: 'Clinic API', currentVersion: 3 }, folders: [],
      requests: [{ requestId: 70, folderId: null, name: 'List patients', method: 'GET', urlTemplate: '{{baseUrl}}/patients', authMode: 'INHERIT', enabled: true }],
      environments: [{ environmentId: 41, name: 'Prod', isDefault: true, variables: [] }],
      versions: [{ version: 3 }, { version: 2 }, { version: 1 }], access: [], imports: [],
    } })),
    getRequest: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { requestId: 70, collectionId: 7 } })),
    ...collections,
  };
  const ref = { close: vi.fn() };
  const dialog = { open: vi.fn(() => ({ closed: of({ id: 6, name: 'UI-CHECK db', passwordSet: true }) })) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: DIALOG_DATA, useValue: { sourceId: 1000, canManage: true, ...data } },
      { provide: DialogRef, useValue: ref },
      { provide: Dialog, useValue: dialog },
      { provide: SourcesApi, useValue: stub },
      { provide: ApiCollectionsApi, useValue: coll },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
    ],
  });
  return { stub, coll, ref, dialog };
}

describe('SourcePanel -- opening', () => {
  it('reads a saved file source, and the storage connections it can name', () => {
    const { stub } = panelWith({});
    const panel = TestBed.runInInjectionContext(() => new SourcePanel());
    expect(stub.get).toHaveBeenCalledWith(1000);
    expect(stub.buckets).toHaveBeenCalled();
    expect(panel.edit()).toMatchObject({ kind: 'FILE', storageAlias: 'ui-review-s3', format: 'CSV' });
    expect(panel.heading()).toBe('Edit source · LIVE-CHECK 0928 customers CSV');
    expect(panel.dirty()).toBe(false);
  });

  it('reads an API source\'s collection from its request, so the pickers open where it points', () => {
    const { coll } = panelWith({}, { get: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { ...FILE, kind: 'API', format: null, storageAlias: null,
      path: null, requestId: 70, version: 2, environmentId: 41 } })) });
    const panel = TestBed.runInInjectionContext(() => new SourcePanel());
    expect(coll.getRequest).toHaveBeenCalledWith(70);
    expect(coll.get).toHaveBeenCalledWith(7);
    expect(panel.edit()).toMatchObject({ kind: 'API', collectionId: 7, requestId: 70, version: 2 });
    expect(panel.requests().map(r => r.name)).toEqual(['List patients']);
    expect(panel.dirty()).toBe(false);
  });

  it('starts a new source empty, as a file, and reads only what that kind needs', () => {
    const { stub, coll } = panelWith({ sourceId: null });
    const panel = TestBed.runInInjectionContext(() => new SourcePanel());
    expect(stub.get).not.toHaveBeenCalled();
    expect(panel.heading()).toBe('New source');
    expect(stub.connections).not.toHaveBeenCalled();
    panel.setKind('DATABASE');
    panel.setKind('API');
    expect(stub.connections).toHaveBeenCalledTimes(1);
    expect(coll.list).toHaveBeenCalledTimes(1);
  });

  it('pins a picked collection\'s current version, and clears an API from another collection', () => {
    panelWith({ sourceId: null });
    const panel = TestBed.runInInjectionContext(() => new SourcePanel());
    panel.setKind('API');
    panel.patch({ requestId: 99 });
    panel.pickCollection(7);
    expect(panel.edit()).toMatchObject({ collectionId: 7, requestId: null, version: 3, environmentId: 41 });
    expect(panel.versions()).toEqual([3, 2, 1]);
  });
});

describe('SourcePanel -- test, preview, schema', () => {
  it('tests the saved source, and says it answered', () => {
    const { stub } = panelWith({});
    const panel = TestBed.runInInjectionContext(() => new SourcePanel());
    panel.test();
    expect(stub.save).not.toHaveBeenCalled();
    expect(stub.test).toHaveBeenCalledWith(1000);
    expect(panel.testResult()?.ok).toBe(true);
  });

  it('saves unsaved changes first: the service reads the saved source', () => {
    const { stub } = panelWith({});
    const panel = TestBed.runInInjectionContext(() => new SourcePanel());
    panel.patch({ path: 'sources-live-check/other.csv' });
    expect(panel.dirty()).toBe(true);
    panel.preview();
    expect(stub.save).toHaveBeenCalledWith(expect.objectContaining({ sourceId: 1000, path: 'sources-live-check/other.csv' }));
    expect(stub.preview).toHaveBeenCalledWith(1000);
    expect(panel.previewResult()?.rows?.[0]).toEqual({ customer_id: '101', name: 'Ada Lovelace', ssn: '***' });
    expect(panel.dirty()).toBe(false);
  });

  it('shows why a preview could not be made -- Parquet is not read yet -- in place of rows', () => {
    const note = 'Parquet files cannot be previewed yet: only CSV, JSON and JSON Lines are read for now.';
    panelWith({}, { preview: vi.fn(() => of({ status: 'ERROR', message: note })) });
    const panel = TestBed.runInInjectionContext(() => new SourcePanel());
    panel.preview();
    expect(panel.previewResult()).toBeNull();
    expect(panel.previewNote()).toBe(note);
    expect(panel.error()).toBe('');
  });

  it('infers the schema, and shows it on the Schema tab', () => {
    const { stub } = panelWith({});
    const panel = TestBed.runInInjectionContext(() => new SourcePanel());
    panel.inferSchema();
    expect(stub.schema).toHaveBeenCalledWith(1000);
    expect(panel.resultTab()).toBe('schema');
    expect(panel.schemaShown()?.fields?.map(f => f.path)).toEqual(['customer_id', 'name']);
  });

  it('shows the schema the source last kept before anything is run', () => {
    panelWith({}, { get: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { ...FILE, schema: PREVIEW.schema, fields: PREVIEW.fields } })) });
    const panel = TestBed.runInInjectionContext(() => new SourcePanel());
    expect(panel.schemaShown()?.schema).toEqual(PREVIEW.schema);
  });

  it('refuses to save what the service would refuse, without asking it', () => {
    const { stub } = panelWith({ sourceId: null });
    const panel = TestBed.runInInjectionContext(() => new SourcePanel());
    panel.patch({ name: 'UI-CHECK x', storageAlias: 'ui-review-s3', path: 'folder/' });
    panel.save();
    expect(stub.save).not.toHaveBeenCalled();
    expect(panel.error()).toBe('A file source names one file; a folder is a Bucket source.');
  });

  it('runs nothing for a member who is not a workspace administrator', () => {
    const { stub } = panelWith({ canManage: false });
    const panel = TestBed.runInInjectionContext(() => new SourcePanel());
    panel.test(); panel.preview(); panel.inferSchema(); panel.save();
    expect(stub.test).not.toHaveBeenCalled();
    expect(stub.preview).not.toHaveBeenCalled();
    expect(stub.schema).not.toHaveBeenCalled();
    expect(stub.save).not.toHaveBeenCalled();
  });

  it('closes saying whether anything was saved, so the list reads itself again', () => {
    const { ref } = panelWith({});
    const panel = TestBed.runInInjectionContext(() => new SourcePanel());
    panel.patch({ name: 'renamed' });
    panel.save();
    panel.close();
    expect(ref.close).toHaveBeenCalledWith(true);
  });
});

describe('SourcePanel -- a database source', () => {
  it('creates a connection from the panel, then picks it', () => {
    const { stub, dialog } = panelWith({ sourceId: null });
    const panel = TestBed.runInInjectionContext(() => new SourcePanel());
    panel.setKind('DATABASE');
    panel.newConnection();
    expect(dialog.open).toHaveBeenCalledWith(ConnectionDialog, expect.anything());
    expect(stub.connections).toHaveBeenCalledTimes(2);
    expect(panel.edit()?.connectionId).toBe(6);
  });
});

describe('SourcePanel -- the page', () => {
  it('draws the fields of a file source, and the three actions for an administrator', () => {
    panelWith({});
    const fixture = TestBed.createComponent(SourcePanel);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const labels = Array.from(el.querySelectorAll('label')).map(l => l.textContent!.replace(/\s+/g, ' ').trim());
    expect(labels).toEqual(expect.arrayContaining(['Storage connection *(required)', 'Path *(required)', 'Format']));
    const buttons = Array.from(el.querySelectorAll('button')).map(b => b.textContent!.replace(/\s+/g, ' ').trim());
    expect(buttons).toEqual(expect.arrayContaining(['Test connection', 'Preview', 'Infer schema']));
  });

  it('draws a masked preview as the service returned it', () => {
    panelWith({});
    const fixture = TestBed.createComponent(SourcePanel);
    fixture.detectChanges();
    fixture.componentInstance.preview();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(Array.from(el.querySelectorAll('[data-test="preview-rows"] th')).map(th => th.textContent!.trim())).toEqual(['customer_id', 'name', 'ssn']);
    expect(el.querySelector('[data-test="preview-rows"]')!.textContent).toContain('***');
  });
});
