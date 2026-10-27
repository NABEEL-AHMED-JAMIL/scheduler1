import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of, Subject } from 'rxjs';
import { BillingDocuments } from './documents';
import { BillingApi } from './billing.service';
import { WorkspacePicker } from './workspace-picker';
import { ToastService } from '../../shared/ui/toast.service';
import { API_SUCCESS } from '../../core/api/api.config';

/** Audit 09-22: Statement {{year}} files one statement per click, not one per impatient click. */
describe('BillingDocuments statement', () => {
  it('ignores a second click while the statement is being made', () => {
    const reply = new Subject<any>();
    const api = { statement: vi.fn(() => reply), documents: vi.fn(() => of({ status: API_SUCCESS, data: [] })) };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: BillingApi, useValue: api }, { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: ActivatedRoute, useValue: { queryParamMap: of(new Map()), paramMap: of(new Map()), snapshot: { queryParamMap: new Map() } } },
      { provide: WorkspacePicker, useValue: { tenantId: () => null, options: () => [], ready: (then: () => void) => then(), isPlatformAdmin: () => false } },
    ] });
    const component = TestBed.runInInjectionContext(() => new BillingDocuments());
    component.statement();
    component.statement();
    expect(api.statement).toHaveBeenCalledTimes(1);
    expect(component.statementBusy()).toBe(true);
    reply.error({ error: { message: 'No invoices this year.' } });
    expect(component.statementBusy()).toBe(false);
  });
});

/** Report Studio phase 7, the comparison month (RS-Q11): a platform administrator compares an issued document with Report Studio's copy. */
describe('BillingDocuments Report Studio comparison', () => {
  function screen(platform: boolean) {
    const api = {
      documents: vi.fn(() => of({ status: API_SUCCESS, data: [] })),
      studioComparisons: vi.fn(() => of({ status: API_SUCCESS, data: { comparisons: [
        { id: 2, tenantId: 2960, documentId: 7, kind: 'invoice', verdict: 'DIFFER', checked: 14, differences: { missing: ['0.76'] }, comparedAt: '' },
        { id: 1, tenantId: 2960, documentId: 7, kind: 'invoice', verdict: 'MATCH', checked: 15, differences: {}, comparedAt: '' }], byVerdict: {}, notYetCompared: 0 } })),
      studioCompare: vi.fn(() => of({ status: API_SUCCESS, data: { documentId: 7, kind: 'invoice', verdict: 'MATCH', checked: 15 } })),
    };
    const toast = { success: vi.fn(), error: vi.fn() };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: BillingApi, useValue: api }, { provide: ToastService, useValue: toast },
      { provide: ActivatedRoute, useValue: { queryParamMap: of(new Map()), paramMap: of(new Map()), snapshot: { queryParamMap: new Map() } } },
      { provide: WorkspacePicker, useValue: { tenantId: () => null, options: () => [], ready: (then: () => void) => then(), isPlatformAdmin: () => platform } },
    ] });
    const component = TestBed.runInInjectionContext(() => new BillingDocuments());
    return { component, api, toast };
  }

  it('keeps each document\'s newest verdict, and runs a comparison for invoices, credit notes and receipts only', () => {
    const { component, api, toast } = screen(true);
    component.load();
    const invoice = { documentId: 7, kind: 'invoice' } as never;
    expect(component.verdictOf(invoice)!.verdict).toBe('DIFFER');
    expect(component.comparable(invoice)).toBe(true);
    expect(component.comparable({ documentId: 8, kind: 'statement' } as never)).toBe(false);
    component.compare(invoice);
    expect(api.studioCompare).toHaveBeenCalledWith(7);
    expect(toast.success).toHaveBeenCalledWith('Report Studio\'s copy says the same (15 items checked).');
  });

  it('shows a workspace administrator nothing of it', () => {
    const { component, api } = screen(false);
    component.load();
    expect(api.studioComparisons).not.toHaveBeenCalled();
    expect(component.comparable({ documentId: 7, kind: 'invoice' } as never)).toBe(false);
  });
});

/** ZT-B6: a listed document whose file is gone from storage says so and what to do, in Billing's words (410), not "could not be read". */
describe('BillingDocuments preview of a file that is gone', () => {
  it('shows the refusal Billing gave for the blob it asked for', async () => {
    const said = 'The file of RCP-2026-10-0004 is no longer in storage. The payment and its receipt number stand; ask the platform for a copy.';
    const body = new Blob([JSON.stringify({ status: 'ERROR', message: said })], { type: 'application/json' });
    const api = {
      documents: vi.fn(() => of({ status: API_SUCCESS, data: [{ documentId: 110, kind: 'receipt', number: 'RCP-2026-10-0004', fileName: 'RCP-2026-10-0004.pdf', issuedAt: '2026-10-13T05:26:02Z', tenantId: 2960 }] })),
      documentBlob: vi.fn(() => new Subject<Blob>()),
    };
    const failed = new Subject<Blob>();
    api.documentBlob.mockReturnValue(failed);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: BillingApi, useValue: api }, { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: ActivatedRoute, useValue: { queryParamMap: of(new Map()), paramMap: of(new Map()), snapshot: { queryParamMap: new Map() } } },
      { provide: WorkspacePicker, useValue: { tenantId: () => null, options: () => [], ready: (then: () => void) => then(), isPlatformAdmin: () => false } },
    ] });
    const component = TestBed.runInInjectionContext(() => new BillingDocuments());
    component.load();
    expect(api.documentBlob).toHaveBeenCalledWith(110);
    failed.error({ status: 410, error: body });
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    expect(component.previewError()).toBe(said);
  });
});
