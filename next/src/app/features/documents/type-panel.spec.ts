import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { of, throwError } from 'rxjs';
import { ToastService } from '../../shared/ui/toast.service';
import { DocumentsApi } from './documents.service';
import { TypePanel, TypePanelData } from './type-panel';
import { DocumentType } from './documents.model';
import { PO_DEFINITION } from './documents.fixtures';

/**
 * MIG-272: the type editor. A built-in starter is read-only and Customise saves a copy under the same key; a
 * workspace's own type saves its next version on the version opened (baseVersion), and a type that moved on since is
 * 409 with Open it again; saving is a workspace administrator's alone.
 */
const PO: DocumentType = {
  documentTypeId: 1001, tenantId: null, builtIn: true, typeKey: 'purchase_order', name: 'Purchase order', status: 'Active', currentVersion: 2,
  definition: PO_DEFINITION, versions: [{ version: 2, name: 'Purchase order', dateCreated: '2026-09-29T05:02:51.700+00:00' },
    { version: 1, name: 'Purchase order', dateCreated: '2026-09-29T04:23:08.669+00:00' }],
};
const OWN: DocumentType = { ...PO, documentTypeId: 2001, tenantId: 2924, builtIn: false, name: 'UI-CHECK purchase order', currentVersion: 3,
  versions: [{ version: 3, name: 'UI-CHECK purchase order' }] };

function panelWith(data: Partial<TypePanelData>, type: DocumentType | null = PO, api: Partial<Record<string, unknown>> = {}) {
  const stub = {
    type: vi.fn(() => of({ status: 'SUCCESS', message: '', data: type })),
    typeVersion: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { documentTypeId: 1001, typeKey: 'purchase_order', version: 1, current: false,
      name: 'Purchase order', definition: { ...PO_DEFINITION, rules: [] } } })),
    saveType: vi.fn(() => of({ status: 'SUCCESS', message: '"UI-CHECK purchase order" saved as v4.', data: OWN })),
    setTypeStatus: vi.fn(() => of({ status: 'SUCCESS', message: '"x" is now inactive.', data: { ...OWN, status: 'Inactive' } })),
    ...api,
  };
  const ref = { close: vi.fn() };
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: DIALOG_DATA, useValue: { documentTypeId: type?.documentTypeId ?? null, canManage: true, types: [PO], ...data } },
      { provide: DialogRef, useValue: ref },
      { provide: DocumentsApi, useValue: stub },
      { provide: ToastService, useValue: toast },
    ],
  });
  const fixture = TestBed.createComponent(TypePanel);
  return { fixture, panel: fixture.componentInstance, api: stub, ref, toast, el: fixture.nativeElement as HTMLElement };
}

const buttons = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>('button')].map(b => b.textContent?.trim());

describe('TypePanel', () => {
  it('shows a built-in starter read-only, with Customise for an administrator', async () => {
    const { fixture, el, panel } = panelWith({});
    await fixture.whenStable();
    expect(panel.mode()).toBe('view');
    expect(el.textContent).toContain('A built-in starter');
    expect(buttons(el)).toContain('Customise');
    expect(buttons(el)).not.toContain('Edit');
    expect(el.querySelector<HTMLInputElement>('#typeName')!.readOnly).toBe(true);
    expect(el.querySelectorAll('[aria-label^="Field "][role="group"]')).toHaveLength(5);
  });

  it('customises a starter into a copy under the same key', async () => {
    const { fixture, panel, api, ref } = panelWith({});
    await fixture.whenStable();
    panel.customise();
    panel.name.set('UI-CHECK purchase order');
    panel.save();
    expect(api.saveType).toHaveBeenCalledWith(expect.objectContaining({ typeKey: 'purchase_order', name: 'UI-CHECK purchase order' }));
    expect((api.saveType.mock.calls[0] as unknown[])[0]).not.toHaveProperty('documentTypeId');
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('says a workspace already reads with its own copy, and offers no second one', async () => {
    const { fixture, el } = panelWith({ types: [PO, OWN] });
    await fixture.whenStable();
    expect(el.textContent).toContain('This workspace reads documents with its own "UI-CHECK purchase order" instead.');
    expect(buttons(el)).not.toContain('Customise');
  });

  it('saves a workspace type as its next version, on the version opened', async () => {
    const { fixture, panel, api } = panelWith({}, OWN);
    await fixture.whenStable();
    panel.startEdit();
    panel.setThreshold('85');
    panel.save();
    expect(api.saveType).toHaveBeenCalledWith(expect.objectContaining({ documentTypeId: 2001, baseVersion: 3,
      definition: expect.objectContaining({ autoApproveThreshold: 0.85 }) }));
  });

  it('says to open it again when the type moved on since', async () => {
    const conflict = new HttpErrorResponse({ status: 409, error: { status: 'ERROR',
      message: 'This document type has changed since v3 was opened. Open it again to see v4, then save your change on it.' } });
    const { fixture, panel, el, api } = panelWith({}, OWN, { saveType: vi.fn(() => throwError(() => conflict)) });
    await fixture.whenStable();
    panel.startEdit();
    panel.save();
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('has changed since v3 was opened');
    [...el.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('Open it again'))!.click();
    expect(api.type).toHaveBeenCalledTimes(2);
  });

  it('holds a save back until the definition is one the service accepts', async () => {
    const { fixture, panel, api, el } = panelWith({ documentTypeId: null }, null);
    await fixture.whenStable();
    expect(panel.mode()).toBe('new');
    panel.save();
    await fixture.whenStable();
    expect(api.saveType).not.toHaveBeenCalled();
    expect(el.querySelector('[data-test="type-problems"]')?.textContent).toContain('Name the document type.');
    panel.name.set('UI-CHECK receipt');
    panel.typeKey.set('ui_check_receipt');
    panel.patch({ fields: [{ key: 'total', label: 'Total', type: 'money', required: true }] });
    panel.save();
    expect(api.saveType).toHaveBeenCalledWith(expect.objectContaining({ typeKey: 'ui_check_receipt', name: 'UI-CHECK receipt' }));
  });

  it('is read-only for anyone but an administrator', async () => {
    const { fixture, el } = panelWith({ canManage: false }, OWN);
    await fixture.whenStable();
    expect(el.textContent).toContain('A workspace administrator changes document types.');
    expect(buttons(el)).not.toContain('Edit');
    expect(el.querySelector('[data-test="save-type"]')).toBeNull();
  });

  it('shows an older version as it was saved', async () => {
    const { fixture, panel, api } = panelWith({});
    await fixture.whenStable();
    panel.showVersion(1);
    expect(api.typeVersion).toHaveBeenCalledWith(1001, 1);
    expect(panel.mode()).toBe('version');
    expect(panel.def().rules).toEqual([]);
    panel.backToCurrent();
    expect(panel.def().rules).toHaveLength(2);
  });

  it('switches a workspace type off', async () => {
    const { fixture, panel, api } = panelWith({}, OWN);
    await fixture.whenStable();
    panel.toggleStatus();
    expect(api.setTypeStatus).toHaveBeenCalledWith(2001, 'Inactive');
    expect(panel.type()?.status).toBe('Inactive');
  });
});
