import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { ToastService } from '../../../shared/ui/toast.service';
import { SourcesApi } from './sources.service';
import { ContractPanel, ContractPanelData } from './contract-panel';
import { ContractSampleDialog, ContractSampleData } from './contract-sample-dialog';
import { TemplateDialog, TemplateDialogData } from './template-dialog';
import { ContractRow } from './sources.model';

/**
 * MIG-248 on MIG-233: data contracts on the Sources page. A contract is a versioned JSON Schema for what a customer
 * sends (IN) or what the platform answers (OUT). A workspace administrator installs a template, proposes one from a
 * pasted sample and marks which fields are required, and activates a version; everyone may check a payload against
 * one and read the errors (where, which rule, what). The shared system contract is read-only for all.
 */
const WOUND: ContractRow = { id: 1001, tenantId: 2924, name: 'wound_intake', direction: 'IN', currentVersion: 2, activeVersion: 1, sensitivity: null, system: false };
const SYSTEM: ContractRow = { id: 1000, tenantId: 0, name: 'result_manifest', direction: 'OUT', currentVersion: 1, activeVersion: 1, sensitivity: 'INTERNAL', system: true };
const SCHEMA = { type: 'object', required: ['case_id'], properties: { case_id: { type: 'string' }, notes: { type: ['string', 'null'] } } };
const ERRORS = [
  { path: '$.captured_at', keyword: 'required', message: 'is missing but it is required' },
  { path: '$.case_id', keyword: 'minLength', message: 'must be at least 1 characters long' },
];

function stubApi(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    contract: vi.fn((id: number) => of({ status: 'SUCCESS', message: '', data: { contract: id === SYSTEM.id ? SYSTEM : WOUND, versions: [
      { version: 2, status: 'DRAFT', createdBy: 4537, dateCreated: '2026-09-29T04:00:00.000+00:00' },
      { version: 1, status: 'ACTIVE', createdBy: 4537, dateCreated: '2026-09-29T03:32:13.868+00:00' },
    ] } })),
    contractVersion: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { contractId: 1001, name: 'wound_intake', version: 1, status: 'ACTIVE', schema: SCHEMA, fields: null } })),
    activate: vi.fn(() => of({ status: 'SUCCESS', message: 'Version activated.', data: { contractId: 1001, version: 2, status: 'ACTIVE' } })),
    validate: vi.fn(() => of({ status: 'SUCCESS', message: 'The payload does not hold to wound_intake v1: 2 errors.',
      data: { contractId: 1001, name: 'wound_intake', version: 1, valid: false, errorCount: 2, errors: ERRORS } })),
    infer: vi.fn(() => of({ status: 'SUCCESS', message: 'Schema proposed.', data: { schema: SCHEMA,
      fields: [{ path: 'case_id', type: 'string', nullable: false, required: true }, { path: 'notes', type: 'string', nullable: true, required: false }], sample: { case_id: 'x', notes: null } } })),
    saveContract: vi.fn(() => of({ status: 'SUCCESS', message: 'Data contract saved.', data: { contractId: 1002, version: 1, status: 'ACTIVE' } })),
    templates: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [
      { code: 'wound_intake', direction: 'IN', description: 'A wound assessment request as a clinic sends it.' },
      { code: 'wound_result', direction: 'OUT', description: 'What the platform answers for one wound case.' },
    ] })),
    install: vi.fn(() => of({ status: 'SUCCESS', message: 'Data contract installed.', data: { contractId: 1003, version: 1, status: 'ACTIVE' } })),
    ...overrides,
  };
}

function setup(data: unknown, api = stubApi()) {
  const ref = { close: vi.fn() };
  const toast = { success: vi.fn(), error: vi.fn() };
  const dialog = { open: vi.fn(() => ({ closed: of(true) })) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: DIALOG_DATA, useValue: data },
      { provide: DialogRef, useValue: ref },
      { provide: Dialog, useValue: dialog },
      { provide: SourcesApi, useValue: api },
      { provide: ToastService, useValue: toast },
    ],
  });
  return { api, ref, toast, dialog };
}

describe('ContractPanel', () => {
  const data = (c: ContractRow, canManage = true): ContractPanelData => ({ contract: c, canManage });

  it('opens on the active version, and reads its schema as fields', () => {
    const { api } = setup(data(WOUND));
    const panel = TestBed.runInInjectionContext(() => new ContractPanel());
    expect(api.contract).toHaveBeenCalledWith(1001);
    expect(api.contractVersion).toHaveBeenCalledWith(1001, 1);
    expect(panel.selected()).toBe(1);
    expect(panel.versionDetail()?.schema).toEqual(SCHEMA);
  });

  it('names the level in its subtitle, and the word it was given beside it (MIG-243)', () => {
    const as = (row: ContractRow) => { setup(data(row), stubApi({ contract: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { contract: row, versions: [] } })) })); };
    as({ ...WOUND, sensitivity: 'sensitive', sensitivityLabel: 'PHI' });
    expect(TestBed.runInInjectionContext(() => new ContractPanel()).subtitle()).toBe('In: a customer\'s payload · Sensitive (PHI)');
    as({ ...WOUND, sensitivity: 'internal', sensitivityLabel: 'INTERNAL' });
    expect(TestBed.runInInjectionContext(() => new ContractPanel()).subtitle()).toBe('In: a customer\'s payload · Internal');
  });

  it('activates another version, and reads the contract again', () => {
    const { api, ref } = setup(data(WOUND));
    const panel = TestBed.runInInjectionContext(() => new ContractPanel());
    panel.activate(2);
    expect(api.activate).toHaveBeenCalledWith(1001, 2);
    expect(api.contract).toHaveBeenCalledTimes(2);
    panel.close();
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('checks a pasted payload, and lists each error by path, rule and message', () => {
    const { api } = setup(data(WOUND, false));
    const panel = TestBed.runInInjectionContext(() => new ContractPanel());
    panel.payload.set('{"case_id": ""}');
    panel.validate();
    expect(api.validate).toHaveBeenCalledWith({ contractId: 1001, version: null, payload: { case_id: '' } });
    expect(panel.validation()?.errors).toEqual(ERRORS);
  });

  it('says what is wrong with a payload that is not JSON, without asking', () => {
    const { api } = setup(data(WOUND));
    const panel = TestBed.runInInjectionContext(() => new ContractPanel());
    panel.payload.set('{nope');
    panel.validate();
    expect(api.validate).not.toHaveBeenCalled();
    expect(panel.validateError()).toBe('The payload is not valid JSON.');
  });

  it('changes nothing on a shared system contract, even for an administrator', () => {
    const { api, dialog } = setup(data(SYSTEM));
    const panel = TestBed.runInInjectionContext(() => new ContractPanel());
    expect(panel.canChange()).toBe(false);
    panel.activate(1);
    panel.newVersion();
    expect(api.activate).not.toHaveBeenCalled();
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('draws the errors as a table, and the system contract without its administrator actions', () => {
    setup(data(SYSTEM));
    const fixture = TestBed.createComponent(ContractPanel);
    fixture.detectChanges();
    fixture.componentInstance.payload.set('{}');
    fixture.componentInstance.validate();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const heads = Array.from(el.querySelectorAll('[data-test="validation-errors"] th')).map(th => th.textContent!.trim());
    expect(heads).toEqual(['Path', 'Rule', 'Message']);
    expect(el.textContent).toContain('$.captured_at');
    const buttons = Array.from(el.querySelectorAll('button')).map(b => b.textContent!.replace(/\s+/g, ' ').trim());
    expect(buttons).not.toContain('New version from sample');
    expect(buttons.some(b => b.startsWith('Activate'))).toBe(false);
  });
});

describe('ContractSampleDialog', () => {
  it('proposes a schema from a pasted sample, marks the required fields, and saves v1', () => {
    const { api, ref } = setup({} as ContractSampleData);
    const d = TestBed.runInInjectionContext(() => new ContractSampleDialog());
    d.name.set('UI-CHECK orders');
    d.sample.set('{"case_id": "x", "notes": null}');
    d.propose();
    expect(api.infer).toHaveBeenCalledWith({ sample: { case_id: 'x', notes: null } });
    expect(d.required()).toEqual(['case_id']);
    d.toggleRequired('notes', true);
    d.save();
    expect(api.saveContract).toHaveBeenCalledWith({ contractId: null, name: 'UI-CHECK orders', direction: 'IN', sensitivity: null, schema: SCHEMA,
      required: ['case_id', 'notes'], sample: { case_id: 'x', notes: null }, activate: true });
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('adds a version to an existing contract without renaming it', () => {
    const { api } = setup({ contract: WOUND } as ContractSampleData);
    const d = TestBed.runInInjectionContext(() => new ContractSampleDialog());
    d.sample.set('{"case_id": "x"}');
    d.propose();
    d.activate.set(false);
    d.save();
    expect(api.saveContract).toHaveBeenCalledWith(expect.objectContaining({ contractId: 1001, activate: false }));
    expect((api.saveContract.mock.calls[0] as unknown[])[0]).not.toHaveProperty('name');
  });

  it('asks for a sample before proposing anything', () => {
    const { api } = setup({} as ContractSampleData);
    const d = TestBed.runInInjectionContext(() => new ContractSampleDialog());
    d.propose();
    expect(api.infer).not.toHaveBeenCalled();
    expect(d.error()).toBe('Paste a JSON sample first.');
  });
});

describe('TemplateDialog', () => {
  it('lists the templates, marks the installed ones, and installs another', () => {
    const { api, ref } = setup({ installed: ['wound_intake'] } as TemplateDialogData);
    const d = TestBed.runInInjectionContext(() => new TemplateDialog());
    expect(d.templates().map(t => t.code)).toEqual(['wound_intake', 'wound_result']);
    expect(d.isInstalled('wound_intake')).toBe(true);
    d.install('wound_result');
    expect(api.install).toHaveBeenCalledWith('wound_result', null);
    expect(d.isInstalled('wound_result')).toBe(true);
    d.close();
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('names a platform administrator\'s workspace, and installs nothing without one', () => {
    const { api } = setup({ installed: [], tenants: [{ value: '2924', label: 'Claude Demo' }] } as TemplateDialogData);
    const d = TestBed.runInInjectionContext(() => new TemplateDialog());
    d.install('wound_result');
    expect(api.install).not.toHaveBeenCalled();
    d.tenantId.set(2924);
    d.install('wound_result');
    expect(api.install).toHaveBeenCalledWith('wound_result', 2924);
  });
});
