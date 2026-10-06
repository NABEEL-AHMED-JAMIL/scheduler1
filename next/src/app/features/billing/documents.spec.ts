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
